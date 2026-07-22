import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';

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

export const useHashtagFeed = (tag: string) => {
  const [posts, setPosts] = useState<HashtagPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHashtagPosts = async () => {
      try {
        setLoading(true);

        // First, get the hashtag ID
        const { data: hashtagData, error: hashtagError } = await gateway
          .from('hashtags' as any)
          .select('id')
          .eq('tag', tag.toLowerCase())
          .single();

        if (hashtagError || !hashtagData) {
          console.error('Error fetching hashtag:', hashtagError);
          setPosts([]);
          return;
        }

        // Get all post IDs linked to this hashtag
        const { data: links, error: linksError } = await gateway
          .from('hashtag_links' as any)
          .select('source_id')
          .eq('hashtag_id', (hashtagData as any).id)
          .eq('source_type', 'post');

        if (linksError) {
          console.error('Error fetching hashtag links:', linksError);
          setPosts([]);
          return;
        }

        if (!links || links.length === 0) {
          setPosts([]);
          return;
        }

        const postIds = (links as any[]).map((link: any) => link.source_id);

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
      } catch (error) {
        console.error('Error in fetchHashtagPosts:', error);
        setPosts([]);
      } finally {
        setLoading(false);
      }
    };

    if (tag) {
      fetchHashtagPosts();
    }
  }, [tag]);

  return { posts, loading };
};
