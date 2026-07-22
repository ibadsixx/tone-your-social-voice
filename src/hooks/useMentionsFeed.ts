import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useAuth } from './useAuth';

export interface MentionItem {
  id: string;
  source_type: 'post' | 'comment' | 'tag';
  source_id: string;
  created_at: string;
  created_by: string;
  post?: {
    id: string;
    content: string;
    user_id: string;
    created_at: string;
    author: {
      id: string;
      username: string;
      display_name: string;
      profile_pic: string | null;
    };
  };
  comment?: {
    id: string;
    content: string;
    user_id: string;
    post_id: string;
    created_at: string;
    author: {
      id: string;
      username: string;
      display_name: string;
      profile_pic: string | null;
    };
  };
}

export const useMentionsFeed = () => {
  const [mentions, setMentions] = useState<MentionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchMentions = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      // Fetch mentions where the current user is mentioned
      const { data: mentionsData, error: mentionsError } = await gateway
        .from('mentions')
        .select('*')
        .eq('mentioned_user_id', user.id)
        .order('created_at', { ascending: false });

      if (mentionsError) throw mentionsError;

      // Fetch tags where current user was tagged in posts
      const { data: tagsData, error: tagsError } = await gateway
        .from('post_tags')
        .select('id, post_id, tagged_by, created_at')
        .eq('tagged_user_id', user.id)
        .order('created_at', { ascending: false });

      if (tagsError) throw tagsError;

      // Normalize tag rows into mention-shaped rows
      const normalizedTags = (tagsData || []).map((t: any) => ({
        id: `tag-${t.id}`,
        source_type: 'tag' as const,
        source_id: t.post_id,
        created_at: t.created_at,
        created_by: t.tagged_by,
      }));

      const allMentions = [...(mentionsData || []), ...normalizedTags].sort(
        (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      if (allMentions.length === 0) {
        setMentions([]);
        return;
      }

      // Separate post and comment mentions
      const postMentions = allMentions.filter((m: any) => m.source_type === 'post' || m.source_type === 'tag');
      const commentMentions = allMentions.filter((m: any) => m.source_type === 'comment');

      // Fetch posts
      const postIds = postMentions.map(m => m.source_id);
      let postsWithAuthors: any[] = [];
      if (postIds.length > 0) {
        const { data: postsData, error: postsError } = await gateway
          .from('posts')
          .select('id, content, user_id, created_at')
          .in('id', postIds);

        if (postsError) throw postsError;

        if (postsData && postsData.length > 0) {
          const postUserIds = postsData.map(p => p.user_id);
          const { data: postAuthors } = await gateway
            .from('profiles')
            .select('id, username, display_name, profile_pic')
            .in('id', postUserIds);

          postsWithAuthors = postsData.map(post => ({
            ...post,
            author: postAuthors?.find(a => a.id === post.user_id),
          }));
        }
      }

      // Fetch comments
      const commentIds = commentMentions.map(m => m.source_id);
      let commentsWithAuthors: any[] = [];
      if (commentIds.length > 0) {
        const { data: commentsData, error: commentsError } = await gateway
          .from('comments')
          .select('id, content, user_id, post_id, created_at')
          .in('id', commentIds);

        if (commentsError) throw commentsError;

        if (commentsData && commentsData.length > 0) {
          const commentUserIds = commentsData.map(c => c.user_id);
          const { data: commentAuthors } = await gateway
            .from('profiles')
            .select('id, username, display_name, profile_pic')
            .in('id', commentUserIds);

          commentsWithAuthors = commentsData.map(comment => ({
            ...comment,
            author: commentAuthors?.find(a => a.id === comment.user_id),
          }));
        }
      }

      // Combine mentions with their content
      const enrichedMentions = allMentions.map((mention: any) => {
        if (mention.source_type === 'post' || mention.source_type === 'tag') {
          const post = postsWithAuthors.find(p => p.id === mention.source_id);
          return { ...mention, post };
        } else {
          const comment = commentsWithAuthors.find(c => c.id === mention.source_id);
          return { ...mention, comment };
        }
      });

      setMentions(enrichedMentions as MentionItem[]);
    } catch (error) {
      console.error('Error fetching mentions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMentions();

    // Set up realtime subscription for new mentions
    const channel = gateway
      .channel('mentions-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mentions',
          filter: `mentioned_user_id=eq.${user?.id}`,
        },
        () => {
          fetchMentions();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'post_tags',
          filter: `tagged_user_id=eq.${user?.id}`,
        },
        () => {
          fetchMentions();
        }
      )
      .subscribe();

    return () => {
      gateway.removeChannel(channel);
    };
  }, [user?.id]);

  return {
    mentions,
    loading,
    refetch: fetchMentions,
  };
};
