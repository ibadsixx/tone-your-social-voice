import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Video } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { getMediaThumbnail, getVideoPoster, formatDuration } from '@/lib/mediaThumbnail';
import { resolveMediaSrc } from '@/lib/mediaUrl';
import { extractProfileReels } from '@/lib/profileReels';
import type { ProfileReel, ReelSourcePost } from '@/lib/profileReels';

interface ProfileReelsGridProps {
  posts: ReelSourcePost[];
  loading?: boolean;
}

const SKELETON_COUNT = 9;
const THUMB_WIDTH = 540;
const THUMB_HEIGHT = 960;
const MEDIA_CLASS = 'h-full w-full object-cover transition-transform duration-300 group-hover:scale-105';

// Profile Reels section: a dedicated 9:16 reel gallery (never post cards). Only
// posts classified as reels are shown; clicking opens the existing /reels/:id
// viewer, which already supports navigating between reels.
export function ProfileReelsGrid({ posts, loading }: ProfileReelsGridProps) {
  const navigate = useNavigate();
  const reels = useMemo(() => extractProfileReels(posts), [posts]);

  if (loading && reels.length === 0) {
    return (
      <div data-testid="profile-reels-grid" className="grid grid-cols-2 gap-1 sm:grid-cols-3 sm:gap-1.5">
        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <Skeleton key={i} className="aspect-[9/16] w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div
        data-testid="profile-reels-empty"
        className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center"
      >
        <Video className="mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-muted-foreground">No reels yet</p>
        <p className="text-sm text-muted-foreground/70">Reels you share will show up here.</p>
      </div>
    );
  }

  return (
    <div data-testid="profile-reels-grid" className="grid grid-cols-2 gap-1 sm:grid-cols-3 sm:gap-1.5">
      {reels.map((reel) => (
        <button
          key={reel.id}
          type="button"
          onClick={() => navigate(`/reels/${reel.id}`)}
          aria-label="Open reel"
          className="group relative aspect-[9/16] overflow-hidden rounded-md bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ReelTileMedia reel={reel} />

          <span className="absolute right-1.5 top-1.5 flex items-center justify-center rounded-full bg-black/50 p-1.5 backdrop-blur-sm">
            <Play className="h-3.5 w-3.5 fill-white text-white" />
          </span>

          {typeof reel.duration === 'number' && reel.duration > 0 && (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {formatDuration(reel.duration)}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function ReelTileMedia({ reel }: { reel: ProfileReel }) {
  const [posterFailed, setPosterFailed] = useState(false);

  if (reel.mediaType === 'image') {
    return (
      <img
        src={getMediaThumbnail(reel.thumbnail || reel.mediaUrl, THUMB_WIDTH, {
          height: THUMB_HEIGHT,
          crop: 'fill',
        })}
        alt=""
        loading="lazy"
        draggable={false}
        className={MEDIA_CLASS}
      />
    );
  }

  const poster = reel.thumbnail
    ? getMediaThumbnail(reel.thumbnail, THUMB_WIDTH, { height: THUMB_HEIGHT, crop: 'fill' })
    : getVideoPoster(reel.mediaUrl, THUMB_WIDTH, THUMB_HEIGHT);

  if (poster && !posterFailed) {
    return (
      <img
        src={poster}
        alt=""
        loading="lazy"
        draggable={false}
        onError={() => setPosterFailed(true)}
        className={MEDIA_CLASS}
      />
    );
  }

  // No stored thumbnail and no Cloudinary poster: fall back to the video's own
  // first frame rather than showing an empty tile.
  return (
    <video
      src={resolveMediaSrc(reel.mediaUrl) || undefined}
      preload="metadata"
      muted
      playsInline
      className={cn(MEDIA_CLASS, 'pointer-events-none')}
    />
  );
}

export default ProfileReelsGrid;
