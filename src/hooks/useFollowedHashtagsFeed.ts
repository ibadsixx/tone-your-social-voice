import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useAuth } from './useAuth';

interface HashtagPost {
  id: string;
  user_id: string;
  content: string | null;
  media_url: string | null;
  media_type?: 'image' | 'video' | null;
  created_at: string;
  type: 'normal_post' | 'profile_picture_update' | 'cover_photo_update' | 'shared_post' | 'reel';
  shared_post_id?: string | null;
  duration?: number | null;
  aspect_ratio?: string | null;
  music_url?: string | null;
  music_source?: string | null;
  music_start?: number | null;
  thumbnail?: string | null;
  profiles: {
    id?: string;
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
      id?: string;
      username: string;
      display_name: string;
      profile_pic: string | null;
    };
  } | null;
  likes?: Array<{ id: string; user_id: string }>;
  comments?: Array<{ id: string; content: string; profiles: { display_name: string } }>;
}

export const useFollowedHashtagsFeed = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<HashtagPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [followedHashtags, setFollowedHashtags] = useState<Array<{ id: string; tag: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const fetchFollowedHashtagsPosts = async () => {
      if (!user) {
        setLoading(false);
        setError(null);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Get hashtags the user follows
        const { data: follows, error: followsError } = await gateway
          .from('hashtag_follows' as any)
          .select('hashtag_id')
          .eq('user_id', user.id);

        if (followsError) {
          console.error('Error fetching followed hashtags:', followsError);
          setPosts([]);
          setError(followsError.message || 'Failed to load followed hashtags');
          setLoading(false);
          return;
        }

        if (!follows || follows.length === 0) {
          setPosts([]);
          setFollowedHashtags([]);
          setLoading(false);
          return;
        }

        const hashtagIds = (follows as any[]).map((f: any) => f.hashtag_id);

        // Get hashtag details
        const { data: hashtagsData, error: hashtagsError } = await gateway
          .from('hashtags' as any)
          .select('id, tag')
          .in('id', hashtagIds);

        if (hashtagsError) {
          console.error('Error fetching hashtags:', hashtagsError);
          setPosts([]);
          setError(hashtagsError.message || 'Failed to load followed hashtags');
          setLoading(false);
          return;
        }

        setFollowedHashtags((hashtagsData as any[]) || []);

        // Get all post IDs from hashtag_links for followed hashtags
        const { data: links, error: linksError } = await gateway
          .from('hashtag_links' as any)
          .select('source_id')
          .in('hashtag_id', hashtagIds)
          .eq('source_type', 'post');

        if (linksError) {
          console.error('Error fetching hashtag links:', linksError);
          setPosts([]);
          setError(linksError.message || 'Failed to load hashtag posts');
          setLoading(false);
          return;
        }

        if (!links || links.length === 0) {
          setPosts([]);
          setLoading(false);
          return;
        }

        // Get unique post IDs
        const postIds = [...new Set((links as any[]).map((link: any) => link.source_id))];

        // Fetch the actual posts
        const { data: postsData, error: postsError } = await gateway
          .from('posts')
          .select(`
            *,
            profiles:user_id (
              id,
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
              profiles:user_id (
                id,
                username,
                display_name,
                profile_pic
              )
            )
          `)
          .in('id', postIds)
          .eq('status', 'published')
          .order('created_at', { ascending: false });

        if (postsError) {
          console.error('Error fetching posts:', postsError);
          setPosts([]);
          setError(postsError.message || 'Failed to load posts');
          setLoading(false);
          return;
        }

        // Get likes and comments for each post
        const postsWithData = await Promise.all(
          (postsData || []).map(async (post) => {
            const [likesResult, commentsResult] = await Promise.all([
              gateway
                .from('likes')
                .select('id, user_id')
                .eq('post_id', post.id),
              gateway
                .from('comments')
                .select('id, content, profiles:user_id(display_name)')
                .eq('post_id', post.id),
            ]);

            return {
              ...post,
              likes: likesResult.data || [],
              comments: commentsResult.data || [],
            };
          })
        );

        setPosts(postsWithData as HashtagPost[]);
      } catch (error: any) {
        console.error('Error in fetchFollowedHashtagsPosts:', error);
        setPosts([]);
        setError(error?.message || 'Failed to load followed hashtags');
      } finally {
        setLoading(false);
      }
    };

    fetchFollowedHashtagsPosts();

    // Set up real-time subscription for new posts
    const channel = gateway
      .channel('followed-hashtags-posts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hashtag_links' }, () => {
        fetchFollowedHashtagsPosts();
      })
      .subscribe();

    return () => {
      gateway.removeChannel(channel);
    };
  }, [user, retry]);

  const refresh = () => setRetry((n) => n + 1);

  return { posts, loading, followedHashtags, error, refresh };
};
