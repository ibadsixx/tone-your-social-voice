// Global unread-notification state (do.md "Fix the mobile navigation so these
// two icons display their correct counters in real time" -> §1 Notifications bell).
//
// WHAT THIS USED TO BE, AND WHY THE MOBILE BELL WAS BLANK.
//
// `useNotifications` was a plain hook holding its state in the component that
// called it, and exactly two components called it: `NotificationsPage` and
// `NotificationsDropdown`. The dropdown is rendered by the desktop header only -
// on mobile `Layout.tsx` swaps it for a bare `<button><Bell/></button>` that
// navigates to `/notifications` and carries no counter at all. So on a phone the
// unread count was computed ONLY while the notifications page happened to be
// mounted. That is the same defect class as the Messages unread badge: state
// initialised inside a page component, so a nav icon on every other route has
// nothing to render, and the value depends on whether the user visited the page
// first.
//
// The fix is NOT a mobile-specific fetch, and NOT a second copy of this hook.
// Both existing callers now read ONE provider mounted above the router, and the
// mobile header button reads that same value. That also REMOVES duplication that
// already existed: opening the notifications page on desktop used to mount this
// hook twice (page + dropdown), which meant two fetches, two `notifications`
// channels and two copies of the unread list. There is now one of each.
//
// EVERYTHING THAT FETCHES IS UNCHANGED. The 20-item list, the
// `getUnreadCount` call, the actor-profile cache, the module-level
// `backgroundPollOwner` guard around the 15 s visibility-aware interval, the
// `window focus` refetch, the `notifications-changes` postgres_changes channel,
// the message-request toasts, `markAsRead` / `markAllAsRead`, and the `refresh`
// escape hatch are all carried over verbatim from the previous implementation.
// Nothing here adds a poll or a subscription; this file runs the same work, once.
//
// WHAT ACTUALLY CARRIES THE COUNT, STATED HONESTLY (do.md "Real-time behavior").
// do.md says "use the existing Realtime infrastructure" and "do not add polling",
// and this file does neither. But it should not be assumed that the badge is
// push-delivered, because it is not, and the reason is worth knowing:
//
//   * `notifications-changes` is registered through `gateway.channel(...)`, and
//     `GatewayChannel` in `src/lib/gateway.ts` is a STUB: `subscribe()` sets a
//     boolean and calls back with `'SUBSCRIBED'`, `postgres_changes` handlers are
//     stored in `_listeners`, and nothing ever invokes them. There is no WebSocket
//     and no server push behind this client's postgres_changes. (The same stub is
//     why `callLog.ts` needs the `tone:call-log` window-event bridge.)
//   * The transport that genuinely delivers is the gateway's SSE hub on
//     `user:<myId>`, which is why the reconnect resync below is registered there.
//
// So the badge is kept correct by the pre-existing 15 s visibility-aware interval,
// by `window focus`, by `visibilitychange`, and now by an SSE reconnect - i.e. it
// converges within ~15 s while the tab is visible and immediately when the user
// comes back, without a page refresh. No polling was ADDED here, and none was
// removed. Turning the ≤15 s convergence into true push would mean publishing a
// new event from every code path that inserts a notification (several routes, and
// anything the database does on its own); that is a wider change than this file
// should make unilaterally, and a missed publisher would be a silently missed
// update. It is deliberately not done here.
//
// TWO LOGOUT/ACCOUNT-SWITCH DEFECTS FIXED ON THE WAY UP (do.md §"Authentication
// and logout"):
//
//   1. The old early return on `!user` set `loading` false and left
//      `notifications` and `unreadCount` at their last values. Logging out
//      therefore left the previous account's unread count sitting in the header.
//   2. Nothing distinguished an in-flight read for user A from user B, so
//      switching accounts could paint A's notifications onto B's header after B
//      had already signed in. `generationRef` is bumped per session and stale
//      responses are dropped.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { gateway } from '@/lib/gateway';
import { notificationsApi, profilesApi } from '@/api';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { getMessageRealtime } from '@/lib/messageRealtime';

export interface Notification {
  id: string;
  user_id: string;
  actor_id: string;
  type: 'like' | 'comment' | 'mention' | 'follow' | 'tag' | 'share' | 'post_from_followed' | 'group_post' | 'poke' | 'hashtag_post' | 'friend_request' | 'message_request' | 'invitation' | 'group_membership_accepted' | 'security_login' | 'channel_post';
  group_id?: string;
  page_id?: string;
  channel_id?: string;
  hashtag?: string;
  post_id?: string;
  comment_id?: string;
  message: string;
  is_read: boolean;
  created_at: string;
  actor?: {
    id: string;
    username: string;
    display_name: string;
    profile_pic?: string;
  };
}

