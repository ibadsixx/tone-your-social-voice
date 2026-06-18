import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, ChevronLeft, ChevronRight, Trash2, Eye, Bookmark, Send, Music, Users } from 'lucide-react';
import { Story } from '@/hooks/useStories';
import { useAuth } from '@/hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';
import StoryAnalytics from './StoryAnalytics';
import AddToHighlightDialog from './AddToHighlightDialog';
import StoryReactions from './StoryReactions';
import StoryArchiveButton from './StoryArchiveButton';
import StoryPollSticker from './StoryPollSticker';
import StoryQuestionSticker from './StoryQuestionSticker';
import StoryAudioPlayer from './StoryAudioPlayer';
import { useStoryMentions } from '@/hooks/useStoryMentions';
import { useStoryPolls } from '@/hooks/useStoryPolls';
import { useStoryQuestions } from '@/hooks/useStoryQuestions';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface StoryViewerProps {
  stories: Story[];
  username: string;
  displayName: string;
  profilePic: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onView: (storyId: string) => void;
  onDelete?: (storyId: string) => void;
  initialIndex?: number;
}

function DrawingCanvas({ drawings, scale, width, height }: { drawings: any[]; scale: number; width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, width, height);

    for (const stroke of drawings) {
      const pts = stroke.points;
      if (pts.length < 4) continue;

      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = stroke.tool === 'eraser' ? '#000000' : stroke.color;
      ctx.lineWidth = (stroke.tool === 'highlighter' ? stroke.size * 2.5 : stroke.size) * scale;
      ctx.globalAlpha = stroke.tool === 'highlighter' ? 0.35 : 1;
      if (stroke.tool === 'neon') {
        ctx.shadowColor = stroke.color;
        ctx.shadowBlur = 15 * scale;
      } else {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      }

      ctx.moveTo(pts[0] * scale, pts[1] * scale);
      for (let i = 2; i < pts.length - 1; i += 2) {
        const xc = (pts[i] * scale + pts[i + 2] * scale) / 2;
        const yc = (pts[i + 1] * scale + pts[i + 3] * scale) / 2;
        ctx.quadraticCurveTo(pts[i] * scale, pts[i + 1] * scale, xc, yc);
      }
      const last = pts.length - 2;
      ctx.lineTo(pts[last] * scale, pts[last + 1] * scale);
      ctx.stroke();
    }
  }, [drawings, scale, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 z-10"
      style={{ pointerEvents: 'none' }}
    />
  );
}

