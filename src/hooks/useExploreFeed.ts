import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useContentFiltering } from '@/hooks/useContentFiltering';
import { getExplorePostsData, matchesCategory, type ExplorePost, type ExplorePostCategory } from '@/api/explore';
import { type ExploreWeights, DEFAULT_EXPLORE_WEIGHTS, rankExplorePosts, type ExploreRankingContext } from '@/lib/exploreRanking';
import { isPublicAudience, loadFriendIds as loadFriends } from '@/lib/postVisibility';
import { useToast } from '@/hooks/use-toast';

const PAGE_SIZE = 30;

export type { ExplorePost, ExplorePostCategory } from '@/api/explore';

export interface UseExploreFeedOptions {
  weights?: ExploreWeights;
}

export const useExploreFeed = (options: UseExploreFeedOptions = {}) => {
  const { weights = DEFAULT_EXPLORE_WEIGHTS } = options;
  const { user } = useAuth();
  const { shouldShowContent, loading: filtersLoading } = useContentFiltering();
  const { toast } = useToast();

  const [rawPosts, setRawPosts] = useState<ExplorePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<ExplorePostCategory>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [friendsLoaded, setFriendsLoaded] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await getExplorePostsData();
      if (fetchError) throw fetchError;
      setRawPosts((data as ExplorePost[]) || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load explore content';
      setError(message);
      toast({ title: 'Error', description: 'Failed to load content', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!user) { setFriendsLoaded(true); return; }
    loadFriends(user.id).then(ids => {
      setFriendIds(ids);
      setFriendsLoaded(true);
    });
  }, [user]);

  const ready = !loading && !filtersLoading && friendsLoaded;

  const rankingContext: ExploreRankingContext = useMemo(
    () => ({ viewerId: user?.id, friendIds }),
    [user?.id, friendIds]
  );

  const filteredAndRanked = useMemo(() => {
    if (!ready) return [];
    return rawPosts.filter(post => {
      if (!post.media_url || !post.media_url.trim()) return false;
      // Explore is a PUBLIC discovery surface, so it is public-only — even for
      // the author and even for the author's accepted friends. Using the
      // viewer-aware filter here (the old behavior) let friends-only content
      // surface in Explore. The viewer's own profile/feed still show it.
      if (!isPublicAudience(post)) return false;
      if (!shouldShowContent(post.id, post.user_id)) return false;
      if (!matchesCategory(post, category)) return false;
      return true;
    });
  }, [rawPosts, category, shouldShowContent, ready]);

  const rankedPosts = useMemo(
    () => rankExplorePosts(filteredAndRanked, rankingContext, weights),
    [filteredAndRanked, rankingContext, weights]
  );

  const visibleItems = useMemo(
    () => rankedPosts.slice(0, visibleCount),
    [rankedPosts, visibleCount]
  );

  const hasMore = visibleCount < rankedPosts.length;

  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    setVisibleCount(prev => prev + PAGE_SIZE);
  }, [hasMore, loading]);

  const refresh = useCallback(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [category]);

  return {
    posts: visibleItems,
    allPosts: rankedPosts,
    loading,
    error,
    hasMore,
    category,
    setCategory,
    loadMore,
    refresh,
  };
};