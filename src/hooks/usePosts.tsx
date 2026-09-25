import { useState, useEffect, useCallback } from 'react';
import { postsApi } from '@/api';
import { isPostVisibleToViewer, loadFriendIds } from '@/lib/postVisibility';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { POST_CREATED_EVENT } from '@/hooks/useHomeFeed';

interface Post {
  id: string;
  user_id: string;
  content: string | null;
  media_url: string | null;
  media_type?: 'image' | 'video' | null;
  created_at: string;
  type: 'normal_post' | 'profile_picture_update' | 'cover_photo_update' | 'shared_post' | 'reel';
  shared_post_id?: string | null;
  audience_type?: string | null;
  audience_user_ids?: string[] | null;
  audience_excluded_user_ids?: string[] | null;
  visibility?: string | null;
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
}

// Audience filtering lives in the canonical @/lib/postVisibility module, shared
// with the home feed, Explore and the Gateway-side evaluator.

export const usePosts = (userId?: string) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchPosts = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await postsApi.getUserPosts(userId);

      if (error) throw error;

      const postsWithTypedMedia = (data || []).map(post => ({
        ...post,
        media_type: post.media_type as 'image' | 'video' | null,
        shared_post: post.shared_post
      }));

      // Audience filtering uses the canonical @/lib/postVisibility module and
      // runs for EVERY viewer, not just "another user while signed in". The
      // owner is allowed through by the owner bypass and a guest only sees
      // public content, so removing the old `user && user.id !== userId` guard
      // cannot hide the owner's own posts and no longer skips the check when
      // logged out. The Gateway enforces the same rule server-side; this is the
      // defense-in-depth layer.
      const viewerId = user?.id || '';
      const friendIds = await loadFriendIds(viewerId);
      setPosts(postsWithTypedMedia.filter(p => isPostVisibleToViewer(p, viewerId, friendIds)));
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to load posts',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [userId, user, toast]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Refresh when any surface dispatches POST_CREATED_EVENT (the composer and the
  // photo-update flows), so a post created right now — e.g. the automatic
  // cover-photo-change post — appears in the Profile Posts tab without reloading.
  useEffect(() => {
    const onPostCreated = () => fetchPosts();
    window.addEventListener(POST_CREATED_EVENT, onPostCreated);
    return () => window.removeEventListener(POST_CREATED_EVENT, onPostCreated);
  }, [fetchPosts]);

  return {
    posts,
    loading,
    refetch: fetchPosts
  };
};

export const useUserPosts = (userId: string) => {
  return usePosts(userId);
};
