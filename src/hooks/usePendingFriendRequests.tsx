// Global pending friend-request state (do.md "Fix the mobile navigation so these
// two icons display their correct counters in real time" -> §2 Friend Requests).
//
// WHY THE MOBILE ICON HAD NO COUNT. There was never any global state for friend
// requests at all. `FriendRequestsDropdown` (desktop header) and
// `FriendRequestsPage` (/friends/requests) each ran their OWN copy of the same
// pending-incoming query and held their OWN `requests` state, and each had its own
// accept/reject handler that mutated that local array. On mobile the dropdown is
// not rendered - `Layout.tsx` swaps it for a bare `<button><UserPlus/></button>`
// that just navigates - and the page mounts only when opened. So the pending
// count existed nowhere else in the app: a phone could not show it, and the
// desktop badge was correct only by accident, because the desktop happens to
// render the component that owns the copy.
//
// TWO BUGS FIXED BY CONSOLIDATING, not by adding a second system:
//
//   1. THE TWO COPIES COULD DISAGREE. Accepting a request in the dropdown removed
//      it from the dropdown's array only; `/friends/requests` kept showing it
//      until its own next fetch. Now one array, so the badge, the dropdown and the
//      page all drop the row in the same tick.
//   2. THE COUNT WAS NEVER CLEARED ON SIGN-OUT, and nothing guarded against an
//      in-flight read for a previous account landing on a new one. do.md requires
//      both; `generationRef` and the reset below provide them.
//
// THE COUNT IS THE ACTUAL NUMBER OF PENDING INCOMING REQUESTS, not the number of
// notifications those requests generated (do.md is explicit about this, and the two
// are genuinely different: one `friend_request` notification is written per request,
// but a request can also be accepted on another device, or the notification marked
// read, and neither changes the pending count). So this reads the `friends` table
// directly rather than the notifications list.
//
// REUSED, NOT ADDED. The refresh machinery is the app's existing
// `useFriendRequestLiveUpdates` - the same module-level-singleton 15 s
// visibility-aware interval, the same `window focus` refetch and the same
// `tone:friend-request-sent` event the dropdown and page already used. This file
// mounts that hook exactly once, for the whole session. No new poll, no new
// subscription, no per-render request.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useFriendRequestLiveUpdates } from '@/hooks/useFriendRequestLiveUpdates';
import { getMessageRealtime } from '@/lib/messageRealtime';

export interface PendingFriendRequest {
  id: string;
  requester_id: string;
  requester: {
    display_name: string;
    username: string;
    profile_pic: string | null;
  } | null;
  created_at: string;
}

export interface PendingFriendRequestsValue {
  /** Pending INCOMING requests, newest first. The badge renders `requests.length`. */
  requests: PendingFriendRequest[];
  count: number;
  loading: boolean;
  /** Id of the request an accept/reject is in flight for, or null. */
  actionLoading: string | null;
  refresh: (silent?: boolean) => Promise<void>;
  accept: (requestId: string) => Promise<void>;
  reject: (requestId: string) => Promise<void>;
}

const PendingFriendRequestsContext = createContext<PendingFriendRequestsValue | null>(null);

