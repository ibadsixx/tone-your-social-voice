import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { notificationsApi, profilesApi } from '@/api';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export interface Notification {
  id: string;
  user_id: string;
  actor_id: string;
  type: 'like' | 'comment' | 'mention' | 'follow' | 'tag' | 'share' | 'post_from_followed' | 'group_post' | 'poke' | 'hashtag_post' | 'friend_request' | 'message_request' | 'invitation' | 'group_membership_accepted' | 'security_login';
  group_id?: string;
  page_id?: string;
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

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    fetchNotifications();
    
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

    return () => {
      gateway.removeChannel(channel);
    };
  }, [user, retry]);

  const fetchNotifications = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const { data, error } = await notificationsApi.getNotifications(user.id, 20);

      if (error) throw error;

      // Fetch actor profiles separately
      const actorIds = data?.map(n => n.actor_id) || [];
      const { data: profiles } = await profilesApi.getProfilesByIds(actorIds);

      const profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);
      
      const notificationsWithActors = data?.map(n => ({
        ...n,
        actor: profilesMap.get(n.actor_id)
      })) as Notification[];

      setNotifications(notificationsWithActors || []);
      setUnreadCount(notificationsWithActors?.filter(n => !n.is_read).length || 0);
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
      setUnreadCount(prev => Math.max(0, prev - 1));
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
      setUnreadCount(0);

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
}) => {
  const { userId, actorId, type, message, postId, commentId } = params;

  // Don't notify yourself
  if (userId === actorId) return;

  try {
    const { error } = await notificationsApi.createNotification({
      user_id: userId,
      actor_id: actorId,
      type,
      message,
      post_id: postId,
      comment_id: commentId
    });

    if (error) throw error;
  } catch (error) {
    console.error('Error creating notification:', error);
  }
};
