import { useState, useEffect, useRef, useCallback } from 'react';
import PageContainer from '@/components/PageContainer';
import { ExploreMasonryGrid } from '@/components/explore/ExploreMasonryGrid';
import { ExploreViewer } from '@/components/explore/ExploreViewer';
import { useExploreFeed } from '@/hooks/useExploreFeed';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ExplorePost, ExplorePostCategory } from '@/api/explore';

const CATEGORIES: { value: ExplorePostCategory; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'photos', label: 'Photos' },
  { value: 'videos', label: 'Videos' },
  { value: 'reels', label: 'Reels' },
];

const Explore = () => {
  const {
    posts,
    loading,
    error,
    hasMore,
    category,
    setCategory,
    loadMore,
    refresh,
  } = useExploreFeed();

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const handlePostClick = useCallback((_post: ExplorePost, index: number) => {
    setViewerIndex(index);
  }, []);

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: '600px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadMore, posts.length]);

  if (loading && posts.length === 0) {
    return (
      <PageContainer className="pt-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold font-display">Explore</h1>
        </div>
        <div className="mt-6 flex gap-2">
          {CATEGORIES.map(cat => (
            <div key={cat.value} className="h-8 w-16 animate-pulse rounded-full bg-muted" />
          ))}
        </div>
        <div className="mt-6">
          <ExploreMasonryGrid posts={[]} loading onPostClick={() => {}} />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="pt-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold font-display">Explore</h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setRefreshKey(k => k + 1);
            refresh();
          }}
        >
          Refresh
        </Button>
      </div>

      <div className="sticky top-0 z-10 -mx-1 mt-5 bg-background/90 px-1 pb-3 backdrop-blur-sm">
        <div className="flex gap-2 overflow-x-auto">
          {CATEGORIES.map(cat => (
            <button
              key={cat.value}
              onClick={() => setCategory(cat.value)}
              className={cn(
                'shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                category === cat.value
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {error && posts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={refresh}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="mt-4" key={`${category}-${refreshKey}`}>
          <ExploreMasonryGrid posts={posts} loading={loading} onPostClick={handlePostClick} />
        </div>
      )}

      <div ref={sentinelRef} className="h-1" aria-hidden />

      {loading && posts.length > 0 && (
        <div className="mt-4 flex justify-center py-4 text-sm text-muted-foreground">
          Loading more...
        </div>
      )}

      {!hasMore && posts.length > 0 && (
        <p className="mt-8 text-center text-sm text-muted-foreground">You're all caught up</p>
      )}

      {viewerIndex !== null && posts.length > 0 && (
        <ExploreViewer
          open={viewerIndex !== null}
          posts={posts}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onNavigate={setViewerIndex}
        />
      )}
    </PageContainer>
  );
};

export default Explore;