import { useState, useEffect } from 'react';
import { postsApi } from '@/api';
import { isPostVisibleToViewer, loadFriendIds } from '@/lib/postVisibility';
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
  visibility?: string | null;
  status?: string | null;
  audience_user_ids?: string[];
  audience_excluded_user_ids?: string[];
  audience_list_id?: string;
  feeling_activity_type?: string | null;
  feeling_activity_emoji?: string | null;
  feeling_activity_text?: string | null;
  feeling_activity_target_text?: string | null;
  feeling_activity_target_id?: string | null;
  location_id?: string | null;
  location_name?: string | null;
  location_address?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_provider?: string | null;
  profiles: {
    username: string;
    display_name: string;
    profile_pic: string | null;
  };
  shared_post?: {
    id: string;
    content: string | null;
    media_url: string | null;
    media_type?: string | null;
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

export const usePost = (postId?: string) => {
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchPost = async () => {
    if (!postId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setNotFound(false);

      const { data, error } = await postsApi.getPostById(postId);

      if (error) throw error;

      // Defense in depth for the direct `/post/:id` surface, which previously
      // applied no audience check at all. The Gateway now refuses a row the
      // viewer may not see (404) and the RLS policy enforces it for direct
      // Supabase reads; this keeps a friends-only post from rendering if any
      // other caller ever returns the row. An unauthorized post is reported as
      // not found so the page does not confirm that a private post exists.
      const viewerId = user?.id || '';
      const friendIds = await loadFriendIds(viewerId);
      if (data && !isPostVisibleToViewer(data, viewerId, friendIds)) {
        setNotFound(true);
        setPost(null);
      } else if (!data) {
        setNotFound(true);
        setPost(null);
      } else {
        const postWithTypedMedia = {
          ...data,
          media_type: data.media_type as 'image' | 'video' | null,
          shared_post: data.shared_post
        };
        setPost(postWithTypedMedia);
      }
    } catch (error: any) {
      console.error('Error fetching post:', error);
      toast({
        title: 'Error',
        description: 'Failed to load post',
        variant: 'destructive'
      });
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPost();
  }, [postId, user?.id]);

  return {
    post,
    loading,
    notFound,
    refetch: fetchPost
  };
};