const StoryViewer = ({
  stories,
  username,
  displayName,
  profilePic,
  open,
  onOpenChange,
  onView,
  onDelete,
  initialIndex = 0
}: StoryViewerProps) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [highlightDialogOpen, setHighlightDialogOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number; time: number } | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentBounds, setContentBounds] = useState({ w: 360, h: 640 });
  const currentStory = stories[currentIndex];
  const currentStoryId = currentStory?.id;
  const currentStoryDuration = currentStory?.duration;
  const currentStoryMediaType = currentStory?.media_type;
  const currentStoryMusicUrl = currentStory?.music_url;
  const isOwner = user?.id === currentStory?.user_id;
  
  // Ref to track viewed stories (prevents re-triggering onView)
  const viewedStoriesRef = useRef<Set<string>>(new Set());
  // Ref to track if handleNext was already called for current story
  const hasAdvancedRef = useRef(false);
  // Track previous open state to detect when dialog opens
  const prevOpenRef = useRef(open);
  // Ref to track if component is mounted (prevents state updates after unmount)
  const isMountedRef = useRef(true);
  // Ref to track if audio ended was already handled for current story
  const audioEndedHandledRef = useRef(false);
  
  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  // Reset everything when dialog opens
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      console.log('[Story] Dialog opened, resetting state');
      setCurrentIndex(initialIndex);
      setProgress(0);
      viewedStoriesRef.current.clear();
      hasAdvancedRef.current = false;
      audioEndedHandledRef.current = false;
    }
    prevOpenRef.current = open;
  }, [open, initialIndex]);
  
  // Fetch interactive elements using stable ID
  const { mentions } = useStoryMentions(currentStoryId);

  const drawings = useMemo(() => {
    if (!currentStory?.caption) return [];
    try {
      const captionData = JSON.parse(currentStory.caption);
      return captionData.drawings || [];
    } catch { return []; }
  }, [currentStory?.caption]);

  const mentionOverlays = useMemo(() => {
    if (!currentStory?.caption) return [];
    try {
      const captionData = JSON.parse(currentStory.caption);
      return (captionData.overlays || []).filter((o: any) => o.type === 'mention');
    } catch {
      return [];
    }
  }, [currentStory?.caption]);
  const { poll, vote } = useStoryPolls(currentStoryId);
  const { question, respond } = useStoryQuestions(currentStoryId);

  // Memoized navigation handlers to prevent stale closures
  const handleNext = useCallback(() => {
    // Prevent double-triggering and guard against unmounted state
    if (!isMountedRef.current) {
      console.log('[Story] handleNext blocked - component unmounted');
      return;
    }
    if (hasAdvancedRef.current) {
      console.log('[Story] handleNext blocked - already advancing');
      return;
    }
    hasAdvancedRef.current = true;
    
    // Use setTimeout to break the synchronous call chain and prevent re-entrancy
    setTimeout(() => {
      if (!isMountedRef.current) return;
      
      setCurrentIndex(prev => {
        if (prev < stories.length - 1) {
          console.log('[Story] Advancing to next story:', prev + 1);
          return prev + 1;
        } else {
          console.log('[Story] No more stories, closing viewer');
          onOpenChange(false);
          return prev;
        }
      });
    }, 0);
  }, [stories.length, onOpenChange]);

  const handlePrev = useCallback(() => {
    setCurrentIndex(prev => {
      if (prev > 0) {
        hasAdvancedRef.current = false; // Reset for new story
        return prev - 1;
      }
      return prev;
    });
  }, []);

  // Reset state when story changes (using stable ID)
  useEffect(() => {
    console.log('[Story] Story changed to:', currentStoryId);
    hasAdvancedRef.current = false; // Reset advance flag for new story
    audioEndedHandledRef.current = false; // Reset audio ended flag
    setAudioReady(!currentStoryMusicUrl); // If no music, ready immediately
    setIsPaused(false);
    setIsHolding(false);
    setProgress(0);
  }, [currentStoryId, currentStoryMusicUrl]);

  // Auto-progress timer (using stable primitive dependencies)
  useEffect(() => {
    if (!open || !currentStoryId) return;

    console.log('[Story] Timer effect running for:', currentStoryId);

    // Mark as viewed only once per story
    if (!viewedStoriesRef.current.has(currentStoryId)) {
      viewedStoriesRef.current.add(currentStoryId);
      onView(currentStoryId);
    }

    // Use story duration from DB, with fallback: 15s for video, 5s for image
    const storyDuration = currentStoryDuration || (currentStoryMediaType === 'video' ? 15 : 5);
    const durationMs = Math.min(storyDuration, 15) * 1000; // Cap at 15s, convert to ms
    console.log('[Story] Duration:', storyDuration, 's, durationMs:', durationMs, 'audioReady:', audioReady);
    
    const intervalMs = 50;
    const increment = (intervalMs / durationMs) * 100;

    // Safety fallback: start story after 3 seconds even if audio doesn't load
    const fallbackTimer = setTimeout(() => {
      setAudioReady(prev => {
        if (!prev) {
          console.log('[Story] Audio timeout - forcing ready');
          return true;
        }
        return prev;
      });
    }, 3000);

    // Only start timer if audio is ready AND not paused AND not holding
    let timer: ReturnType<typeof setInterval> | undefined;
    if (audioReady && !isPaused && !isHolding) {
      console.log('[Story] Starting progress timer');
      timer = setInterval(() => {
        setProgress(prev => {
          const newProgress = prev + increment;
          if (newProgress >= 100) {
            console.log('[Story] Progress complete, advancing');
            clearInterval(timer);
            handleNext();
            return 100;
          }
          return newProgress;
        });
      }, intervalMs);
    }

    return () => {
      clearTimeout(fallbackTimer);
      if (timer) clearInterval(timer);
    };
  }, [currentStoryId, currentStoryDuration, currentStoryMediaType, open, audioReady, isPaused, isHolding, handleNext, onView]);

  const handleDelete = () => {
    if (onDelete && currentStory) {
      onDelete(currentStory.id);
      if (currentIndex === stories.length - 1) {
        onOpenChange(false);
      } else {
        handleNext();
      }
    }
  };

  const handleReply = async () => {
    if (!replyText.trim() || !currentStory || !user) return;

    try {
      // Get or create DM conversation
      const { data: conversationData, error: convError } = await supabase
        .rpc('get_or_create_dm', {
          p_user_a: user.id,
          p_user_b: currentStory.user_id
        });

      if (convError) throw convError;

      // Send message with story reference
      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationData,
          sender_id: user.id,
          content: `📸 Replied to your story: ${replyText}`
        });

      if (messageError) throw messageError;

      toast({
        title: 'Reply sent',
        description: 'Your reply has been sent as a message'
      });

      setReplyText('');
      setShowReplyInput(false);
    } catch (error: any) {
      console.error('Error sending reply:', error);
      toast({
        title: 'Error',
        description: 'Failed to send reply',
        variant: 'destructive'
      });
    }
  };

  const handlePressStart = () => {
    console.log('[Story] Press and hold - pausing');
    setIsHolding(true);
  };

  const handlePressEnd = () => {
    console.log('[Story] Release - resuming');
    setIsHolding(false);
  };

  // Swipe gesture handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setTouchStart({
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now()
    });
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;
    const deltaTime = Date.now() - touchStart.time;

    // Detect swipe: horizontal movement > 50px and faster than 300ms
    const isSwipe = Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) && deltaTime < 300;

    if (isSwipe) {
      if (deltaX > 0) {
        // Swipe right → previous story
        handlePrev();
      } else {
        // Swipe left → next story
        handleNext();
      }
    }

    setTouchStart(null);
  };

  // Tap zone navigation (left 1/3 = prev, right 1/3 = next)
  const handleTapNavigation = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;

    if (clickX < width / 3) {
      handlePrev();
    } else if (clickX > (width * 2) / 3) {
      handleNext();
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, handleNext, handlePrev, onOpenChange]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContentBounds({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const storyAspect = 9 / 16;
  const cAspect = contentBounds.w / contentBounds.h;
  let displayW: number, displayH: number, offX: number, offY: number;
  if (cAspect > storyAspect) {
    displayH = contentBounds.h;
    displayW = displayH * storyAspect;
    offX = (contentBounds.w - displayW) / 2;
    offY = 0;
  } else {
    displayW = contentBounds.w;
    displayH = displayW / storyAspect;
    offX = 0;
    offY = (contentBounds.h - displayH) / 2;
  }
  const scale = displayW / 360;

  if (!currentStory) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md h-[90vh] p-0 bg-black border-none">
        {/* Progress bars */}
        <div className="absolute top-0 left-0 right-0 z-50 flex gap-1 p-2">
          {stories.map((_, idx) => (
            <div key={idx} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-100"
                style={{
                  width: idx === currentIndex ? `${progress}%` : idx < currentIndex ? '100%' : '0%'
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-4 left-0 right-0 z-50 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Avatar className="h-10 w-10 border-2 border-white">
              <AvatarImage src={profilePic || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-semibold text-white">{displayName}</p>
              <p className="text-xs text-white/80">
                {new Date(currentStory.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            {isOwner ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                  onClick={() => setAnalyticsOpen(true)}
                  title="View analytics"
                >
                  <Eye className="w-5 h-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                  onClick={handleDelete}
                  title="Delete story"
                >
                  <Trash2 className="w-5 h-5" />
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => setHighlightDialogOpen(true)}
                title="Add to highlight"
              >
                <Bookmark className="w-5 h-5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={() => onOpenChange(false)}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Story content */}
        <div 
          ref={contentRef}
          className="relative w-full h-full flex items-center justify-center overflow-hidden"
          style={{ maxHeight: 'calc(90vh - 8rem)' }}
          onMouseDown={handlePressStart}
          onMouseUp={handlePressEnd}
          onMouseLeave={handlePressEnd}
          onClick={handleTapNavigation}
          onTouchStart={(e) => {
            handlePressStart();
            handleTouchStart(e);
          }}
          onTouchEnd={(e) => {
            handlePressEnd();
            handleTouchEnd(e);
          }}
          onTouchCancel={handlePressEnd}
        >
          {/* Blurred background */}
          <div 
            className="absolute inset-0 bg-cover bg-center blur-3xl scale-110 opacity-50"
            style={{ 
              backgroundImage: `url(${currentStory.media_url})`,
              filter: 'blur(40px)'
            }}
          />

          {/* Dim overlay when holding */}
          {isHolding && (
            <div className="absolute inset-0 bg-black/30 z-20 pointer-events-none" />
          )}

          {/* Audio Player */}
          {currentStory.music_url && (
            <StoryAudioPlayer
              musicUrl={currentStory.music_url}
              musicTitle={currentStory.music_title}
              startAt={currentStory.music_start_at || 0}
              duration={currentStory.music_duration || 15}
              sourceType={currentStory.music_source_type || undefined}
              videoId={currentStory.music_video_id || undefined}
              isActive={open && currentStoryId === currentStory.id}
              manualPause={isHolding}
              onAudioReady={() => {
                if (isMountedRef.current) setAudioReady(true);
              }}
              onPlay={() => {
                console.log('[Story] Music playing - resuming story');
                if (isMountedRef.current) setIsPaused(false);
              }}
              onPause={() => {
                console.log('[Story] Music paused - pausing story');
                if (isMountedRef.current) setIsPaused(true);
              }}
              onBuffering={() => {
                console.log('[Story] Music buffering - pausing story');
                if (isMountedRef.current) setIsPaused(true);
              }}
              onEnded={() => {
                // Guard against multiple onEnded calls for the same story
                if (audioEndedHandledRef.current) {
                  console.log('[Story] Music onEnded blocked - already handled');
                  return;
                }
                audioEndedHandledRef.current = true;
                console.log('[Story] Music ended - ending story');
                // Don't call handleNext from audio ended - let progress timer handle it
                // This prevents race conditions when audio ends before expected
              }}
              onError={(error) => {
                console.error('Audio player error:', error);
                toast({
                  title: 'Music Error',
                  description: error,
                  variant: 'destructive'
                });
              }}
            />
          )}

          {/* Loading overlay while waiting for audio */}
          {currentStory.music_url && !audioReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-30">
              <div className="text-white text-sm flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Loading audio...
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={currentStory.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative w-full h-full max-w-full max-h-full flex items-center justify-center"
            >
              {currentStory.media_type === 'video' ? (
                <video
                  key={currentStory.id}
                  src={currentStory.media_url}
                  className="max-w-full max-h-full object-contain"
                  style={{ maxWidth: '100%', maxHeight: '100%' }}
                  autoPlay
                  muted={(() => {
                    try {
                      const captionData = JSON.parse(currentStory.caption || '{}');
                      return captionData.videoMuted !== false;
                    } catch {
                      return true;
                    }
                  })()}
                  playsInline
                  loop={false}
                  onEnded={() => {
                    console.log('[Story] Video ended naturally');
                    // Don't auto-advance here - let the progress timer handle it
                  }}
                />
              ) : (
                <img
                  src={currentStory.media_url}
                  alt="Story"
                  className="max-w-full max-h-full object-contain"
                  style={{ maxWidth: '100%', maxHeight: '100%' }}
                />
              )}
            </motion.div>
          </AnimatePresence>

          {/* Drawings canvas + Mention overlays from caption JSON */}
          <div
            className="absolute z-20"
            style={{
              left: offX,
              top: offY,
              width: displayW,
              height: displayH,
              pointerEvents: 'none',
            }}
          >
            {drawings.length > 0 && (
              <DrawingCanvas drawings={drawings} scale={scale} width={displayW} height={displayH} />
            )}
            {mentionOverlays.map((m: any) => (
                <div
                  key={m.id}
                  className="absolute flex items-center justify-center cursor-pointer pointer-events-auto"
                  style={{
                    left: m.x * scale,
                    top: m.y * scale,
                    width: (m.width || 160) * (m.scaleX || 1) * scale,
                    height: (m.height || 40) * (m.scaleY || 1) * scale,
                  }}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    if (m.mentionedUsername) {
                      navigate(`/profile/${m.mentionedUsername}`);
                      onOpenChange(false);
                    }
                  }}
                >
                  <span className="text-white text-base font-bold" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
                    {m.text || `@${m.mentionedUsername || 'user'}`}
                  </span>
                </div>
              ))}
          </div>

          {/* Navigation buttons (optional visual indicators) */}
          {currentIndex > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 z-30"
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
            >
              <ChevronLeft className="w-6 h-6" />
            </Button>
          )}
          {currentIndex < stories.length - 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 z-30"
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
            >
              <ChevronRight className="w-6 h-6" />
            </Button>
          )}
        </div>

        {/* Caption, Music, Reactions and Reply Input */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent">
          <div className="px-4 pt-4 space-y-3">
            {/* Mentions indicator */}
            {mentions.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowMentions(!showMentions)}
                className="text-white hover:bg-white/20"
              >
                <Users className="w-4 h-4 mr-2" />
                {mentions.length} {mentions.length === 1 ? 'person' : 'people'} tagged
              </Button>
            )}
            
            {/* Show mentions */}
            {showMentions && mentions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {mentions.map((mention) => (
                  <button
                    key={mention.id}
                    onClick={() => navigate(`/profile/${mention.profile?.username}`)}
                    className="flex items-center gap-2 bg-black/50 rounded-full px-3 py-1 text-sm text-white hover:bg-black/70"
                  >
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="text-xs">
                        {mention.profile?.display_name[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    @{mention.profile?.username}
                  </button>
                ))}
              </div>
            )}
            
            {/* Poll */}
            {poll && <StoryPollSticker poll={poll} onVote={(index) => vote(poll.id, index)} />}
            
            {/* Question */}
            {question && !isOwner && (
              <StoryQuestionSticker
                question={question}
                onRespond={(response) => respond(question.id, response)}
              />
            )}
            
            {/* Music indicator */}
            {currentStory.music_title && (
              <div className="flex items-center gap-2 text-white/90 bg-black/30 rounded-full px-3 py-2 w-fit">
                <Music className="w-4 h-4" />
                <span className="text-sm">{currentStory.music_title}</span>
              </div>
            )}
            
            {/* Caption */}
            {currentStory.caption && (
              <p className="text-white text-center">{currentStory.caption}</p>
            )}

            {/* Reactions and Archive */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1">
                <StoryReactions storyId={currentStory.id} />
              </div>
              {isOwner && (
                <StoryArchiveButton 
                  storyId={currentStory.id}
                  mediaUrl={currentStory.media_url}
                  variant="ghost"
                  size="sm"
                />
              )}
            </div>
          </div>
          
          {!isOwner && (
            <div className="p-4">
              {!showReplyInput ? (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => setShowReplyInput(true)}
                >
                  <Send className="w-4 h-4 mr-2" />
                  Send Message
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Send a message..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleReply()}
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                  />
                  <Button onClick={handleReply} size="icon">
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>

      {/* Story Analytics Dialog */}
      {isOwner && currentStory && (
        <StoryAnalytics
          storyId={currentStory.id}
          open={analyticsOpen}
          onOpenChange={setAnalyticsOpen}
        />
      )}

      {/* Add to Highlight Dialog */}
      {isOwner && currentStory && (
        <AddToHighlightDialog
          storyId={currentStory.id}
          open={highlightDialogOpen}
          onOpenChange={setHighlightDialogOpen}
        />
      )}
    </Dialog>
  );
};

export default StoryViewer;
