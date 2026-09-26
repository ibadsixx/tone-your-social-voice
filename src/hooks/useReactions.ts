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

export const useReactions = (
  postId: string,
  postOwnerId?: string,
  { enabled = true }: { enabled?: boolean } = {}
): UseReactionsResult => {
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [counts, setCounts] = useState<{ count: number; types: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();
  const userId = user?.id;

  // Normalize reaction type from DB to ReactionKey
  const normalizeReactionType = (type: string): ReactionKey | null => {
    if (type in REACTION_KEY_TO_DB) return type as ReactionKey;
    if (type in LEGACY_TO_NEW) return LEGACY_TO_NEW[type];
    return null;
  };

  // Convert a raw per-type count map (from the gateway) into the per-key
  // ReactionCount[] the summary component renders.
  const reactionCountsFromTypes = (types: Record<string, number> | undefined): ReactionCount[] => {
    const acc: Record<string, number> = {};
    for (const [rawType, count] of Object.entries(types || {})) {
      const key = normalizeReactionType(rawType);
      if (!key) continue;
      acc[key] = (acc[key] || 0) + count;
    }
    return Object.keys(REACTION_KEY_TO_DB)
      .map(key => ({ key: key as ReactionKey, count: acc[key] || 0 }))
      .filter(r => r.count > 0);
  };

  // Only the viewer's own row is kept in local state. Counts always come from
  // the aggregate projection, never from the number of identities loaded.
  const userReaction = reactions.find(r => r.user_id === user?.id);
  const normalizedUserReaction = userReaction ? normalizeReactionType(userReaction.type) : null;

  // Server-side aggregate: { reaction_count, reaction_types } — used for
  // guests and authenticated viewers alike.
  const fetchCounts = useCallback(async () => {
    if (!postId) return;
    try {
      const { data, error } = await gateway.postReactionCount(postId);
      if (error || !data) throw error || new Error('Reaction count unavailable');
      setCounts({
        count: typeof data.reaction_count === 'number' ? data.reaction_count : 0,
        types: data.reaction_types && typeof data.reaction_types === 'object' ? data.reaction_types : {},
      });
    } catch (error) {
      console.error('Error fetching reaction count:', error);
      setCounts(null);
    }
  }, [postId]);

  const fetchReactions = useCallback(async () => {
    if (!postId) {
      setLoading(false);
      return;
    }

    try {
      // This mode never selects identity rows for other reactors. The Gateway
      // returns aggregate counts plus only the authenticated viewer's own
      // reaction state.
      const { data, error } = await gateway.postReactionUsers(postId, { includeUsers: false });
      if (error || !data) throw error || new Error('Reaction state unavailable');
      setCounts({
        count: typeof data.reaction_count === 'number' ? data.reaction_count : 0,
        types: data.reaction_types && typeof data.reaction_types === 'object' ? data.reaction_types : {},
      });
      setReactions((data.viewer_reactions || []).map((reaction) => ({
        id: reaction.id,
        post_id: postId,
        user_id: reaction.user_id,
        type: reaction.reaction_type,
        created_at: reaction.created_at || new Date().toISOString(),
      })));
    } catch (error) {
      console.error('Error fetching reaction state:', error);
      // Keep the count useful if a deployed Gateway has not yet registered the
      // state endpoint yet; the generic read is constrained to the viewer's own
      // row by the Gateway policy.
      await fetchCounts();
      if (userId) {
        try {
          const { data, error } = await gateway
            .from('reactions')
            .select('*')
            .eq('post_id', postId)
            .eq('user_id', userId);
          if (!error && data) setReactions(data as unknown as Reaction[]);
        } catch {
          // Keep the empty state.
        }
      } else {
        setReactions([]);
      }
    } finally {
      setLoading(false);
    }
  }, [postId, userId, fetchCounts]);

  useEffect(() => {
    if (!postId) {
      setLoading(false);
      return;
    }

    // `enabled` is how a caller keeps a card's reaction read out of the way
    // until the card is worth reading. The endpoint and its privacy policy are
    // untouched: this is still `include_users=false`, so a guest still receives
    // no identity rows and a viewer still receives only their own state. All
    // that changes is *when* the aggregate is asked for (do.md §16).
    if (!enabled) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // Every viewer uses the aggregate/state endpoint. Guests receive no
    // identity rows; authenticated viewers receive only their own state row.
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
          void fetchReactions();
        }
      )
      .subscribe();

    return () => {
      gateway.removeChannel(channel);
    };
  }, [postId, enabled, fetchReactions]);

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
      // Counts are server-owned; refresh them after every add/change/remove.
      void fetchReactions();
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

      // Counts are server-owned; a removal must refresh the aggregate too,
      // otherwise the counter would keep showing the stale total.
      void fetchReactions();
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
    reactionsCount: counts?.count ?? 0,
    reactionCounts: reactionCountsFromTypes(counts?.types),
    loading,
    toggleReaction,
    removeReaction,
  };
};
