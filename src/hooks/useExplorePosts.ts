import { useState, useEffect, useCallback } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';

interface ExplorePost {
  id: string;
  user_id: string;
  content: string | null;
  media_url: string | null;
  created_at: string;
  type: 'normal_post' | 'profile_picture_update' | 'cover_photo_update' | 'shared_post' | 'reel';
  profiles: {
    username: string;
    display_name: string;
    profile_pic: string | null;
  };
  likes?: { count: number }[];
  comments?: { count: number }[];
}

export const useExplorePosts = () => {
  const [posts, setPosts] = useState<ExplorePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const { toast } = useToast();

  const POSTS_PER_PAGE = 20;

  const fetchPosts = useCallback(async (resetPosts = false) => {
    try {
      setLoading(true);
      const currentOffset = resetPosts ? 0 : offset;
      
      const { data, error } = await gateway
        .from('posts')
        .select(`
          *,
          profiles!posts_user_id_fkey (
            username,
            display_name,
            profile_pic
          ),
          likes (count),
          comments (count)
        `)
        .not('media_url', 'is', null) // Only posts with media for explore
        .order('created_at', { ascending: false })
        .range(currentOffset, currentOffset + POSTS_PER_PAGE - 1);

      if (error) throw error;

      const newPosts = data || [];
      
      setError(null);
      if (resetPosts) {
        setPosts(newPosts);
        setOffset(POSTS_PER_PAGE);
      } else {
        setPosts(prev => [...prev, ...newPosts]);
        setOffset(prev => prev + POSTS_PER_PAGE);
      }
      
      setHasMore(newPosts.length === POSTS_PER_PAGE);
    } catch (error: any) {
      setError(error?.message || 'Failed to load posts');
      toast({
        title: 'Error',
        description: 'Failed to load posts',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [offset, toast]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchPosts(false);
    }
  }, [fetchPosts, loading, hasMore]);

  const refresh = useCallback(() => {
    setOffset(0);
    fetchPosts(true);
  }, [fetchPosts]);

  useEffect(() => {
    fetchPosts(true);
  }, []);

  return {
    posts,
    loading,
    hasMore,
    error,
    loadMore,
    refresh
  };
};