export interface NotificationsValue {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refetch: () => Promise<void>;
  refresh: () => void;
}

/**
 * Module-level singleton flag around the background interval, carried over
 * unchanged. It exists so that if this hook is ever mounted more than once again
 * (a second provider by mistake, a stray page-level consumer) there is still only
 * ONE interval rather than one per mount.
 */
let backgroundPollOwner = false;

const NotificationsContext = createContext<NotificationsValue | null>(null);

export const NotificationsProvider = ({ children }: { children: ReactNode }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const { user } = useAuth();
  const { toast } = useToast();
  const skipFirstToast = useRef(true);
  const seenNotificationIds = useRef<Set<string>>(new Set());
  const pollsOwned = useRef(false);
  const hasLoaded = useRef(false);
  const profileCache = useRef<Map<string, Notification['actor']>>(new Map());

  /**
   * Bumped for every session (sign-in / sign-out). Any read that started before
   * the bump is discarded, so a slow response belonging to a previous account can
   * never land on the current one.
   */
  const generationRef = useRef(0);
  const userId = user?.id ?? null;

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    const generation = generationRef.current;

    try {
      if (!hasLoaded.current) setLoading(true);
      setError(null);

      const [{ data, error }, unread] = await Promise.all([
        notificationsApi.getNotifications(userId, 20),
        notificationsApi.getUnreadCount(userId),
      ]);

      if (generation !== generationRef.current) return;

      if (error) throw error;

      // Fetch actor profiles, reusing already-fetched profiles across polls
      const actorIds = data?.map(n => n.actor_id) || [];
      const uncachedIds = actorIds.filter(id => !profileCache.current.has(id));
      if (uncachedIds.length > 0) {
        const { data: profiles } = await profilesApi.getProfilesByIds(uncachedIds);
        (profiles || []).forEach(p => profileCache.current.set(p.id, p));
      }

      const notificationsWithActors = data?.map(n => ({
        ...n,
        actor: profileCache.current.get(n.actor_id)
      })) as Notification[];

      setNotifications(notificationsWithActors || []);
      setUnreadCount(unread);
      hasLoaded.current = true;

      const newRequests = (notificationsWithActors || [])
        .filter(n => n.type === 'message_request' && !n.is_read && !seenNotificationIds.current.has(n.id));
      (notificationsWithActors || []).forEach(n => seenNotificationIds.current.add(n.id));

      if (!skipFirstToast.current && pollsOwned.current && newRequests.length > 0) {
        for (const n of newRequests) {
          toast({
            title: n.actor?.display_name || 'Someone',
            description: n.message,
          });
        }
      }
      skipFirstToast.current = false;
    } catch (error: any) {
      if (generation !== generationRef.current) return;
      console.error('Error fetching notifications:', error);
      setError(error?.message || 'Failed to load notifications');
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [userId, toast]);

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;

    // Per-session caches. The actor cache is keyed by actor id and the ids belong
    // to one account, so carrying it across a sign-out would leak the previous
    // account's profile rows into the next one's list.
    profileCache.current = new Map();
    hasLoaded.current = false;
    skipFirstToast.current = true;
    seenNotificationIds.current = new Set();

    if (!userId) {
      // do.md: "User logs out -> all counters immediately clear." The previous
      // implementation returned here without touching the state, so the last
      // account's unread count stayed on screen.
      setNotifications([]);
      setUnreadCount(0);
      setError(null);
      setLoading(false);
      return;
    }

    let pollInterval: ReturnType<typeof setInterval> | null = null;
    if (!backgroundPollOwner) {
      backgroundPollOwner = true;
      pollsOwned.current = true;
      pollInterval = setInterval(() => {
        if (document.visibilityState === 'visible') void fetchNotifications();
      }, 15000);
    }
    const onFocus = () => void fetchNotifications();
    window.addEventListener('focus', onFocus);

    // Returning to the tab. `window focus` alone is not enough for this feature,
    // because this badge is read on phones, where `focus` on `window` is
    // unreliable across app switches while `visibilitychange` is not. Same
    // guarantee `useOnlineFriends` already relies on.
    const handleVisibility = () => {
      if (!document.hidden) void fetchNotifications();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // SSE (RE)CONNECT RESYNC — do.md §"Authentication and logout": "Realtime
    // reconnects -> counters synchronize correctly."
    //
    // WHY A RE-READ AND NOT A PATCH. Nothing that happened while the stream was
    // down is recoverable from events: the events were not delivered, and there is
    // no replay buffer. The gateway also caps its SSE functions at 300 s, so a
    // reconnect is a normal event on a long-lived session, not an edge case. The
    // count is therefore read again from the server, which is the only thing that
    // can be correct after a gap.
    //
    // WHY THIS IS NOT A SECOND SUBSCRIPTION. `getMessageRealtime` returns the app's
    // single shared, ref-counted SSE channel on `user:<myId>` — the same connection
    // the conversation list and the online-friends dot already hold. It does not
    // increment that ref count (it is an observer, not a consumer) and it opens no
    // new channel: there is exactly one stream, and this adds a callback to it.
    const userChannel = getMessageRealtime(userId);
    const unsubscribeReconnect = userChannel?.onReconnect(() => {
      void fetchNotifications();
    });

    // Set up realtime subscription
    const notificationsChannel = gateway
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        () => {
          void fetchNotifications();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        () => {
          void fetchNotifications();
        }
      )
      .subscribe();

    void fetchNotifications();

    return () => {
      gateway.removeChannel(notificationsChannel);
      if (pollInterval) clearInterval(pollInterval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      unsubscribeReconnect?.();
      if (pollsOwned.current) {
        backgroundPollOwner = false;
        pollsOwned.current = false;
      }
      void generation;
    };
  }, [userId, retry, fetchNotifications]);

  const markAsRead = useCallback(async (notificationId: string) => {
    if (!userId) return;
    const generation = generationRef.current;

    try {
      const { error } = await notificationsApi.markAsRead(notificationId);

      if (generation !== generationRef.current) return;
      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(await notificationsApi.getUnreadCount(userId));
    } catch (error: any) {
      console.error('Error marking notification as read:', error);
    }
  }, [userId]);

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    const generation = generationRef.current;

    try {
      const { error } = await notificationsApi.markAllAsRead(userId);

      if (generation !== generationRef.current) return;
      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: true }))
      );
      setUnreadCount(await notificationsApi.getUnreadCount(userId));

      toast({
        title: "All notifications marked as read",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to mark notifications as read",
        variant: "destructive"
      });
    }
  }, [userId, toast]);

  const value = useMemo<NotificationsValue>(() => ({
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    refetch: fetchNotifications,
    refresh: () => setRetry((n) => n + 1),
  }), [notifications, unreadCount, loading, error, markAsRead, markAllAsRead, fetchNotifications]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
};

