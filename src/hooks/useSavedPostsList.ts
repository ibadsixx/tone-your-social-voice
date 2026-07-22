import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface Post {
  id: string;
  user_id: string;
  content: string | null;
  media_url: string | null;
  media_type?: 'image' | 'video' | null;
  created_at: string;
  type: 'normal_post' | 'profile_picture_update' | 'cover_photo_update' | 'shared_post' | 'reel';
  shared_post_id?: string | null;
  audience_type?: string;
  feeling_activity_type?: string | null;
  feeling_activity_emoji?: string | null;
  feeling_activity_text?: string | null;
  feeling_activity_target_text?: string | null;
  location_name?: string | null;
  location_address?: string | null;
  profiles: {
    username: string;
    display_name: string;
    profile_pic: string | null;
  };
  shared_post?: {
    id: string;
    content: string | null;
    media_url: string | null;
    media_type?: 'image' | 'video' | null;
    type: string;
    created_at: string;
    profiles: {
      username: string;
      display_name: string;
      profile_pic: string | null;
    };
  } | null;
  likes?: { id: string; user_id: string }[];
  comments?: { id: string; content: string; profiles: { display_name: string } }[];
}

export const useSavedPostsList = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchSavedPosts = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await gateway
        .from('saved_posts')
        .select(`
          created_at,
          posts:post_id (
            *,
            profiles!posts_user_id_fkey (
              username,
              display_name,
              profile_pic
            ),
            shared_post:shared_post_id (
              id,
              content,
              media_url,
              media_type,
              type,
              created_at,
              profiles!posts_user_id_fkey (
                username,
                display_name,
                profile_pic
              )
            ),
            likes (
              id,
              user_id
            ),
            comments (
              id,
              content,
              profiles (
                display_name
              )
            )
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Extract posts from the nested structure and map types
      const savedPosts = (data || [])
        .map((item: any) => item.posts)
        .filter((post: any) => post !== null)
        .map((post: any) => ({
          ...post,
          media_type: post.media_type as 'image' | 'video' | null,
          shared_post: post.shared_post
        }));

      setPosts(savedPosts);
    } catch (error: any) {
      console.error('Error fetching saved posts:', error);
      toast({
        title: 'Error',
        description: 'Failed to load saved posts',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSavedPosts();
  }, [user]);

  return {
    posts,
    loading,
    refetch: fetchSavedPosts
  };
};
