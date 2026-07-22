import { useState, useEffect, useCallback, useRef } from 'react';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface ReelComment {
  id: string;
  reel_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  author: {
    id: string;
    username: string;
    display_name: string;
    profile_pic: string | null;
  };
}

interface ReelLike {
  id: string;
  reel_id: string;
  user_id: string;
  created_at: string;
}

export const useReelInteractions = (reelId: string) => {
  const [comments, setComments] = useState<ReelComment[]>([]);
  const [likes, setLikes] = useState<ReelLike[]>([]);
  const [likesCount, setLikesCount] = useState(0);
  const [commentsCount, setCommentsCount] = useState(0);
  const [sharesCount, setSharesCount] = useState(0);
  const [isLikedByCurrentUser, setIsLikedByCurrentUser] = useState(false);
  const [isSavedByCurrentUser, setIsSavedByCurrentUser] = useState(false);
  const [loading, setLoading] = useState(false);
  const [commentsPage, setCommentsPage] = useState(0);
  const [hasMoreComments, setHasMoreComments] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();
  
  const likeTimeoutRef = useRef<NodeJS.Timeout>();

  const COMMENTS_PER_PAGE = 20;

  // Fetch initial counts
  const fetchCounts = useCallback(async () => {
    if (!reelId) return;
    try {
      const { data, error } = await gateway
        .from('posts')
        .select('likes_count, comments_count, share_count')
        .eq('id', reelId)
        .single();

      if (error) throw error;
      if (data) {
        setLikesCount(data.likes_count || 0);
        setCommentsCount(data.comments_count || 0);
        setSharesCount(data.share_count || 0);
        console.log('[REEL_INTERACTIONS] Fetched counts:', { likes: data.likes_count, comments: data.comments_count, shares: data.share_count });
      }
    } catch (error) {
      console.error('[REEL_INTERACTIONS] Error fetching counts:', error);
    }
  }, [reelId]);

  // Check if current user liked
  const checkUserLike = useCallback(async () => {
    if (!user || !reelId) return;

    try {
      const { data, error } = await gateway
        .from('reels_likes')
        .select('id')
        .eq('reel_id', reelId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      setIsLikedByCurrentUser(!!data);
      console.log('[REEL_LIKE] checkUserLike user=' + user.id + ' reel=' + reelId + ' liked=' + !!data);
    } catch (error) {
      console.error('[REEL_INTERACTIONS] Error checking user like:', error);
    }
  }, [reelId, user]);

  // Check if current user saved
  const checkUserSaved = useCallback(async () => {
    if (!user || !reelId) return;

    try {
      const { data, error } = await gateway
        .from('saved_posts')
        .select('id')
        .eq('post_id', reelId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      setIsSavedByCurrentUser(!!data);
      console.log('[REEL_SAVE] checkUserSaved user=' + user.id + ' reel=' + reelId + ' saved=' + !!data);
    } catch (error) {
      console.error('[REEL_INTERACTIONS] Error checking user save:', error);
    }
  }, [reelId, user]);

  // Fetch comments with pagination
  const getComments = useCallback(async (page = 0) => {
    if (!reelId) return;
    try {
      setLoading(true);
      const from = page * COMMENTS_PER_PAGE;
      const to = from + COMMENTS_PER_PAGE - 1;

      const { data, error } = await gateway
        .from('reels_comments')
        .select(`
          id,
          reel_id,
          body,
          created_at,
          edited_at,
          author:profiles!reels_comments_author_id_fkey (
            id,
            username,
            display_name,
            profile_pic
          )
        `)
        .eq('reel_id', reelId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      const formattedComments = (data || []).map(c => ({
        ...c,
        author: Array.isArray(c.author) ? c.author[0] : c.author
      })) as ReelComment[];

      if (page === 0) {
        setComments(formattedComments);
      } else {
        setComments(prev => [...prev, ...formattedComments]);
      }

      setHasMoreComments(formattedComments.length === COMMENTS_PER_PAGE);
      setCommentsPage(page);
    } catch (error: any) {
      console.error('[REEL_INTERACTIONS] Error fetching comments:', error);
      toast({
        title: 'Error',
        description: 'Failed to load comments',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [reelId, toast]);

  // Load more comments
  const loadMoreComments = useCallback(() => {
    if (hasMoreComments && !loading) {
      getComments(commentsPage + 1);
    }
  }, [hasMoreComments, loading, commentsPage, getComments]);

  // Post a comment
  const postComment = useCallback(async (body: string) => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to comment',
        variant: 'destructive'
      });
      return false;
    }

    try {
      const { data, error } = await gateway.rpc('add_reel_comment', {
        p_reel_id: reelId,
        p_user_id: user.id,
        p_body: body.trim()
      });

      if (error) throw error;

      console.log('[REEL_COMMENT] posted user=' + user.id + ' reel=' + reelId + ' body="' + body.trim().substring(0, 20) + '..."');

      // Add comment to local state
      const newComment = data as unknown as ReelComment;
      setComments(prev => [newComment, ...prev]);
      setCommentsCount(prev => prev + 1);

      toast({
        title: 'Success',
        description: 'Comment posted'
      });

      return true;
    } catch (error: any) {
      console.error('[REEL_INTERACTIONS] Error posting comment:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to post comment',
        variant: 'destructive'
      });
      return false;
    }
  }, [reelId, user, toast]);

  // Delete a comment
  const deleteComment = useCallback(async (commentId: string) => {
    if (!user) return false;

    try {
      const { error } = await gateway
        .from('reels_comments')
        .delete()
        .eq('id', commentId)
        .eq('author_id', user.id);

      if (error) throw error;

      console.log('[REEL_COMMENT] deleted user=' + user.id + ' comment=' + commentId);

      setComments(prev => prev.filter(c => c.id !== commentId));
      setCommentsCount(prev => Math.max(0, prev - 1));

      toast({
        title: 'Success',
        description: 'Comment deleted'
      });

      return true;
    } catch (error: any) {
      console.error('[REEL_INTERACTIONS] Error deleting comment:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete comment',
        variant: 'destructive'
      });
      return false;
    }
  }, [user, toast]);

  // Toggle like with debounce
  const toggleLike = useCallback(async () => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to like',
        variant: 'destructive'
      });
      return;
    }

    // Clear any pending like requests
    if (likeTimeoutRef.current) clearTimeout(likeTimeoutRef.current);

    // Optimistic update
    const wasLiked = isLikedByCurrentUser;
    setIsLikedByCurrentUser(!wasLiked);
    setLikesCount(prev => wasLiked ? Math.max(0, prev - 1) : prev + 1);

    console.log('[REEL_LIKE] user=' + user.id + ' reel=' + reelId + ' liked=' + !wasLiked + ' (optimistic)');

    // Debounce the actual request
    likeTimeoutRef.current = setTimeout(async () => {
      try {
        const { data, error } = await gateway.rpc('toggle_reel_like', {
          p_reel_id: reelId,
          p_user_id: user.id
        });

        if (error) throw error;

        // Update with server response
        const result = data as any;
        setLikesCount(result.likes_count);
        setIsLikedByCurrentUser(result.is_liked);
        
        console.log('[REEL_LIKE] user=' + user.id + ' reel=' + reelId + ' liked=' + result.is_liked + ' count=' + result.likes_count + ' (confirmed)');
      } catch (error: any) {
        console.error('[REEL_INTERACTIONS] Error toggling like:', error);
        // Revert optimistic update
        setIsLikedByCurrentUser(wasLiked);
        setLikesCount(prev => wasLiked ? prev + 1 : Math.max(0, prev - 1));
        
        toast({
          title: 'Error',
          description: 'Failed to update like',
          variant: 'destructive'
        });
      }
    }, 300);
  }, [reelId, user, isLikedByCurrentUser, toast]);

  // Toggle save
  const toggleSave = useCallback(async () => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to save',
        variant: 'destructive'
      });
      return;
    }

    const wasSaved = isSavedByCurrentUser;
    
    // Optimistic update
    setIsSavedByCurrentUser(!wasSaved);
    console.log('[REEL_SAVE] user=' + user.id + ' reel=' + reelId + ' saved=' + !wasSaved + ' (optimistic)');

    try {
      if (wasSaved) {
        // Remove from saved
        const { error } = await gateway
          .from('saved_posts')
          .delete()
          .eq('post_id', reelId)
          .eq('user_id', user.id);

        if (error) throw error;
        
        console.log('[REEL_SAVE] user=' + user.id + ' reel=' + reelId + ' saved=false (confirmed)');
        toast({ description: 'Removed from saved' });
      } else {
        // Add to saved
        const { error } = await gateway
          .from('saved_posts')
          .insert({
            post_id: reelId,
            user_id: user.id
          });

        if (error) throw error;
        
        console.log('[REEL_SAVE] user=' + user.id + ' reel=' + reelId + ' saved=true (confirmed)');
        toast({ description: 'Saved to collection' });
      }
    } catch (error: any) {
      console.error('[REEL_INTERACTIONS] Error toggling save:', error);
      // Revert optimistic update
      setIsSavedByCurrentUser(wasSaved);
      toast({
        title: 'Error',
        description: 'Failed to save',
        variant: 'destructive'
      });
    }
  }, [reelId, user, isSavedByCurrentUser, toast]);

  // Share reel
  const shareReel = useCallback(async () => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to share',
        variant: 'destructive'
      });
      return;
    }

    try {
      // Record the share in shares table
      const { error: shareError } = await gateway
        .from('shares')
        .insert({
          post_id: reelId,
          user_id: user.id
        });

      if (shareError) throw shareError;

      // Increment share count on post
      const { error: updateError } = await gateway
        .from('posts')
        .update({ share_count: sharesCount + 1 })
        .eq('id', reelId);

      if (updateError) throw updateError;

      setSharesCount(prev => prev + 1);
      
      console.log('[REEL_SHARE] user=' + user.id + ' reel=' + reelId + ' count=' + (sharesCount + 1));

      // Copy link to clipboard
      const url = `${window.location.origin}/reels/${reelId}`;
      await navigator.clipboard.writeText(url);
      
      toast({ description: 'Link copied to clipboard' });
    } catch (error: any) {
      console.error('[REEL_INTERACTIONS] Error sharing:', error);
      toast({
        title: 'Error',
        description: 'Failed to share',
        variant: 'destructive'
      });
    }
  }, [reelId, user, sharesCount, toast]);

  // Initial load
  useEffect(() => {
    if (!reelId) return;
    fetchCounts();
    checkUserLike();
    checkUserSaved();
    getComments(0);
  }, [reelId]);

  // Real-time subscriptions
  useEffect(() => {
    if (!reelId) return;
    
    const channel = gateway
      .channel(`reel_${reelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'reels_comments',
          filter: `reel_id=eq.${reelId}`
        },
        async (payload) => {
          // Fetch the full comment with author
          const { data } = await gateway
            .from('reels_comments')
            .select(`
              id,
              reel_id,
              body,
              created_at,
              edited_at,
              author:profiles!reels_comments_author_id_fkey (
                id,
                username,
                display_name,
                profile_pic
              )
            `)
            .eq('id', payload.new.id)
            .single();

          if (data) {
            const formattedComment = {
              ...data,
              author: Array.isArray(data.author) ? data.author[0] : data.author
            } as ReelComment;
            
            // Only add if not from current user (to avoid duplicates)
            if (formattedComment.author.id !== user?.id) {
              setComments(prev => [formattedComment, ...prev]);
              setCommentsCount(prev => prev + 1);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'reels_comments',
          filter: `reel_id=eq.${reelId}`
        },
        (payload) => {
          setComments(prev => prev.filter(c => c.id !== payload.old.id));
          setCommentsCount(prev => Math.max(0, prev - 1));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'reels_likes',
          filter: `reel_id=eq.${reelId}`
        },
        () => {
          if (user) {
            setLikesCount(prev => prev + 1);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'reels_likes',
          filter: `reel_id=eq.${reelId}`
        },
        () => {
          setLikesCount(prev => Math.max(0, prev - 1));
        }
      )
      .subscribe();

    return () => {
      gateway.removeChannel(channel);
    };
  }, [reelId, user?.id]);

  return {
    comments,
    likes,
    likesCount,
    commentsCount,
    sharesCount,
    isLikedByCurrentUser,
    isSavedByCurrentUser,
    loading,
    hasMoreComments,
    getComments,
    loadMoreComments,
    postComment,
    deleteComment,
    toggleLike,
    toggleSave,
    shareReel
  };
};
