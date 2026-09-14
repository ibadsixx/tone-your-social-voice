import { useEffect, useRef, useState, useCallback } from 'react';
import { Compass, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useExploreFeed } from '@/hooks/useExploreFeed';
import { ExploreMasonryGrid } from '@/components/explore/ExploreMasonryGrid';
import { ExploreViewer } from '@/components/explore/ExploreViewer';
import { cn } from '@/lib/utils';
import type { ExplorePost, ExplorePostCategory } from '@/api/explore';

const CATEGORIES: { value: ExplorePostCategory; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'photos', label: 'Photos' },
  { value: 'videos', label: 'Videos' },
  { value: 'reels', label: 'Reels' },
];

export const ExploreSection = () => {
  const { posts, loading, error, hasMore, category, setCategory, loadMore, refresh } = useExploreFeed();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Explore</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={refresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

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

      {error && posts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={refresh}>
            Try again
          </Button>
        </div>
      ) : (
        <ExploreMasonryGrid
          posts={posts}
          loading={loading}
          onPostClick={handlePostClick}
          columnsClassName="columns-2 sm:columns-3"
        />
      )}

      <div ref={sentinelRef} className="h-1" aria-hidden />

      {loading && posts.length > 0 && (
        <div className="flex justify-center py-4 text-sm text-muted-foreground">
          Loading more...
        </div>
      )}

      {!hasMore && posts.length > 0 && (
        <p className="pt-2 text-center text-sm text-muted-foreground">You're all caught up</p>
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
    </div>
  );
};

export default ExploreSection;