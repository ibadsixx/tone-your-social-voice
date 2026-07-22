import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';
import { createNotification } from '@/hooks/useNotifications';

interface FollowStatus {
  id: string | null;
  isFollowing: boolean;
  loading: boolean;
}

export const useFollow = (profileId: string, currentUserId?: string) => {
  const [followStatus, setFollowStatus] = useState<FollowStatus>({
    id: null,
    isFollowing: false,
    loading: true,
  });
  const { toast } = useToast();

  const fetchFollowStatus = async () => {
    if (!currentUserId || !profileId || currentUserId === profileId) {
      setFollowStatus(prev => ({ ...prev, loading: false }));
      return;
    }

    try {
      const { data, error } = await gateway
        .from('followers')
        .select('*')
        .eq('follower_id', currentUserId)
        .eq('following_id', profileId)
        .maybeSingle();

      if (error) throw error;

      setFollowStatus({
        id: data?.id || null,
        isFollowing: !!data,
        loading: false,
      });
    } catch (error: any) {
      console.error('Error fetching follow status:', error);
      setFollowStatus(prev => ({ ...prev, loading: false }));
    }
  };

  const follow = async () => {
    if (!currentUserId || !profileId) return;

    try {
      const { data, error } = await gateway
        .from('followers')
        .insert({
          follower_id: currentUserId,
          following_id: profileId
        })
        .select()
        .single();

      if (error) throw error;

      setFollowStatus({
        id: data.id,
        isFollowing: true,
        loading: false,
      });

      // Create notification for the followed user
      await createNotification({
        userId: profileId,
        actorId: currentUserId,
        type: 'follow',
        message: 'started following you'
      });

      toast({
        title: 'Following',
        description: 'You are now following this user.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to follow user.',
        variant: 'destructive',
      });
    }
  };

  const unfollow = async () => {
    if (!followStatus.id) return;

    try {
      const { error } = await gateway
        .from('followers')
        .delete()
        .eq('id', followStatus.id);

      if (error) throw error;

      setFollowStatus({
        id: null,
        isFollowing: false,
        loading: false,
      });

      toast({
        title: 'Unfollowed',
        description: 'You are no longer following this user.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to unfollow user.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    fetchFollowStatus();
  }, [currentUserId, profileId]);

  return {
    followStatus,
    follow,
    unfollow,
    refetch: fetchFollowStatus,
  };
};