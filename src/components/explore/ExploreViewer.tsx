import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Heart, MessageCircle, Play } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { resolveMediaSrc } from '@/lib/mediaUrl';
import { getMediaThumbnail } from '@/lib/mediaThumbnail';
import { exploreMediaType, formatCount } from '@/api/explore';
import type { ExplorePost } from '@/api/explore';

interface ExploreViewerProps {
  open: boolean;
  posts: ExplorePost[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

const SWIPE_THRESHOLD = 60;
const WHEEL_DEBOUNCE_MS = 350;

export const ExploreViewer = ({ open, posts, index, onClose, onNavigate }: ExploreViewerProps) => {
  const [direction, setDirection] = useState<1 | -1>(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const wheelLocked = useRef(false);

  const current = posts[index];
  const mediaType = current ? exploreMediaType(current) : 'photo';
  const src = current ? resolveMediaSrc(current.media_url) : '';

  const goTo = useCallback(
    (next: number) => {
      if (next < 0 || next >= posts.length) return;
      setDirection(next > index ? 1 : -1);
      setIsPlaying(false);
      onNavigate(next);
    },
    [posts.length, index, onNavigate]
  );

  const close = useCallback(() => {
    setIsPlaying(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    setIsPlaying(false);
  }, [index]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') goTo(index + 1);
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') goTo(index - 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, index, goTo, close]);

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      if (!open || wheelLocked.current) return;
      const delta = event.deltaY;
      if (Math.abs(delta) < 12) return;
      wheelLocked.current = true;
      window.setTimeout(() => {
        wheelLocked.current = false;
      }, WHEEL_DEBOUNCE_MS);
      if (delta > 0) goTo(index + 1);
      else goTo(index - 1);
    },
    [open, index, goTo]
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [open, handleWheel]);

  const onTouchStart = useCallback((event: React.TouchEvent) => {
    touchStartY.current = event.touches[0].clientY;
  }, []);

  const onTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      if (touchStartY.current === null) return;
      const delta = event.changedTouches[0].clientY - touchStartY.current;
      touchStartY.current = null;
      if (Math.abs(delta) < SWIPE_THRESHOLD) return;
      if (delta < 0) goTo(index + 1);
      else goTo(index - 1);
    },
    [index, goTo]
  );

  if (!open || !current) return null;

  const author = current.profiles;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black">
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        <motion.div
          key={current.id}
          custom={direction}
          initial={{ y: direction > 0 ? '100%' : '-100%', x: 0 }}
          animate={{ y: 0, x: 0 }}
          exit={{ y: direction > 0 ? '-100%' : '100%', x: 0 }}
          transition={{ type: 'tween', duration: 0.32, ease: 'easeOut' }}
          className="absolute inset-0 flex flex-col"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="flex items-center justify-between p-4 text-white">
            <div className="flex min-w-0 items-center gap-3">
              <Link to={`/profile/${author?.username || ''}`} onClick={close}>
                <Avatar className="h-9 w-9">
                  <AvatarImage src={author?.profile_pic || ''} />
                  <AvatarFallback>
                    {author?.display_name?.charAt(0)?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
              </Link>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {author?.display_name || 'Unknown'}
                </p>
                <p className="truncate text-xs text-white/60">@{author?.username || 'unknown'}</p>
              </div>
            </div>
            <button
              onClick={close}
              className="rounded-full p-2 text-white transition-colors hover:bg-white/10"
              aria-label="Close viewer"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="relative min-h-0 flex-1 flex justify-center">
            <AnimatePresence>
              <motion.div
                key={current.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex h-full w-full items-center justify-center"
              >
                {mediaType !== 'photo' ? (
                  <video
                    src={src || ''}
                    poster={getMediaThumbnail(current.thumbnail || current.media_url, 1080)}
                    className="max-h-full max-w-full object-contain"
                    playsInline
                    autoPlay={false}
                    muted={!isPlaying}
                    loop
                    onClick={() => setIsPlaying(prev => !prev)}
                    onEnded={() => setIsPlaying(false)}
                  />
                ) : (
                  <img
                    src={getMediaThumbnail(src, 1080)}
                    alt={current.content || 'Post'}
                    className="max-h-full max-w-full object-contain"
                  />
                )}

                {mediaType !== 'photo' && !isPlaying && (
                  <button
                    onClick={() => setIsPlaying(true)}
                    className="absolute inset-0 flex items-center justify-center bg-black/30"
                    aria-label="Play"
                  >
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
                      <Play className="h-8 w-8 text-white fill-white" />
                    </span>
                  </button>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-6 pb-8 pt-16">
              {current.content ? (
                <p className="line-clamp-3 text-sm text-white">
                  <span className="mr-2 font-semibold">{author?.username || 'user'}</span>
                  {current.content}
                </p>
              ) : null}
              <div className="mt-3 flex items-center gap-5 text-white">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <Heart className="h-5 w-5 fill-current" />
                  {formatCount(current.likes?.[0]?.count ?? current.likes_count ?? 0)}
                </span>
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <MessageCircle className="h-5 w-5 fill-current" />
                  {formatCount(current.comments?.[0]?.count ?? current.comments_count ?? 0)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 pb-4 pt-3">
            {posts.map((post, i) => (
              <button
                key={post.id}
                onClick={() => onNavigate(i)}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/40'
                )}
                aria-label={`Go to post ${i + 1}`}
              />
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};