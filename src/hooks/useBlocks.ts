import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';

interface BlockStatus {
  isBlocked: boolean;
  isBlockedBy: boolean;
  loading: boolean;
}

export const useBlocks = (profileId: string, currentUserId?: string) => {
  const [blockStatus, setBlockStatus] = useState<BlockStatus>({
    isBlocked: false,
    isBlockedBy: false,
    loading: true,
  });
  const { toast } = useToast();

  const fetchBlockStatus = async () => {
    if (!currentUserId || !profileId || currentUserId === profileId) {
      setBlockStatus(prev => ({ ...prev, loading: false }));
      return;
    }

    try {
      const { data, error } = await gateway
        .from('blocks')
        .select('*')
        .or(`and(blocker_id.eq.${currentUserId},blocked_id.eq.${profileId}),and(blocker_id.eq.${profileId},blocked_id.eq.${currentUserId})`);

      if (error) throw error;

      const isBlocked = data?.some(block => block.blocker_id === currentUserId) || false;
      const isBlockedBy = data?.some(block => block.blocker_id === profileId) || false;

      setBlockStatus({
        isBlocked,
        isBlockedBy,
        loading: false,
      });
    } catch (error: any) {
      console.error('Error fetching block status:', error);
      setBlockStatus(prev => ({ ...prev, loading: false }));
    }
  };

  const blockUser = async (blockType: 'messaging' | 'full' = 'full') => {
    if (!currentUserId || !profileId) return;

    try {
      const { error } = await gateway.rpc('block_user', {
        p_blocker: currentUserId,
        p_blocked: profileId,
        p_block_type: blockType
      });

      if (error) throw error;

      setBlockStatus(prev => ({
        ...prev,
        isBlocked: true,
      }));

      toast({
        title: 'User blocked',
        description: 'User has been blocked successfully.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to block user.',
        variant: 'destructive',
      });
    }
  };

  const unblockUser = async () => {
    if (!currentUserId || !profileId) return;

    try {
      const { error } = await gateway
        .from('blocks')
        .delete()
        .eq('blocker_id', currentUserId)
        .eq('blocked_id', profileId);

      if (error) throw error;

      setBlockStatus(prev => ({
        ...prev,
        isBlocked: false,
      }));

      toast({
        title: 'User unblocked',
        description: 'User has been unblocked successfully.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to unblock user.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    fetchBlockStatus();
  }, [currentUserId, profileId]);

  return {
    blockStatus,
    blockUser,
    unblockUser,
    refetch: fetchBlockStatus,
  };
};