import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { gateway } from '@/lib/gateway';
import { useReelInteractions } from '@/hooks/useReelInteractions';
import { Heart, MessageCircle, Send, MoreVertical, X, Bookmark, Volume2, VolumeX, ChevronLeft, ChevronRight } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import ReelCommentsModal from '@/components/reels/ReelCommentsModal';
import ReelShareModal from '@/components/reels/ReelShareModal';
import ReelMoreMenu from '@/components/reels/ReelMoreMenu';

interface ReelData {
  id: string;
  user_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  duration: number;
  music_url: string | null;
  music_source: string | null;
  music_start: number;
  music_video_id: string | null;
  content: string | null;
  likes_count: number;
  comments_count: number;
  share_count: number;
  created_at: string;
  profiles: {
    username: string;
    display_name: string;
    profile_pic: string | null;
  };
}

const ReelViewer = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const [reel, setReel] = useState<ReelData | null>(null);
  const [reelsList, setReelsList] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [showHeart, setShowHeart] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  
  const lastTapRef = useRef<number>(0);
  const heartTimeoutRef = useRef<NodeJS.Timeout>();
  
  const {
    likesCount,
    commentsCount,
    sharesCount,
    isLikedByCurrentUser,
    isSavedByCurrentUser,
    toggleLike,
    toggleSave,
    shareReel
  } = useReelInteractions(id || '');

  // Fetch list of all reels for navigation
  useEffect(() => {
    const fetchReelsList = async () => {
      try {
        const { data, error } = await gateway
          .from('posts')
          .select('id')
          .eq('type', 'reel')
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) throw error;
        
        const ids = (data || []).map(r => r.id);
        setReelsList(ids);
        
        // Find current index
        if (id) {
          const idx = ids.indexOf(id);
          if (idx !== -1) {
            setCurrentIndex(idx);
          }
        }
        
        console.log('[REEL_NAV] Loaded reels list, count=' + ids.length);
      } catch (err) {
        console.error('[REEL_NAV] Error fetching reels list:', err);
      }
    };

    fetchReelsList();
  }, []);

  // Update current index when id changes
  useEffect(() => {
    if (id && reelsList.length > 0) {
      const idx = reelsList.indexOf(id);
      if (idx !== -1) {
        setCurrentIndex(idx);
      }
    }
  }, [id, reelsList]);

  // Fetch reel data
  useEffect(() => {
    const fetchReel = async () => {
      if (!id) {
        setError('Invalid reel ID');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const { data, error: fetchError } = await gateway
          .from('posts')
          .select(`
            id,
            user_id,
            media_url,
            media_type,
            duration,
            music_url,
            music_source,
            music_start,
            music_video_id,
            content,
            likes_count,
            comments_count,
            share_count,
            created_at,
            profiles:user_id (
              username,
              display_name,
              profile_pic
            )
          `)
          .eq('id', id)
          .single();

        if (fetchError) throw fetchError;

        if (!data) {
          setError('Reel not found');
          return;
        }

        const formattedReel: ReelData = {
          ...data,
          media_type: data.media_type as 'image' | 'video',
          likes_count: data.likes_count || 0,
          comments_count: data.comments_count || 0,
          share_count: data.share_count || 0,
          profiles: Array.isArray(data.profiles) ? data.profiles[0] : data.profiles
        };

        console.log('[REEL_VIEWER] Loaded reel:', formattedReel.id);
        setReel(formattedReel);
      } catch (err: any) {
        console.error('[REEL_VIEWER] Error fetching reel:', err);
        setError(err.message || 'Failed to load reel');
      } finally {
        setLoading(false);
      }
    };

    fetchReel();
  }, [id]);

  // Auto-play video when loaded
  useEffect(() => {
    if (reel && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(err => {
        console.log('[REEL_VIEWER] Autoplay blocked:', err);
        // If autoplay is blocked, mute and try again
        if (videoRef.current) {
          videoRef.current.muted = true;
          setIsMuted(true);
          videoRef.current.play();
        }
      });
    }
  }, [reel]);

  // Handle close
  const handleClose = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  // Navigate to next reel
  const goToNextReel = useCallback(() => {
    if (reelsList.length === 0) return;
    
    const nextIndex = currentIndex + 1;
    if (nextIndex < reelsList.length) {
      const nextId = reelsList[nextIndex];
      console.log('[REEL_NAV] from=' + id + ' to=' + nextId + ' direction=next');
      navigate(`/reels/${nextId}`, { replace: true });
    }
  }, [reelsList, currentIndex, id, navigate]);

  // Navigate to previous reel
  const goToPrevReel = useCallback(() => {
    if (reelsList.length === 0) return;
    
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      const prevId = reelsList[prevIndex];
      console.log('[REEL_NAV] from=' + id + ' to=' + prevId + ' direction=prev');
      navigate(`/reels/${prevId}`, { replace: true });
    }
  }, [reelsList, currentIndex, id, navigate]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showComments || isShareOpen) return; // Don't navigate when other modals are open

      switch (e.key) {
        case 'Escape':
          if (showMoreMenu) {
            setShowMoreMenu(false);
            return;
          }
          handleClose();
          break;
        case 'ArrowRight':
          if (!showMoreMenu) goToNextReel();
          break;
        case 'ArrowLeft':
          if (!showMoreMenu) goToPrevReel();
          break;
        case ' ':
          if (showMoreMenu) return;
          e.preventDefault();
          if (videoRef.current) {
            if (videoRef.current.paused) {
              videoRef.current.play();
            } else {
              videoRef.current.pause();
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, goToNextReel, goToPrevReel, showComments, isShareOpen, showMoreMenu]);

  // Double tap to like
  const handleTap = useCallback(() => {
    const now = Date.now();
    const timeDiff = now - lastTapRef.current;

    if (timeDiff < 300 && timeDiff > 0) {
      // Double tap detected
      if (!isLikedByCurrentUser) {
        toggleLike();
      }
      
      // Show heart animation
      setShowHeart(true);
      if (heartTimeoutRef.current) clearTimeout(heartTimeoutRef.current);
      heartTimeoutRef.current = setTimeout(() => setShowHeart(false), 1000);
    }

    lastTapRef.current = now;
  }, [isLikedByCurrentUser, toggleLike]);

  // Toggle mute
  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleLikeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleLike();
  };

  const handleCommentsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowComments(true);
  };

  const handleShareClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log(`[SHARE_MODAL] opened reel_id=${id}`);
    setIsShareOpen(true);
  };

  const handleSaveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleSave();
  };

  const canGoNext = currentIndex < reelsList.length - 1;
  const canGoPrev = currentIndex > 0;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <div className="w-full max-w-md aspect-[9/16] rounded-xl overflow-hidden">
          <Skeleton className="w-full h-full bg-gray-800" />
        </div>
      </div>
    );
  }

  if (error || !reel) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <div className="text-center text-white">
          <p className="text-xl mb-4">{error || 'Reel not found'}</p>
          <button
            onClick={handleClose}
            className="px-6 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
      {/* Close button */}
      <button
        onClick={handleClose}
        className="absolute top-4 left-4 z-30 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors"
        aria-label="Close"
      >
        <X className="w-6 h-6 text-white" />
      </button>

      {/* Previous Reel Button */}
      {canGoPrev && (
        <button
          onClick={goToPrevReel}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors"
          aria-label="Previous reel"
        >
          <ChevronLeft className="w-8 h-8 text-white" />
        </button>
      )}

      {/* Next Reel Button */}
      {canGoNext && (
        <button
          onClick={goToNextReel}
          className="absolute right-20 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors"
          aria-label="Next reel"
        >
          <ChevronRight className="w-8 h-8 text-white" />
        </button>
      )}

      {/* Video container */}
      <div 
        className="relative h-full flex items-center justify-center"
        style={{ aspectRatio: '9 / 16', maxHeight: '100vh' }}
        onClick={handleTap}
      >
        {reel.media_type === 'video' ? (
          <video
            ref={videoRef}
            src={reel.media_url}
            className="h-full w-full object-contain"
            autoPlay
            loop
            playsInline
            muted={isMuted}
          />
        ) : (
          <img
            src={reel.media_url}
            alt={reel.content || 'Reel'}
            className="h-full w-full object-contain"
          />
        )}

        {/* Double-tap heart animation */}
        {showHeart && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <Heart 
              className="w-32 h-32 text-white fill-white animate-pulse" 
              strokeWidth={1}
            />
          </div>
        )}

        {/* Mute toggle */}
        {reel.media_type === 'video' && (
          <button
            onClick={handleToggleMute}
            className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <VolumeX className="w-5 h-5 text-white" />
            ) : (
              <Volume2 className="w-5 h-5 text-white" />
            )}
          </button>
        )}

        {/* Right sidebar with actions */}
        <div className="absolute right-4 bottom-24 flex flex-col gap-4 z-10">
          {/* Profile avatar */}
          <div className="flex flex-col items-center">
            <Avatar className="w-12 h-12 border-2 border-white">
              <AvatarImage src={reel.profiles?.profile_pic || undefined} />
              <AvatarFallback className="bg-gray-700 text-white">
                {reel.profiles?.display_name?.[0] || 'U'}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Like button */}
          <button
            onClick={handleLikeClick}
            className="flex flex-col items-center gap-1 transition-transform active:scale-90"
            aria-label={isLikedByCurrentUser ? 'Unlike' : 'Like'}
          >
            <div className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
              <Heart 
                className={cn(
                  "w-7 h-7 transition-colors",
                  isLikedByCurrentUser ? "fill-red-500 text-red-500" : "text-white"
                )} 
              />
            </div>
            <span className="text-white text-xs font-semibold drop-shadow-lg">
              {likesCount > 0 ? likesCount.toLocaleString() : ''}
            </span>
          </button>

          {/* Comment button */}
          <button
            onClick={handleCommentsClick}
            className="flex flex-col items-center gap-1 transition-transform active:scale-90"
            aria-label="Comments"
          >
            <div className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
              <MessageCircle className="w-7 h-7 text-white" />
            </div>
            <span className="text-white text-xs font-semibold drop-shadow-lg">
              {commentsCount > 0 ? commentsCount.toLocaleString() : ''}
            </span>
          </button>

          {/* Share button */}
          <button
            onClick={handleShareClick}
            className="flex flex-col items-center gap-1 transition-transform active:scale-90"
            aria-label="Share"
          >
            <div className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
              <Send className="w-6 h-6 text-white" />
            </div>
            <span className="text-white text-xs font-semibold drop-shadow-lg">
              {sharesCount > 0 ? sharesCount.toLocaleString() : ''}
            </span>
          </button>

          {/* Save button */}
          <button
            onClick={handleSaveClick}
            className="flex flex-col items-center gap-1 transition-transform active:scale-90"
            aria-label={isSavedByCurrentUser ? 'Unsave' : 'Save'}
          >
            <div className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
              <Bookmark 
                className={cn(
                  "w-6 h-6 transition-colors",
                  isSavedByCurrentUser ? "fill-white text-white" : "text-white"
                )} 
              />
            </div>
          </button>

          {/* More options */}
          <ReelMoreMenu
            reelId={reel.id}
            reelOwnerId={reel.user_id}
            isPublic={true}
            isOpen={showMoreMenu}
            onOpenChange={setShowMoreMenu}
            trigger={
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMoreMenu(true);
                }}
                className="flex flex-col items-center transition-transform active:scale-90"
                aria-label="More options"
              >
                <div className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
                  <MoreVertical className="w-6 h-6 text-white" />
                </div>
              </button>
            }
          />
        </div>

        {/* Bottom info overlay */}
        <div className="absolute bottom-0 left-0 right-20 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-10">
          <div className="max-w-[85%]">
            <div className="flex items-center gap-2 mb-2">
              <Avatar className="w-8 h-8 border border-white/50">
                <AvatarImage src={reel.profiles?.profile_pic || undefined} />
                <AvatarFallback className="bg-gray-700 text-white text-xs">
                  {reel.profiles?.display_name?.[0] || 'U'}
                </AvatarFallback>
              </Avatar>
              <span className="text-white font-semibold drop-shadow-lg">
                @{reel.profiles?.username || 'user'}
              </span>
            </div>
            {reel.content && (
              <p className="text-white text-sm drop-shadow-lg line-clamp-3">
                {reel.content}
              </p>
            )}
          </div>
        </div>

        {/* Reel position indicator */}
        {reelsList.length > 1 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-black/50 backdrop-blur-sm">
            <span className="text-white text-sm font-medium">
              {currentIndex + 1} / {reelsList.length}
            </span>
          </div>
        )}
      </div>

      {/* Comments Modal */}
      {id && (
        <ReelCommentsModal
          reelId={id}
          isOpen={showComments}
          onClose={() => setShowComments(false)}
        />
      )}

      {/* Share Modal */}
      {id && (
        <ReelShareModal
          reelId={id}
          isOpen={isShareOpen}
          onClose={() => setIsShareOpen(false)}
        />
      )}
    </div>
  );
};

export default ReelViewer;
