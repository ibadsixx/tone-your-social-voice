import { useState, useEffect } from 'react';
import { blockingApi } from '@/api';
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
      const { isBlocked, isBlockedBy } = await blockingApi.getBlockStatus(currentUserId, profileId);

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
      const { error } = await blockingApi.blockUser(currentUserId, profileId, blockType);

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
      const { error } = await blockingApi.unblockUser(currentUserId, profileId);

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
