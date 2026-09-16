import { useMemo, useState } from 'react';
import { Images } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getMediaThumbnail } from '@/lib/mediaThumbnail';
import { extractPhotoAlbums } from '@/lib/profilePhotos';
import type { PhotoSourcePost } from '@/lib/profilePhotos';
import { PhotoLightbox } from '@/components/PhotoLightbox';

interface ProfilePhotosGridProps {
  posts: PhotoSourcePost[];
  loading?: boolean;
}

const SKELETON_COUNT = 9;
const THUMB_SIZE = 600;

interface ViewerState {
  albumId: string;
  index: number;
}

// Profile Photos section: shows only the profile's photos in a grid (never full
// post cards). A post that holds several images is shown as a single album tile
// with a count badge; opening it lets the visitor page through the set.
export function ProfilePhotosGrid({ posts, loading }: ProfilePhotosGridProps) {
  const albums = useMemo(() => extractPhotoAlbums(posts), [posts]);
  const [viewer, setViewer] = useState<ViewerState | null>(null);

  const activeAlbum = viewer ? albums.find((album) => album.id === viewer.albumId) ?? null : null;

  if (loading && albums.length === 0) {
    return (
      <div data-testid="profile-photos-grid" className="grid grid-cols-3 gap-1 sm:gap-1.5">
        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <Skeleton key={i} className="aspect-square w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (albums.length === 0) {
    return (
      <div
        data-testid="profile-photos-empty"
        className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center"
      >
        <Images className="mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-muted-foreground">No photos yet</p>
        <p className="text-sm text-muted-foreground/70">Photos you share will show up here.</p>
      </div>
    );
  }

  return (
    <>
      <div data-testid="profile-photos-grid" className="grid grid-cols-3 gap-1 sm:gap-1.5">
        {albums.map((album) => {
          const cover = album.images[0];
          const isAlbum = album.images.length > 1;
          return (
            <button
              key={album.id}
              type="button"
              onClick={() => setViewer({ albumId: album.id, index: 0 })}
              aria-label={isAlbum ? `Open album with ${album.images.length} photos` : 'Open photo'}
              className="group relative aspect-square overflow-hidden rounded-md bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <img
                src={getMediaThumbnail(cover.url, THUMB_SIZE, { height: THUMB_SIZE, crop: 'fill' })}
                alt=""
                loading="lazy"
                draggable={false}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              {isAlbum && (
                <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
                  <Images className="h-3.5 w-3.5" />
                  {album.images.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeAlbum && viewer && (
        <PhotoLightbox
          album={activeAlbum}
          index={viewer.index}
          onIndexChange={(index) => setViewer((state) => (state ? { ...state, index } : state))}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  );
}

export default ProfilePhotosGrid;
