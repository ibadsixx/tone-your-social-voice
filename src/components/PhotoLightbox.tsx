import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { getMediaThumbnail } from '@/lib/mediaThumbnail';
import type { PhotoAlbum } from '@/lib/profilePhotos';

interface PhotoLightboxProps {
  album: PhotoAlbum;
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

// Full-screen photo viewer for the profile Photos gallery. Pages through the
// images of a single album (a multi-image post stays one album) and supports
// Escape to close plus left/right arrows to navigate.
export function PhotoLightbox({ album, index, onIndexChange, onClose }: PhotoLightboxProps) {
  const total = album.images.length;
  const safeIndex = Math.min(Math.max(index, 0), total - 1);
  const current = album.images[safeIndex];
  const canPrev = safeIndex > 0;
  const canNext = safeIndex < total - 1;

  const goPrev = useCallback(() => {
    if (safeIndex > 0) onIndexChange(safeIndex - 1);
  }, [safeIndex, onIndexChange]);

  const goNext = useCallback(() => {
    if (safeIndex < total - 1) onIndexChange(safeIndex + 1);
  }, [safeIndex, total, onIndexChange]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowLeft') goPrev();
      else if (event.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, goPrev, goNext]);

  if (!current) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="Close photo viewer"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className="absolute right-3 top-3 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <X className="h-5 w-5" />
      </button>

      {canPrev && (
        <button
          type="button"
          aria-label="Previous photo"
          onClick={(event) => {
            event.stopPropagation();
            goPrev();
          }}
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:left-4"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      <img
        src={getMediaThumbnail(current.url, 1600)}
        alt=""
        draggable={false}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[90vh] max-w-[92vw] select-none object-contain" loading="eager" decoding="async" />

      {canNext && (
        <button
          type="button"
          aria-label="Next photo"
          onClick={(event) => {
            event.stopPropagation();
            goNext();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-4"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {total > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white">
          {safeIndex + 1} / {total}
        </div>
      )}
    </div>,
    document.body
  );
}