export const PendingFriendRequestsProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<PendingFriendRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const userId = user?.id ?? null;

  /**
   * Bumped per session. A read started for a previous account is discarded rather
   * than applied to the account that is signed in now.
   */
  const generationRef = useRef(0);

  const refresh = useCallback(async (silent = false) => {
    if (!userId) return;
    const generation = generationRef.current;
    if (!silent) setLoading(true);
    try {
      const { data, error } = await gateway
        .from('friends')
        .select(`
          id,
          requester_id,
          created_at,
          requester:profiles!friends_requester_id_fkey(
            display_name,
            username,
            profile_pic
          )
        `)
        .eq('receiver_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (generation !== generationRef.current) return;
      if (error) throw error;
      setRequests((data || []) as PendingFriendRequest[]);
    } catch (error: any) {
      if (generation !== generationRef.current) return;
      console.error('Error fetching friend requests:', error);
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    generationRef.current += 1;
    if (!userId) {
      // do.md: "User logs out -> all counters immediately clear."
      setRequests([]);
      setActionLoading(null);
      setLoading(false);
    }
  }, [userId]);

  // The app's existing live-update hook: immediate first fetch, then the shared
  // 15 s visible-only interval, `window focus`, and `tone:friend-request-sent`.
  // Mounted once here, for the whole session.
  useFriendRequestLiveUpdates(() => void refresh(true), userId);

  /**
   * SSE (RE)CONNECT RESYNC — do.md §"Authentication and logout": "Realtime
   * reconnects -> counters synchronize correctly."
   *
   * Friend requests have no realtime event of their own: there is nothing on the
   * wire to subscribe to, which is exactly why the shared 15 s interval exists.
   * A reconnect is still worth reacting to, because it is the moment the app can
   * be certain its last answer is stale — the interval is visibility-gated, so a
   * backgrounded tab may have skipped every tick since the stream dropped.
   *
   * `getMessageRealtime` returns the app's single shared, ref-counted SSE channel
   * on `user:<myId>`, the same connection the conversation list, the
   * online-friends dot and the notifications badge already observe. It does not
   * increment the ref count and opens no new channel, so this is a callback on an
   * existing stream, not a subscription of its own.
   */
  useEffect(() => {
    if (!userId) return;
    const userChannel = getMessageRealtime(userId);
    const unsubscribeReconnect = userChannel?.onReconnect(() => {
      void refresh(true);
    });
    return () => {
      unsubscribeReconnect?.();
    };
  }, [userId, refresh]);

  /**
   * The row is removed only AFTER the server confirms the write, which is what the
   * dropdown and the page both did. Optimistic removal would hide a request whose
   * update actually failed.
   */
  const setStatus = useCallback(async (
    requestId: string,
    status: 'accepted' | 'rejected',
    success: { title: string; description?: string },
    failure: string
  ) => {
    setActionLoading(requestId);
    const generation = generationRef.current;
    try {
      const { data, error } = await gateway
        .from('friends')
        .update({ status })
        .eq('id', requestId)
        .select()
        .single();

      if (generation !== generationRef.current) return;

      if (error) throw error;
      if (!data) throw new Error(`Request could not be ${status}`);

      setRequests(prev => prev.filter(r => r.id !== requestId));
      toast(success);
    } catch (error: any) {
      console.error(`[${status}] failed:`, error?.message, error?.code, error?.details);
      toast({
        title: 'Error',
        description: failure,
        variant: 'destructive',
      });
    } finally {
      if (generation === generationRef.current) setActionLoading(null);
    }
  }, [toast]);

  const accept = useCallback((requestId: string) => setStatus(
    requestId,
    'accepted',
    { title: 'Friend request accepted', description: 'You are now friends!' },
    'Failed to accept friend request.'
  ), [setStatus]);

  const reject = useCallback((requestId: string) => setStatus(
    requestId,
    'rejected',
    { title: 'Friend request rejected' },
    'Failed to reject friend request.'
  ), [setStatus]);

  const value = useMemo<PendingFriendRequestsValue>(() => ({
    requests,
    count: requests.length,
    loading,
    actionLoading,
    refresh,
    accept,
    reject,
  }), [requests, loading, actionLoading, refresh, accept, reject]);

  return (
    <PendingFriendRequestsContext.Provider value={value}>
      {children}
    </PendingFriendRequestsContext.Provider>
  );
};

const noopAsync = async () => {};

/**
 * Reads the ONE global pending-request state. Outside a provider it reports an
 * empty set, so a consumer not yet placed under the provider renders no badge
 * rather than crashing.
 */
export const usePendingFriendRequests = (): PendingFriendRequestsValue => {
  const ctx = useContext(PendingFriendRequestsContext);
  return useMemo<PendingFriendRequestsValue>(() => ctx ?? {
    requests: [],
    count: 0,
    loading: false,
    actionLoading: null,
    refresh: noopAsync,
    accept: noopAsync,
    reject: noopAsync,
  }, [ctx]);
};