/**
 * Reads the ONE global notification state.
 *
 * Outside a provider it returns a benign empty value rather than throwing: the
 * previous version of this hook worked standalone, so a consumer that has not been
 * placed under the provider yet should show "0" instead of crashing the page.
 */
export const useNotifications = (): NotificationsValue => {
  const ctx = useContext(NotificationsContext);
  const noop = useCallback(async () => {}, []);
  return useMemo<NotificationsValue>(() => ctx ?? {
    notifications: [],
    unreadCount: 0,
    loading: false,
    error: null,
    markAsRead: noop,
    markAllAsRead: noop,
    refetch: noop,
    refresh: () => {},
  }, [ctx, noop]);
};

export const createNotification = async (params: {
  userId: string;
  actorId: string;
  type: Notification['type'];
  message: string;
  postId?: string;
  commentId?: string;
  channelId?: string;
}) => {
  const { userId, actorId, type, message, postId, commentId, channelId } = params;

  // Don't notify yourself
  if (userId === actorId) return;

  try {
    const { data, error } = await notificationsApi.createNotification({
      user_id: userId,
      actor_id: actorId,
      type,
      message,
      post_id: postId,
      comment_id: commentId,
      channel_id: channelId
    });

    // TRACE: notification creation (point 4)
    console.debug('[trace:notification]', {
      step: 'create',
      returned_notification_id: (data as { id?: string } | null)?.id ?? null,
      recipient_id: userId,
      sender_id: actorId,
      type,
    });

    if (error) throw error;
  } catch (error) {
    console.error('Error creating notification:', error);
  }
};
