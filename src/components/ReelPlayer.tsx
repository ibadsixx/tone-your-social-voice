import { useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import StoryAudioPlayer from '@/components/StoryAudioPlayer';
import PlayPauseButton from '@/components/media/PlayPauseButton';
import MuteButton from '@/components/media/MuteButton';
import SettingsPanel from '@/components/media/SettingsPanel';
import { useMediaControls } from '@/hooks/useMediaControls';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ReelPlayerProps {
  mediaUrl: string;
  mediaType: 'video' | 'image';
  duration?: number;
  musicUrl?: string | null;
  musicSource?: string | null;
  musicStart?: number;
  musicVideoId?: string | null;
  isActive?: boolean;
  className?: string;
  onEnded?: () => void;
}

const ReelPlayer = ({ 
  mediaUrl, 
  mediaType, 
  duration = 15,
  musicUrl,
  musicSource,
  musicStart = 0,
  musicVideoId,
  isActive = true, 
  className,
  onEnded 
}: ReelPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioPlayerRef = useRef<any>(null);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const [imageTimer, setImageTimer] = useState<NodeJS.Timeout | null>(null);
  const [audioReady, setAudioReady] = useState(!musicUrl);
  
  const {
    settings,
    isPlaying,
    isSettingsOpen,
    togglePlay,
    toggleMute,
    setSpeed,
    setQuality,
    toggleLoop,
    toggleAutoReplay,
    toggleShowControls,
    openSettings,
    closeSettings,
    setIsPlaying
  } = useMediaControls();

  // Apply playback speed to video
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = settings.speed;
    }
  }, [settings.speed]);

  // Play/pause video based on user interaction only
  useEffect(() => {
    if (mediaType !== 'video' || !videoRef.current) return;

    if (isPlaying && audioReady) {
      videoRef.current.play().catch(err => {
        console.log('Play prevented:', err);
      });
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying, mediaType, audioReady]);

  // Handle image reel timer
  useEffect(() => {
    if (mediaType !== 'image' || !isActive || !isPlaying) {
      if (imageTimer) {
        clearTimeout(imageTimer);
        setImageTimer(null);
      }
      return;
    }

    const timer = setTimeout(() => {
      console.log('Image reel duration completed');
      onEnded?.();
    }, duration * 1000);

    setImageTimer(timer);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [mediaType, isActive, duration, isPlaying, onEnded]);

  // Handle video end event
  useEffect(() => {
    const video = videoRef.current;
    if (!video || mediaType !== 'video') return;

    const handleVideoEnd = () => {
      if (settings.loop || settings.autoReplay) {
        video.currentTime = 0;
        video.play();
        // Reset music
        if (audioPlayerRef.current?.seekTo) {
          audioPlayerRef.current.seekTo(musicStart || 0);
        }
      } else {
        onEnded?.();
      }
    };

    video.addEventListener('ended', handleVideoEnd);
    return () => video.removeEventListener('ended', handleVideoEnd);
  }, [mediaType, settings.loop, settings.autoReplay, musicStart, onEnded]);

  // Handle long press to pause
  const handlePressStart = () => {
    setIsLongPressing(true);
    setIsPlaying(false);
  };

  const handlePressEnd = () => {
    setIsLongPressing(false);
    setIsPlaying(true);
  };

  const handlePlayPauseToggle = () => {
    togglePlay();
  };

  return (
    <div 
      className={cn(
        "relative mx-auto rounded-xl overflow-hidden bg-black",
        className
      )}
      style={{ 
        aspectRatio: '9/16', 
        maxHeight: '90vh',
        width: 'fit-content'
      }}
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
      onMouseLeave={handlePressEnd}
      onTouchStart={handlePressStart}
      onTouchEnd={handlePressEnd}
      onTouchCancel={handlePressEnd}
    >
      {mediaType === 'video' ? (
        <video
          ref={videoRef}
          src={mediaUrl}
          className="w-full h-full object-cover"
          playsInline
          controls
          muted={settings.muted || !!musicUrl}
          loop={settings.loop}
          preload="metadata"
        />
      ) : (
        <img
          src={mediaUrl}
          alt="Reel"
          className="w-full h-full object-cover"
         loading="lazy" decoding="async" />
      )}
      
      {/* Audio player for music */}
      {musicUrl && (
        <StoryAudioPlayer
          ref={audioPlayerRef}
          musicUrl={musicUrl}
          startAt={musicStart}
          duration={duration}
          sourceType={musicSource || undefined}
          videoId={musicVideoId || undefined}
          isActive={isActive && isPlaying}
          manualPause={isLongPressing || !isPlaying}
          isMuted={settings.muted}
          onAudioReady={() => setAudioReady(true)}
          onPlay={() => console.log('[Reel Player] Music playing')}
          onPause={() => console.log('[Reel Player] Music paused')}
          onBuffering={() => console.log('[Reel Player] Music buffering')}
          onEnded={() => {
            console.log('[Reel Player] Music ended');
            if (settings.loop || settings.autoReplay) {
              // Will be handled by video end event
            } else {
              onEnded?.();
            }
          }}
        />
      )}
      
      {/* Control buttons */}
      {settings.showControls && (
        <div className="absolute bottom-20 right-4 flex flex-col gap-3 z-10">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              openSettings();
            }}
            className="h-10 w-10 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-sm"
          >
            <Settings className="h-5 w-5" />
          </Button>
          
          <MuteButton
            isMuted={settings.muted}
            onToggle={toggleMute}
          />
          
          <PlayPauseButton
            isPlaying={isPlaying}
            onToggle={handlePlayPauseToggle}
          />
        </div>
      )}
      
      {/* Settings Panel */}
      <SettingsPanel
        open={isSettingsOpen}
        onOpenChange={closeSettings}
        settings={settings}
        onSpeedChange={setSpeed}
        onQualityChange={setQuality}
        onLoopToggle={toggleLoop}
        onAutoReplayToggle={toggleAutoReplay}
        onShowControlsToggle={toggleShowControls}
        showQualitySelector={mediaType === 'video'}
      />
    </div>
  );
};

export default ReelPlayer;
