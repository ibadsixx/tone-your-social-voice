import { useState, useEffect, useCallback } from 'react';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { createNotification } from '@/hooks/useNotifications';
import type { ReactionKey } from '@/lib/reactions';

// Map between Lottie keys and database reaction_type enum
const REACTION_KEY_TO_DB: Record<ReactionKey, string> = {
  ok: 'ok',
  red_heart: 'red_heart',
  laughing: 'laughing',
  astonished: 'astonished',
  cry: 'cry',
  rage: 'rage',
  hug_face: 'hug_face',
};

// Legacy mapping for backwards compatibility
const LEGACY_TO_NEW: Record<string, ReactionKey> = {
  like: 'ok',
  love: 'red_heart',
  haha: 'laughing',
  wow: 'astonished',
  sad: 'cry',
  angry: 'rage',
};

interface Reaction {
  id: string;
  post_id: string;
  user_id: string;
  type: string;
  created_at: string;
}

interface ReactionCount {
  key: ReactionKey;
  count: number;
}

interface UseReactionsResult {
  reactions: Reaction[];
  userReaction: ReactionKey | null;
  reactionsCount: number;
  reactionCounts: ReactionCount[];
  loading: boolean;
  toggleReaction: (reactionKey: ReactionKey) => Promise<void>;
  removeReaction: () => Promise<void>;
}

export const useReactions = (postId: string, postOwnerId?: string): UseReactionsResult => {
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  // Normalize reaction type from DB to ReactionKey
  const normalizeReactionType = (type: string): ReactionKey | null => {
    if (type in REACTION_KEY_TO_DB) return type as ReactionKey;
    if (type in LEGACY_TO_NEW) return LEGACY_TO_NEW[type];
    return null;
  };

  // Get user's current reaction
  const userReaction = reactions.find(r => r.user_id === user?.id);
  const normalizedUserReaction = userReaction ? normalizeReactionType(userReaction.type) : null;

  // Calculate reaction counts grouped by type
  const reactionCounts: ReactionCount[] = Object.keys(REACTION_KEY_TO_DB).map(key => {
    const reactionKey = key as ReactionKey;
    const count = reactions.filter(r => normalizeReactionType(r.type) === reactionKey).length;
    return { key: reactionKey, count };
  }).filter(r => r.count > 0);

  const fetchReactions = useCallback(async () => {
    if (!postId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await gateway
        .from('reactions')
        .select('*')
        .eq('post_id', postId);

      if (error) throw error;
      setReactions(data || []);
    } catch (error) {
      console.error('Error fetching reactions:', error);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    fetchReactions();

    // Subscribe to realtime changes
    const channel = gateway
      .channel(`reactions-${postId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reactions',
          filter: `post_id=eq.${postId}`,
        },
        () => {
          fetchReactions();
        }
      )
      .subscribe();

    return () => {
      gateway.removeChannel(channel);
    };
  }, [postId, fetchReactions]);

  const toggleReaction = useCallback(async (reactionKey: ReactionKey) => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to react',
        variant: 'destructive',
      });
      return;
    }

    const dbReactionType = REACTION_KEY_TO_DB[reactionKey];
    const existingReaction = reactions.find(r => r.user_id === user.id);

    try {
      if (existingReaction) {
        if (normalizeReactionType(existingReaction.type) === reactionKey) {
          // Same reaction - remove it
          await gateway
            .from('reactions')
            .delete()
            .eq('id', existingReaction.id);

          // Optimistic update
          setReactions(prev => prev.filter(r => r.id !== existingReaction.id));
        } else {
          // Different reaction - update it
          await gateway
            .from('reactions')
            .update({ type: dbReactionType as any })
            .eq('id', existingReaction.id);

          // Optimistic update
          setReactions(prev => prev.map(r => 
            r.id === existingReaction.id 
              ? { ...r, type: dbReactionType }
              : r
          ));
        }
      } else {
        // No existing reaction - create one
        const { data, error } = await gateway
          .from('reactions')
          .insert({
            post_id: postId,
            user_id: user.id,
            type: dbReactionType as any,
          })
          .select()
          .single();

        if (error) throw error;

        // Optimistic update
        if (data) {
          setReactions(prev => [...prev, data]);
        }

        // Create notification for post owner
        if (postOwnerId && postOwnerId !== user.id) {
          await createNotification({
            userId: postOwnerId,
            actorId: user.id,
            type: 'like',
            message: 'reacted to your post',
            postId: postId,
          });
        }
      }
    } catch (error: any) {
      console.error('Error toggling reaction:', error);
      toast({
        title: 'Error',
        description: 'Failed to add reaction',
        variant: 'destructive',
      });
      // Refetch on error
      fetchReactions();
    }
  }, [user, reactions, postId, postOwnerId, toast, fetchReactions]);

  const removeReaction = useCallback(async () => {
    if (!user) return;

    const existingReaction = reactions.find(r => r.user_id === user.id);
    if (!existingReaction) return;

    try {
      await gateway
        .from('reactions')
        .delete()
        .eq('id', existingReaction.id);

      setReactions(prev => prev.filter(r => r.id !== existingReaction.id));
    } catch (error: any) {
      console.error('Error removing reaction:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove reaction',
        variant: 'destructive',
      });
      fetchReactions();
    }
  }, [user, reactions, toast, fetchReactions]);

  return {
    reactions,
    userReaction: normalizedUserReaction,
    reactionsCount: reactions.length,
    reactionCounts,
    loading,
    toggleReaction,
    removeReaction,
  };
};
