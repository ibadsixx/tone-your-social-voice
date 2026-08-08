import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { blockingApi } from '@/api';
import { useToast } from '@/hooks/use-toast';

interface FriendshipStatus {
  id: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | null;
  isSender: boolean;
  loading: boolean;
}

export const useFriendship = (profileId: string, currentUserId?: string) => {
  const [friendship, setFriendship] = useState<FriendshipStatus>({
    id: null,
    status: null,
    isSender: false,
    loading: true,
  });
  const { toast } = useToast();

  const fetchFriendship = async () => {
    if (!currentUserId || !profileId || currentUserId === profileId) {
      setFriendship(prev => ({ ...prev, loading: false }));
      return;
    }

    try {
      // Check if users are blocked first
      const { isBlocked, isBlockedBy } = await blockingApi.getBlockStatus(currentUserId, profileId);

      if (isBlocked || isBlockedBy) {
        // Users are blocked, don't show friendship options
        setFriendship({
          id: null,
          status: null,
          isSender: false,
          loading: false,
        });
        return;
      }

      const { data, error } = await gateway
        .from('friends')
        .select('*')
        .or(`and(requester_id.eq.${currentUserId},receiver_id.eq.${profileId}),and(requester_id.eq.${profileId},receiver_id.eq.${currentUserId})`)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setFriendship({
          id: data.id,
          status: data.status.toUpperCase() as 'PENDING' | 'ACCEPTED' | 'REJECTED',
          isSender: data.requester_id === currentUserId,
          loading: false,
        });
      } else {
        setFriendship({
          id: null,
          status: null,
          isSender: false,
          loading: false,
        });
      }
    } catch (error: any) {
      console.error('Error fetching friendship:', error);
      setFriendship(prev => ({ ...prev, loading: false }));
    }
  };

  const sendRequest = async () => {
    if (!currentUserId || !profileId) return;

    try {
      // Insert friendship request
      const { data: friendshipData, error: friendshipError } = await gateway
        .from('friends')
        .insert({
          requester_id: currentUserId,
          receiver_id: profileId,
          status: 'pending'
        })
        .select()
        .single();

      if (friendshipError) throw friendshipError;

      // Insert follow relationship
      const { error: followError } = await gateway
        .from('followers')
        .insert({
          follower_id: currentUserId,
          following_id: profileId
        });

      if (followError && followError.code !== '23505') { // Ignore unique constraint violations
        throw followError;
      }

      setFriendship({
        id: friendshipData.id,
        status: 'PENDING',
        isSender: true,
        loading: false,
      });

      toast({
        title: 'Friend request sent',
        description: 'Your friend request has been sent successfully.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to send friend request.',
        variant: 'destructive',
      });
    }
  };

  const cancelRequest = async () => {
    if (!friendship.id) return;

    try {
      const { error } = await gateway
        .from('friends')
        .delete()
        .eq('id', friendship.id);

      if (error) throw error;

      setFriendship({
        id: null,
        status: null,
        isSender: false,
        loading: false,
      });

      toast({
        title: 'Friend request cancelled',
        description: 'Your friend request has been cancelled.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to cancel friend request.',
        variant: 'destructive',
      });
    }
  };

  const acceptRequest = async () => {
    if (!friendship.id) return;

    try {
      const { error } = await gateway
        .from('friends')
        .update({ status: 'accepted' })
        .eq('id', friendship.id);

      if (error) throw error;

      setFriendship(prev => ({
        ...prev,
        status: 'ACCEPTED',
      }));

      toast({
        title: 'Friend request accepted',
        description: 'You are now friends!',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to accept friend request.',
        variant: 'destructive',
      });
    }
  };

  const rejectRequest = async () => {
    if (!friendship.id) return;

    try {
      const { error } = await gateway
        .from('friends')
        .update({ status: 'rejected' })
        .eq('id', friendship.id);

      if (error) throw error;

      setFriendship(prev => ({
        ...prev,
        status: 'REJECTED',
      }));

      toast({
        title: 'Friend request rejected',
        description: 'Friend request has been rejected.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to reject friend request.',
        variant: 'destructive',
      });
    }
  };

  const unfriend = async () => {
    if (!friendship.id) return;

    try {
      const { error } = await gateway
        .from('friends')
        .delete()
        .eq('id', friendship.id);

      if (error) throw error;

      setFriendship({
        id: null,
        status: null,
        isSender: false,
        loading: false,
      });

      toast({
        title: 'Friendship ended',
        description: 'You are no longer friends.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to unfriend.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    fetchFriendship();
  }, [currentUserId, profileId]);

  return {
    friendship,
    sendRequest,
    cancelRequest,
    acceptRequest,
    rejectRequest,
    unfriend,
    refetch: fetchFriendship,
  };
};