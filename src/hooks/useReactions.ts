import { useState, useEffect, useCallback, useRef } from 'react';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { createNotification } from '@/hooks/useNotifications';
import {
  nextPostActionOrigin,
  readPostActions,
  subscribePostActions,
  writePostActions,
} from '@/lib/postActionCache';
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

/** The subset of a peer update `toggleReaction` needs to act without a refetch. */
type PeerReactionState = {
  userReaction: string | null;
  userReactionId: string | null;
} | null;

/**
 * Find the viewer's own `reactions` row, falling back to the peer's.
 *
 * The mutation is a read-modify-write keyed on the row id, so a surface that is
 * displaying a peer's reaction state still needs that id. Without the fallback
 * it would find no local row and INSERT a second reaction for a post the viewer
 * had already reacted to — which the aggregate would then count twice, and which
 * nothing would ever remove.
 */
const resolveViewerReaction = (
  reactions: Reaction[],
  peer: PeerReactionState,
  userId: string
): Reaction | undefined => {
  const own = reactions.find(r => r.user_id === userId);
  if (own) return own;
  if (peer?.userReactionId && peer.userReaction) {
    return {
      id: peer.userReactionId,
      post_id: '',
      user_id: userId,
      type: peer.userReaction,
      created_at: '',
    };
  }
  return undefined;
};

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

  // Identity for this hook instance, so the shared cache can skip delivering a
  // write back to whoever made it.
  const originRef = useRef<string>('');
  if (!originRef.current) originRef.current = nextPostActionOrigin('reactions');

  /**
   * Version of the state this hook last published.
   *
   * Compared against the cache's version to decide what to render: a hook whose
   * own write is newer shows its own (optimistic) state, and a hook that has
   * fallen behind shows the shared one. Without this, reacting on one surface
   * would leave that same surface displaying the older cached value until its own
   * re-read came back.
   */
  const localVersionRef = useRef(0);

  /** Publish this hook's state and remember the order it was published in. */
  const publish = (patch: Parameters<typeof writePostActions>[2]) => {
    localVersionRef.current = writePostActions(
      userId,
      postId,
      patch,
      originRef.current
    );
  };

  /**
   * A peer's settled reaction state for this post, or null.
   *
   * A reel is one `posts` row rendered by two surfaces — the feed's `Post` card
   * and the fullscreen `/reels/:id` viewer — and both drive this same hook.
   * Without this, reacting on one left the other showing the old value until it
   * remounted: the gateway's `postgres_changes` shim stores callbacks without
   * ever opening the stream, so nothing pushed a correction either.
   */
  const [peer, setPeer] = useState<{
    version: number;
    userReaction: string | null;
    userReactionId: string | null;
    reactionsCount: number;
    reactionTypes: Record<string, number> | null;
  } | null>(null);

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
  const userReactionRow = reactions.find(r => r.user_id === user?.id);
  const normalizedUserReaction = userReactionRow
    ? normalizeReactionType(userReactionRow.type)
    : null;

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

  /**
   * What this surface renders: whichever of the two states is newer.
   *
   * Both surfaces must show the same value, and the newest write is the one both
   * can agree on. A hook that has just written is newer than the cache and shows
   * its own state immediately; a hook that has fallen behind shows the shared one
   * rather than its own stale copy. Before anything is published the peer is null
   * and the hook shows what it fetched itself.
   */
  const usePeer = peer !== null && peer.version > localVersionRef.current;
  const displayedUserReaction = (usePeer ? peer!.userReaction : normalizedUserReaction) as
    | ReactionKey
    | null;
  const displayedReactionsCount = usePeer ? peer!.reactionsCount : counts?.count ?? 0;
  const displayedReactionTypes = usePeer ? peer!.reactionTypes ?? undefined : counts?.types;

  /**
   * Adopt a peer's state, and republish ours.
   *
   * Two effects, deliberately ordered by data rather than by mount:
   *
   * - Read: a write from the other surface is delivered here and, being newer,
   *   becomes what this hook renders.
   * - Write: published only while this hook holds the newest state, and only once
   *   `counts` is non-null. Both guards are load-bearing. Publishing while a newer
   *   write exists is how a surface resurrects a value the other surface has just
   *   removed: it re-publishes its own older copy and the peer adopts that. And
   *   publishing before `counts` resolves lets a card that has not read — or is
   *   gated behind `enabled: false` until it nears the viewport — erase a good
   *   value the other surface established.
   */
  useEffect(() => {
    if (!postId) return;
    return subscribePostActions(userId, postId, originRef.current, (state) => {
      // The first call is the cache's current contents, not a change; only a
      // real write invalidates a read in flight.
      setPeer(prev => {
        if (
          prev &&
          // Only the reaction group's order matters here. A bookmark written by
          // `useSavedPosts` moves its own group's counter and says nothing about
          // the reaction total, so treating it as a newer reaction answer would
          // show this post's likes as zero.
          prev.version === state.versions.reactions &&
          prev.userReaction === state.userReaction &&
          prev.userReactionId === state.userReactionId &&
          prev.reactionsCount === state.reactionsCount &&
          prev.reactionTypes === state.reactionTypes
        ) {
          return prev;
        }
        // A read that lands after a newer write is simply older state: the version
        // comparison below keeps it from being rendered or republished, so no
        // separate "is this result still current" bookkeeping is needed.
        return {
          version: state.versions.reactions,
          userReaction: state.userReaction,
          userReactionId: state.userReactionId,
          reactionsCount: state.reactionsCount,
          reactionTypes: state.reactionTypes,
        };
      });
    });
  }, [userId, postId]);

  useEffect(() => {
    if (!postId || !counts || usePeer) return;
    publish({
      userReaction: normalizedUserReaction,
      userReactionId: userReactionRow?.id ?? null,
      reactionsCount: counts.count,
      reactionTypes: counts.types,
    });
    // `normalizedUserReaction` and `userReactionRow` are derived from `reactions`
    // on every render, so listing `reactions` is what makes this re-run when the
    // viewer's own row changes.
  }, [userId, postId, counts, reactions, usePeer]);

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

  /**
   * Apply a mutation to the local aggregate and publish it straight away,
   * before waiting for the write to land.
   *
   * Without this the surface the viewer touched would show the *old* value for
   * the length of the round trip, and the other surface would keep showing it
   * until the confirming re-read — so a Like would visibly take a moment to
   * appear on both. The re-read that follows overwrites this with the server's
   * own answer; if the two disagree, the server wins, as it must.
   *
   * `previousType` is the reaction being given up (a removal, or a switch to a
   * different one) and `nextType` the one being taken. Both the local aggregate
   * and the shared state are moved: leaving the local count at the pre-mutation
   * value would let the publish effect below immediately republish it over the
   * optimistic one, and both surfaces would show a count one reaction behind the
   * icon above it.
   */
  const publishOptimistic = (
    previousType: string | null,
    nextType: string | null,
    rowId: string | null
  ) => {
    const types = { ...(displayedReactionTypes ?? {}) };
    if (previousType && types[previousType]) {
      types[previousType] -= 1;
      if (types[previousType] <= 0) delete types[previousType];
    }
    if (nextType) types[nextType] = (types[nextType] ?? 0) + 1;
    const total = Object.values(types).reduce((sum, n) => sum + n, 0);
    setCounts({ count: total, types });
    publish({
      userReaction: nextType,
      userReactionId: rowId,
      reactionsCount: total,
      reactionTypes: types,
    });
  };

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
    const existingReaction = resolveViewerReaction(reactions, peer, user.id);
    const isRemoval = existingReaction
      ? normalizeReactionType(existingReaction.type) === reactionKey
      : false;

    try {
      if (existingReaction) {
        if (isRemoval) {
          // Same reaction - remove it
          await gateway
            .from('reactions')
            .delete()
            .eq('id', existingReaction.id);

          publishOptimistic(dbReactionType, null, null);
          // Optimistic update
          setReactions(prev => prev.filter(r => r.id !== existingReaction.id));
        } else {
          // Different reaction - update it
          await gateway
            .from('reactions')
            .update({ type: dbReactionType as any })
            .eq('id', existingReaction.id);

          publishOptimistic(dbReactionType, dbReactionType, existingReaction.id);
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

        publishOptimistic(null, dbReactionType, (data?.id as string) ?? null);

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
  }, [user, reactions, peer, postId, postOwnerId, toast, fetchReactions, publishOptimistic]);

  const removeReaction = useCallback(async () => {
    if (!user) return;

    const existingReaction = resolveViewerReaction(reactions, peer, user.id);
    if (!existingReaction) return;

    try {
      await gateway
        .from('reactions')
        .delete()
        .eq('id', existingReaction.id);

      // Published before the re-read so the other surface clears its icon in the
      // same tick rather than after the round trip.
      publishOptimistic(
        normalizeReactionType(existingReaction.type),
        null,
        null
      );

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
  }, [user, reactions, peer, toast, fetchReactions, publishOptimistic]);

  return {
    reactions,
    userReaction: displayedUserReaction,
    reactionsCount: displayedReactionsCount,
    reactionCounts: reactionCountsFromTypes(displayedReactionTypes),
    loading,
    toggleReaction,
    removeReaction,
  };
};
