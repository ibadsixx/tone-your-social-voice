import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Play } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import StaticReactionIcon from '@/components/StaticReactionIcon';
import { cn } from '@/lib/utils';
import { getMediaThumbnail, getVideoPoster, formatDuration } from '@/lib/mediaThumbnail';
import { resolveMediaSrc } from '@/lib/mediaUrl';
import { exploreMediaType, formatCount } from '@/api/explore';
import type { ExplorePost } from '@/api/explore';

export interface ExploreMasonryGridProps {
  posts: ExplorePost[];
  loading?: boolean;
  columnsClassName?: string;
  onPostClick: (post: ExplorePost, index: number) => void;
}

const LOADER_COUNT = 12;
const IMG_WIDTH = 700;
const PORTRAIT_HEIGHT = Math.round(IMG_WIDTH * (16 / 9));

function tileAspect(post: ExplorePost, index: number): string {
  if (exploreMediaType(post) !== 'photo') return '9 / 16';
  const ratio = post.aspect_ratio;
  if (ratio && /^\d+\s*\/\s*\d+$/.test(ratio)) return ratio;
  if (index % 6 === 0) return '3 / 4';
  if (index % 6 === 3) return '1 / 1';
  return '4 / 5';
}

function tilePosterUrl(post: ExplorePost): string {
  if (post.thumbnail) {
    return getMediaThumbnail(post.thumbnail, IMG_WIDTH, { height: PORTRAIT_HEIGHT, crop: 'fill' });
  }
  return getVideoPoster(post.media_url, IMG_WIDTH, PORTRAIT_HEIGHT);
}

function TileMedia({ post, className }: { post: ExplorePost; className: string }) {
  const [posterFailed, setPosterFailed] = useState(false);

  if (exploreMediaType(post) === 'photo') {
    return (
      <img
        src={getMediaThumbnail(post.thumbnail || post.media_url, IMG_WIDTH)}
        alt={post.content || 'Post'}
        loading="lazy"
        className={className}
      />
    );
  }

  const posterSrc = tilePosterUrl(post);
  const videoSrc = resolveMediaSrc(post.media_url);

  if (posterSrc && !posterFailed) {
    return (
      <img
        src={posterSrc}
        alt={post.content || 'Reel'}
        loading="lazy"
        onError={() => setPosterFailed(true)}
        className={className}
      />
    );
  }

  return (
    <video
      src={videoSrc || ''}
      preload="metadata"
      muted
      playsInline
      controls={false}
      className={cn(className, 'pointer-events-none')}
    />
  );
}

function TileSkeleton() {
  return (
    <div className="mb-1 break-inside-avoid w-full">
      <Skeleton className="w-full aspect-[4/5] rounded-md" />
    </div>
  );
}

export const ExploreMasonryGrid = ({ posts, loading, columnsClassName, onPostClick }: ExploreMasonryGridProps) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const navigate = useNavigate();
  const columnsClass = columnsClassName || 'columns-2 sm:columns-3 lg:columns-4';

  const handleTileClick = (post: ExplorePost, index: number) => {
    if (exploreMediaType(post) === 'photo') {
      navigate(`/post/${post.id}`);
      return;
    }
    onPostClick(post, index);
  };

  if (loading && posts.length === 0) {
    return (
      <div className={cn(columnsClass, 'gap-1')}>
        {Array.from({ length: LOADER_COUNT }, (_, i) => (
          <TileSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-muted-foreground">Nothing here yet.</p>
        <p className="text-sm text-muted-foreground/70">Check back soon for new posts.</p>
      </div>
    );
  }

  return (
    <div className={cn(columnsClass, 'gap-1')}>
      {posts.map((post, index) => {
        const playable = exploreMediaType(post) !== 'photo';
        const aspect = tileAspect(post, index);
        const likes = post.likes?.[0]?.count ?? post.likes_count ?? 0;
        const comments = formatCount(post.comments?.[0]?.count ?? post.comments_count ?? 0);

        return (
          <button
            key={post.id}
            type="button"
            onClick={() => handleTileClick(post, index)}
            onMouseEnter={() => setHoveredId(post.id)}
            onMouseLeave={() => setHoveredId(null)}
            className={cn(
              'group relative mb-1 block w-full overflow-hidden rounded-md bg-muted text-left',
              'break-inside-avoid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
            style={{ aspectRatio: aspect }}
            aria-label={`View post by ${post.profiles?.display_name || post.profiles?.username || 'user'}`}
          >
            <TileMedia
              post={post}
              className={cn(
                'h-full w-full object-cover transition-transform duration-300 group-hover:scale-105',
                'group-hover:brightness-90'
              )}
            />

            {playable && (
              <div className="absolute right-2 top-2 flex items-center justify-center rounded-full bg-black/50 p-1.5 backdrop-blur-sm">
                <Play className="h-3.5 w-3.5 text-white fill-white" />
              </div>
            )}

            {playable && post.duration ? (
              <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {formatDuration(post.duration)}
              </span>
            ) : null}

            <div
              className={cn(
                'absolute inset-0 flex items-center justify-center gap-4 bg-black/45 transition-opacity',
                hoveredId === post.id ? 'opacity-100' : 'opacity-0'
              )}
            >
              <span className="flex items-center text-sm font-semibold text-white">
                <StaticReactionIcon reactionKey={null} size="sm" count={likes} />
              </span>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
                <MessageCircle className="h-5 w-5 fill-current" />
                {comments}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
};