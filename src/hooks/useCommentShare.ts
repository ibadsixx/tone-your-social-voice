import { useState } from 'react';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

type ShareType = 'copy_link' | 'share_to_feed' | 'share_via_message';

export const useCommentShare = () => {
  const { user } = useAuth();
  const [isSharing, setIsSharing] = useState(false);

  const logShare = async (
    commentId: string,
    type: ShareType,
    sharedTo?: string,
    sharedPostId?: string
  ) => {
    if (!user) return;

    try {
      const { error } = await gateway
        .from('comment_shares')
        .insert({
          comment_id: commentId,
          shared_by: user.id,
          shared_to: sharedTo || null,
          shared_post_id: sharedPostId || null,
          type,
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error logging share:', error);
    }
  };

  const copyLink = async (commentId: string, postId: string) => {
    setIsSharing(true);
    try {
      const url = `${window.location.origin}/post/${postId}#comment-${commentId}`;
      await navigator.clipboard.writeText(url);
      await logShare(commentId, 'copy_link');
      toast({
        title: '🔗 Link copied!',
        description: 'Comment link copied to clipboard',
      });
    } catch (error) {
      toast({
        title: 'Failed to copy',
        description: 'Could not copy link to clipboard',
        variant: 'destructive',
      });
    } finally {
      setIsSharing(false);
    }
  };

  const shareToFeed = async (commentId: string, commentContent: string) => {
    setIsSharing(true);
    try {
      await logShare(commentId, 'share_to_feed');
      // Return the content to be used in the post creation
      return commentContent;
    } catch (error) {
      toast({
        title: 'Failed to share',
        description: 'Could not prepare share',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsSharing(false);
    }
  };

  const shareViaMessage = async (commentId: string, commentContent: string) => {
    setIsSharing(true);
    try {
      await logShare(commentId, 'share_via_message');
      return commentContent;
    } catch (error) {
      toast({
        title: 'Failed to share',
        description: 'Could not prepare message',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsSharing(false);
    }
  };

  const getShareCount = async (commentId: string): Promise<number> => {
    try {
      const { count, error } = await gateway
        .from('comment_shares')
        .select('*', { count: 'exact', head: true })
        .eq('comment_id', commentId);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error getting share count:', error);
      return 0;
    }
  };

  return {
    isSharing,
    copyLink,
    shareToFeed,
    shareViaMessage,
    getShareCount,
  };
};
