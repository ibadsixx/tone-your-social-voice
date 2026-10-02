import { useState, useEffect, useRef } from 'react';
import { gateway } from '@/lib/gateway';
import type { ReactionViewerRow } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { createNotification } from '@/hooks/useNotifications';
import { useMentions } from '@/hooks/useMentions';
import {
  nextPostActionOrigin,
  subscribePostActions,
  writePostActions,
} from '@/lib/postActionCache';

interface CommentReaction {
  id: string;
  comment_id: string;
  user_id: string;
  emoji: string;
  created_at: string | null;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at?: string;
  parent_comment_id?: string | null;
  profiles: {
    username: string;
    display_name: string;
    profile_pic: string | null;
  };
  reactions?: CommentReaction[];
  /** Aggregate values fetched without reading the full reactor list. */
  reaction_count?: number;
  reaction_types?: Record<string, number>;
}

/**
 * Minimal shape of a Supabase realtime payload. The gateway's realtime shim
 * types the payload as `unknown`, but the change events always carry `new` (and
 * `old` on DELETE) row objects.
 */
interface RealtimeRowPayload {
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
}

export const useComments = (postId: string, options?: { enabled?: boolean }) => {
  // Defaults to enabled so every existing call site keeps its current behaviour.
  // Pass `enabled: <panel is open>` to defer the fetch until it is actually needed.
  const enabled = options?.enabled ?? true;
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { saveMentionsAndHashtags } = useMentions();

  const originRef = useRef<string>('');
  if (!originRef.current) originRef.current = nextPostActionOrigin('comments');

  /**
   * The comment total published by whichever surface has the list loaded.
   *
   * The count is what a *collapsed* surface shows — the "N comments" link on the
   * feed card, the badge on the reel viewer. Without a shared value, adding a
   * comment in one place left the other showing a stale total until it remounted.
   *
   * Carried with the order it was published at, because a hook must not be shown
   * its own earlier number: after posting a comment, the surface that posted it
   * still holds the count it fetched *before* the write, and preferring that would
   * leave the badge one comment behind on the very surface the user just acted on.
   */
  const [peerCommentsCount, setPeerCommentsCount] = useState<{
    version: number;
    count: number;
  } | null>(null);

  /**
   * Version of the total this hook last published.
   *
   * Its own writes advance this, so a newer peer write is what makes the shared
   * value win.
   */
  const localVersionRef = useRef(0);

  /**
   * Bumped whenever the total moves somewhere other than here: a comment added,
   * deleted or edited on the other surface. A list load that started before such a
   * write describes the past, so the total it would publish is dropped — the list
   * itself still loads, only the number is left to the newer write.
   */
  const writeSeqRef = useRef(0);

  useEffect(() => {
    if (!postId) return;
    let seenVersion = -1;
    return subscribePostActions(user?.id, postId, originRef.current, (state) => {
      // Only the comments group's order counts here: a reaction or bookmark write
      // is not a comment change, and treating it as one would drop a good
      // in-flight list load.
      const version = state.versions.comments;
      if (version !== seenVersion) {
        seenVersion = version;
        if (state.commentsCount !== null) writeSeqRef.current += 1;
      }
      if (state.commentsCount === null) {
        setPeerCommentsCount(null);
        return;
      }
      setPeerCommentsCount(prev =>
        prev && prev.version === version && prev.count === state.commentsCount
          ? prev
          : { version, count: state.commentsCount }
      );
    });
  }, [user?.id, postId]);

  /** Republish the total this hook currently holds. */
  const publishCount = (total: number) => {
    writeSeqRef.current += 1;
    localVersionRef.current = writePostActions(
      user?.id,
      postId,
      { commentsCount: total },
      originRef.current
    );
  };

  /**
   * The total to render: the shared one when it is newer than this hook's own,
   * otherwise what this hook holds.
   */
  const settledCommentsCount =
    peerCommentsCount !== null && peerCommentsCount.version > localVersionRef.current
      ? peerCommentsCount.count
      : comments.length;

  // Reaction identities are fetched only by the dedicated modal endpoint. The
  // comments list uses this aggregate/state projection so a large comment does
  // not pull the whole comment_reactions table into the browser.
  const applySummary = (
    comment: Comment,
    summary?: {
      reaction_count: number;
      reaction_types: Record<string, number>;
      viewer_reactions?: ReactionViewerRow[];
    }
  ): Comment => ({
    ...comment,
    // `reactions` deliberately holds ONLY the viewer's own rows; the counter
    // reads the aggregate and the modal fetches the authorized reactor page.
    reactions: (summary?.viewer_reactions || []).map((reaction) => ({
      id: reaction.id,
      comment_id: comment.id,
      user_id: reaction.user_id,
      emoji: reaction.reaction_type,
      created_at: reaction.created_at,
    })),
    reaction_count: summary?.reaction_count ?? 0,
    reaction_types: summary?.reaction_types ?? {},
  });

  const withCommentReactionSummaries = async (rows: Comment[]): Promise<Comment[]> => {
    if (rows.length === 0) return rows;
    const { data, error } = await gateway.commentReactionCounts(rows.map((comment) => comment.id));
    const counts = error || !data?.counts ? {} : data.counts;
    return rows.map((comment) => applySummary(comment, counts[comment.id]));
  };

  // Reads the authoritative aggregate for the given comments and patches them
  // into state without capturing `comments` in its closure, so realtime
  // handlers (registered once per post) always patch the current list.
  const refreshCommentReactionSummaries = async (commentIds: string[]) => {
    if (commentIds.length === 0) return;
    const { data, error } = await gateway.commentReactionCounts(commentIds);
    if (error || !data?.counts) return;
    const requested = new Set(commentIds);
    setComments((current) =>
      current.map((comment) =>
        requested.has(comment.id) ? applySummary(comment, data.counts[comment.id]) : comment
      )
    );
  };

  const fetchComments = async () => {
    if (!postId) return;

    try {
      setLoading(true);
      const { data, error } = await gateway
        .from('comments')
        .select(`
          *,
          profiles!comments_user_id_fkey (
            username,
            display_name,
            profile_pic
          )
        `)
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      const seqAtStart = writeSeqRef.current;
      const commentRows = (data || []) as Comment[];
      setComments(await withCommentReactionSummaries(commentRows));
      // A comment added or removed on the other surface while this list was
      // loading makes its length describe the past.
      if (writeSeqRef.current === seqAtStart) publishCount(commentRows.length);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to load comments',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const addComment = async (content: string, postOwnerId?: string) => {
    if (!user || !content.trim()) return false;

    try {
      setSubmitting(true);
      
      // Insert the comment
      const { data, error } = await gateway
        .from('comments')
        .insert({
          post_id: postId,
          user_id: user.id,
          content: content.trim()
        })
        .select(`
          *,
          profiles!comments_user_id_fkey (
            username,
            display_name,
            profile_pic
          )
        `)
        .single();

      if (error) throw error;

      // A brand new comment has no reactions yet, but it still needs the
      // aggregate fields so the counter renders consistently with older rows.
      // `profiles` is attached by the client-side join resolver, so the insert
      // result is not typed with it.
      const newComment = applySummary(data as unknown as Comment);

      // Add the new comment to the local state
      setComments(prev => {
        const next = [...prev, newComment];
        publishCount(next.length);
        return next;
      });
      
      // Save mentions and hashtags
      await saveMentionsAndHashtags('comment', data.id, content);
      
      // Create notification for post owner
      if (postOwnerId) {
        await createNotification({
          userId: postOwnerId,
          actorId: user.id,
          type: 'comment',
          message: `commented on your post`,
          postId: postId,
          commentId: data.id
        });
      }
      
      toast({
        title: 'Success',
        description: 'Comment added successfully'
      });
      
      return true;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to add comment',
        variant: 'destructive'
      });
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const addReply = async (parentCommentId: string, content: string, parentCommentOwnerId?: string) => {
    if (!user || !content.trim()) return false;

    try {
      setSubmitting(true);
      
      // Insert the reply
      const { data, error } = await gateway
        .from('comments')
        .insert({
          post_id: postId,
          user_id: user.id,
          content: content.trim(),
          parent_comment_id: parentCommentId
        })
        .select(`
          *,
          profiles!comments_user_id_fkey (
            username,
            display_name,
            profile_pic
          )
        `)
        .single();

      if (error) throw error;

      // Keep the aggregate shape consistent with fetchComments().
      const newReply = applySummary(data as unknown as Comment);

      // Add the new reply to the local state
      setComments(prev => {
        const next = [...prev, newReply];
        publishCount(next.length);
        return next;
      });
      
      // Save mentions and hashtags
      await saveMentionsAndHashtags('comment', data.id, content);
      
      // Create notification for parent comment owner
      if (parentCommentOwnerId && parentCommentOwnerId !== user.id) {
        await createNotification({
          userId: parentCommentOwnerId,
          actorId: user.id,
          type: 'comment',
          message: `replied to your comment`,
          postId: postId,
          commentId: data.id
        });
      }
      
      toast({
        title: 'Success',
        description: 'Reply added successfully'
      });
      
      return true;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to add reply',
        variant: 'destructive'
      });
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const editComment = async (commentId: string, newContent: string) => {
    if (!user || !newContent.trim()) return false;

    try {
      const { error } = await gateway
        .from('comments')
        .update({ content: newContent.trim() })
        .eq('id', commentId)
        .eq('user_id', user.id);

      if (error) throw error;

      // Update local state
      setComments(prev => prev.map(comment => 
        comment.id === commentId 
          ? { ...comment, content: newContent.trim(), updated_at: new Date().toISOString() }
          : comment
      ));

      toast({
        title: 'Success',
        description: 'Comment updated successfully'
      });

      return true;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to update comment',
        variant: 'destructive'
      });
      return false;
    }
  };

  const deleteComment = async (commentId: string) => {
    try {
      const { error } = await gateway
        .from('comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;

      setComments(prev => {
        const next = prev.filter(comment => comment.id !== commentId);
        publishCount(next.length);
        return next;
      });
      
      toast({
        title: 'Success',
        description: 'Comment deleted successfully'
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to delete comment',
        variant: 'destructive'
      });
    }
  };

  const toggleReaction = async (commentId: string, emoji: string) => {
    if (!user) return;

    try {
      // Check if user already reacted with this emoji
      const existingReaction = comments
        .find(c => c.id === commentId)
        ?.reactions?.find(r => r.user_id === user.id && r.emoji === emoji);

      if (existingReaction) {
        // Remove reaction
        const { error } = await gateway
          .from('comment_reactions')
          .delete()
          .eq('id', existingReaction.id);

        if (error) throw error;

        // Update local state
        setComments(prev => prev.map(comment => 
          comment.id === commentId
            ? {
                ...comment,
                reactions: comment.reactions?.filter(r => r.id !== existingReaction.id) || []
              }
            : comment
        ));
        void refreshCommentReactionSummaries([commentId]);
      } else {
        // Add reaction
        const { data, error } = await gateway
          .from('comment_reactions')
          .insert({
            comment_id: commentId,
            user_id: user.id,
            emoji
          })
          .select()
          .single();

        if (error) throw error;

        // Update local state
        setComments(prev => prev.map(comment => 
          comment.id === commentId
            ? {
                ...comment,
                reactions: [...(comment.reactions || []), data]
              }
            : comment
        ));
        void refreshCommentReactionSummaries([commentId]);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to update reaction',
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    // A Post renders this hook whether or not anyone has opened its comments
    // panel, so fetching here meant every post in the feed pulled its comment
    // list and its reaction aggregate on mount. The count does not need any of
    // that: the feed's own `comments (id)` select already resolves the exact
    // number per post, which is what the "N comments" label shows. So the list
    // is fetched when the panel is actually opened.
    if (!enabled) return;

    fetchComments();

    // Set up real-time subscription for comments and reactions
    const channel = gateway
      .channel('comments_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comments',
          filter: `post_id=eq.${postId}`
        },
        async (payload: RealtimeRowPayload) => {
          const newCommentId = payload.new?.id;
          if (typeof newCommentId !== 'string') return;

          // Fetch the full comment with profile data
          const { data } = await gateway
            .from('comments')
            .select(`
              *,
              profiles!comments_user_id_fkey (
                username,
                display_name,
                profile_pic
              )
            `)
            .eq('id', newCommentId)
            .single();

          if (data && data.user_id !== user?.id) {
            // Only add if it's not from the current user (to avoid duplicates).
            // Realtime rows carry no reaction aggregate, so start at zero and
            // let the reaction-change handler keep the count current.
            setComments(prev => [...prev, applySummary(data as unknown as Comment)]);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comment_reactions'
        },
        (payload: RealtimeRowPayload) => {
          const commentId = payload.new?.comment_id;
          if (typeof commentId !== 'string') return;
          // Do not put arbitrary realtime reactor identities in client state;
          // refresh the aggregate + the viewer's own state instead.
          void refreshCommentReactionSummaries([commentId]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'comment_reactions'
        },
        (payload: RealtimeRowPayload) => {
          const commentId = payload.old?.comment_id;
          if (typeof commentId !== 'string') return;
          void refreshCommentReactionSummaries([commentId]);
        }
      )
      .subscribe();

    return () => {
      gateway.removeChannel(channel);
    };
  }, [postId, user?.id, enabled]);

  // Helper functions for threaded comments
  const getTopLevelComments = () => {
    return comments.filter(comment => !comment.parent_comment_id);
  };

  const getReplies = (commentId: string) => {
    return comments.filter(comment => comment.parent_comment_id === commentId);
  };

  const getReplyCount = (commentId: string) => {
    return comments.filter(comment => comment.parent_comment_id === commentId).length;
  };

  return {
    comments,
    loading,
    submitting,
    /**
     * Comment total for a surface that shows a count but not the list.
     *
     * The shared cache wins when it holds a value, for the same reason as the
     * reaction and save hooks: it is the only total both surfaces read, so a
     * surface that resolved its own older list first would otherwise contradict
     * the one where the comment was just added or deleted. This hook's own length
     * is the fallback for a surface whose list loaded before anything was
     * published. `null` means nobody has loaded the list yet.
     */
    commentsCount: settledCommentsCount,
    addComment,
    addReply,
    editComment,
    deleteComment,
    toggleReaction,
    refetch: fetchComments,
    getTopLevelComments,
    getReplies,
    getReplyCount
  };
};