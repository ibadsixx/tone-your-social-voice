import { useState, useRef, useCallback } from 'react';
import { Heart, MessageCircle, Send, MoreHorizontal } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import ReelPlayer from '@/components/ReelPlayer';
import { useReelInteractions } from '@/hooks/useReelInteractions';
import { cn } from '@/lib/utils';
import ReelCommentsModal from './ReelCommentsModal';
import ReelShareModal from './ReelShareModal';
import ReelMoreMenu from './ReelMoreMenu';
interface ReelCardProps {
  reel: {
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
    profiles: {
      username: string;
      display_name: string;
      profile_pic: string | null;
    };
  };
  isActive: boolean;
  onDoubleTap?: () => void;
  onHideReel?: () => Promise<void>;
}

const ReelCard = ({ reel, isActive, onDoubleTap, onHideReel }: ReelCardProps) => {
  const {
    likesCount,
    commentsCount,
    isLikedByCurrentUser,
    toggleLike
  } = useReelInteractions(reel.id);

  const [showHeart, setShowHeart] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const lastTapRef = useRef<number>(0);
  const heartTimeoutRef = useRef<NodeJS.Timeout>();
  // Double tap detection
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
      
      onDoubleTap?.();
    }

    lastTapRef.current = now;
  }, [isLikedByCurrentUser, toggleLike, onDoubleTap]);

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
    console.log(`[SHARE_MODAL] opened reel_id=${reel.id}`);
    setShowShareModal(true);
  };
  return (
    <div 
      className="relative w-full h-screen snap-start snap-always flex items-center justify-center bg-black"
      onClick={handleTap}
    >
      {/* Reel Player */}
      <ReelPlayer
        mediaUrl={reel.media_url}
        mediaType={reel.media_type}
        duration={reel.duration}
        musicUrl={reel.music_url}
        musicSource={reel.music_source}
        musicStart={reel.music_start}
        musicVideoId={reel.music_video_id}
        isActive={isActive}
        className="w-full max-w-[600px]"
      />

      {/* Double-tap heart animation */}
      {showHeart && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <Heart 
            className="w-32 h-32 text-white fill-white animate-heart-burst" 
            strokeWidth={1}
          />
        </div>
      )}

      {/* Right sidebar with actions */}
      <div className="absolute right-4 bottom-24 flex flex-col gap-4 z-10">
        {/* Profile avatar */}
        <div className="flex flex-col items-center">
          <Avatar className="w-12 h-12 border-2 border-white">
            <AvatarImage src={reel.profiles?.profile_pic || undefined} />
            <AvatarFallback>{reel.profiles?.display_name?.[0] || '?'}</AvatarFallback>
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
            {likesCount > 0 ? likesCount : ''}
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
            {commentsCount > 0 ? commentsCount : ''}
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
        </button>
        {/* More options */}
        <ReelMoreMenu
          reelId={reel.id}
          reelOwnerId={reel.user_id}
          isPublic={true}
          isOpen={showMoreMenu}
          onOpenChange={setShowMoreMenu}
          onHideReel={onHideReel}
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
                <MoreHorizontal className="w-6 h-6 text-white" />
              </div>
            </button>
          }
        />
      </div>

      {/* Bottom info overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-10">
        <div className="max-w-[85%]">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-white font-semibold drop-shadow-lg">
              @{reel.profiles?.username || 'user'}
            </span>
          </div>
          {reel.content && (
            <p className="text-white text-sm drop-shadow-lg line-clamp-2">
              {reel.content}
            </p>
          )}
          {reel.music_url && (
            <div className="flex items-center gap-2 mt-2">
              <div className="w-6 h-6 rounded-full bg-white/20 animate-spin" />
              <span className="text-white text-xs drop-shadow-lg">
                Original Audio
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Comments Modal */}
      <ReelCommentsModal
        reelId={reel.id}
        isOpen={showComments}
        onClose={() => setShowComments(false)}
      />

      {/* Share Modal */}
      <ReelShareModal
        reelId={reel.id}
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
      />
    </div>
  );
};

export default ReelCard;
