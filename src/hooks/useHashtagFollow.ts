import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export const useHashtagFollow = (hashtagTag: string) => {
  const { user } = useAuth();
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hashtagId, setHashtagId] = useState<string | null>(null);

  useEffect(() => {
    const checkFollowStatus = async () => {
      if (!user || !hashtagTag) {
        setLoading(false);
        return;
      }

      try {
        // First get the hashtag ID
        const { data: hashtagData } = await gateway
          .from('hashtags' as any)
          .select('id')
          .eq('tag', hashtagTag.toLowerCase())
          .single();

        if (!hashtagData) {
          setLoading(false);
          return;
        }

        setHashtagId((hashtagData as any).id);

        // Check if user is following this hashtag
        const { data } = await gateway
          .from('hashtag_follows' as any)
          .select('id')
          .eq('user_id', user.id)
          .eq('hashtag_id', (hashtagData as any).id)
          .single();

        setIsFollowing(!!data);
      } catch (error) {
        console.error('Error checking follow status:', error);
      } finally {
        setLoading(false);
      }
    };

    checkFollowStatus();
  }, [user, hashtagTag]);

  const toggleFollow = async () => {
    if (!user || !hashtagId) {
      toast.error('Please log in to follow hashtags');
      return;
    }

    try {
      if (isFollowing) {
        // Unfollow
        const { error } = await gateway
          .from('hashtag_follows' as any)
          .delete()
          .eq('user_id', user.id)
          .eq('hashtag_id', hashtagId);

        if (error) throw error;

        setIsFollowing(false);
        toast.success('Unfollowed hashtag');
      } else {
        // Follow
        const { error } = await gateway
          .from('hashtag_follows' as any)
          .insert({
            user_id: user.id,
            hashtag_id: hashtagId,
          });

        if (error) throw error;

        setIsFollowing(true);
        toast.success('Following hashtag');
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
      toast.error('Failed to update follow status');
    }
  };

  return { isFollowing, loading, toggleFollow };
};
