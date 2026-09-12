import { useState, useEffect, useRef } from 'react';
import { gateway } from '@/lib/gateway';
import { notificationsApi, profilesApi } from '@/api';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

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

let backgroundPollOwner = false;

export const useNotifications = () => {
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

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let pollInterval: ReturnType<typeof setInterval> | null = null;
    if (!backgroundPollOwner) {
      backgroundPollOwner = true;
      pollsOwned.current = true;
      pollInterval = setInterval(() => {
        if (document.visibilityState === 'visible') fetchNotifications();
      }, 15000);
    }
    const onFocus = () => fetchNotifications();
    window.addEventListener('focus', onFocus);

    // Set up realtime subscription
    const channel = gateway
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          fetchNotifications();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    fetchNotifications();

    return () => {
      gateway.removeChannel(channel);
      if (pollInterval) clearInterval(pollInterval);
      window.removeEventListener('focus', onFocus);
      if (pollsOwned.current) {
        backgroundPollOwner = false;
        pollsOwned.current = false;
      }
    };
  }, [user, retry]);

  const fetchNotifications = async () => {
    if (!user) return;

    try {
      if (!hasLoaded.current) setLoading(true);
      setError(null);

      const [{ data, error }, unread] = await Promise.all([
        notificationsApi.getNotifications(user.id, 20),
        notificationsApi.getUnreadCount(user.id),
      ]);

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
      console.error('Error fetching notifications:', error);
      setError(error?.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    if (!user) return;

    try {
      const { error } = await notificationsApi.markAsRead(notificationId);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(await notificationsApi.getUnreadCount(user.id));
    } catch (error: any) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;

    try {
      const { error } = await notificationsApi.markAllAsRead(user.id);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: true }))
      );
      setUnreadCount(await notificationsApi.getUnreadCount(user.id));

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
  };

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    refetch: fetchNotifications,
    refresh: () => setRetry((n) => n + 1),
  };
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
