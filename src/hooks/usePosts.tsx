import { useState, useEffect, useCallback } from 'react';
import { postsApi } from '@/api';
import { gateway } from '@/lib/gateway';
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

async function loadFriendIds(userId: string): Promise<Set<string>> {
  const { data } = await gateway
    .from('friends')
    .select('requester_id, receiver_id')
    .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
    .eq('status', 'accepted');
  const ids = new Set<string>();
  for (const row of (data || []) as Array<{ requester_id: string; receiver_id: string }>) {
    if (row.requester_id !== userId) ids.add(row.requester_id);
    if (row.receiver_id !== userId) ids.add(row.receiver_id);
  }
  return ids;
}

function isPostVisibleToViewer(
  post: Post,
  viewerId: string,
  friendIds: Set<string>
): boolean {
  if (viewerId === post.user_id) return true;
  if (post.visibility && post.visibility !== 'public') return false;

  const audience = post.audience_type;
  if (!audience || audience === 'public') return true;
  if (audience === 'only_me') return false;
  if (audience === 'friends') return friendIds.has(post.user_id);
  if (audience === 'friends_except') {
    if (!friendIds.has(post.user_id)) return false;
    return !post.audience_excluded_user_ids?.includes(viewerId);
  }
  if (audience === 'specific') {
    return !!post.audience_user_ids && post.audience_user_ids.includes(viewerId);
  }
  return false;
}

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

      // When viewing another user's profile, filter by audience settings.
      // The gateway uses service_role which bypasses RLS, so we filter client-side.
      if (user && user.id !== userId) {
        const friendIds = await loadFriendIds(user.id);
        setPosts(postsWithTypedMedia.filter(p => isPostVisibleToViewer(p, user.id, friendIds)));
      } else {
        setPosts(postsWithTypedMedia);
      }
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
