import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { VideoFilter } from '@/types/videoEditing';

interface VideoPreviewPlayerProps {
  src: string;
  filter: VideoFilter;
  volume: number;
  isPlaying: boolean;
  startTime: number;
  endTime: number;
  onTimeUpdate?: (time: number) => void;
  onLoadedMetadata?: (duration: number) => void;
  onError?: (error: string) => void;
}

export interface VideoPreviewPlayerRef {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  getCurrentTime: () => number;
}

export const VideoPreviewPlayer = forwardRef<VideoPreviewPlayerRef, VideoPreviewPlayerProps>(({
  src,
  filter,
  volume,
  isPlaying,
  startTime,
  endTime,
  onTimeUpdate,
  onLoadedMetadata,
  onError
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoSrc, setVideoSrc] = useState<string>('');

  // Convert data URL to blob URL if needed for better performance
  useEffect(() => {
    console.log('[VideoPreviewPlayer] 🎥 Source received:', src?.substring(0, 100) + '...');
    
    if (!src) {
      setError('No video source provided');
      return;
    }

    // If it's a data URL, convert to blob for better playback
    if (src.startsWith('data:')) {
      console.log('[VideoPreviewPlayer] 🔄 Converting data URL to blob...');
      try {
        const byteString = atob(src.split(',')[1]);
        const mimeString = src.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mimeString });
        const blobUrl = URL.createObjectURL(blob);
        console.log('[VideoPreviewPlayer] ✅ Blob URL created:', blobUrl);
        setVideoSrc(blobUrl);
        
        // Cleanup blob URL on unmount
        return () => URL.revokeObjectURL(blobUrl);
      } catch (e) {
        console.error('[VideoPreviewPlayer] ❌ Failed to convert data URL:', e);
        // Fallback to using data URL directly
        setVideoSrc(src);
      }
    } else {
      // Use the URL directly (blob URL or http URL)
      setVideoSrc(src);
    }
  }, [src]);

  useImperativeHandle(ref, () => ({
    play: () => videoRef.current?.play(),
    pause: () => videoRef.current?.pause(),
    seek: (time: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = time;
      }
    },
    getCurrentTime: () => videoRef.current?.currentTime || 0,
  }));

  // Generate CSS filter string
  const getFilterStyle = () => {
    const filters = [];
    filters.push(`brightness(${filter.brightness}%)`);
    filters.push(`contrast(${filter.contrast}%)`);
    filters.push(`saturate(${filter.saturation}%)`);
    if (filter.blur > 0) {
      filters.push(`blur(${filter.blur}px)`);
    }
    // Temperature is simulated with sepia + hue-rotate
    if (filter.temperature > 0) {
      filters.push(`sepia(${filter.temperature * 0.3}%)`);
    } else if (filter.temperature < 0) {
      filters.push(`hue-rotate(${filter.temperature * 2}deg)`);
    }
    return filters.join(' ');
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.volume = volume / 100;
  }, [volume]);

  // Handle play/pause from parent
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !loaded) return;

    if (isPlaying) {
      video.play().catch(err => console.error('Playback error:', err));
    } else {
      video.pause();
    }
  }, [isPlaying, loaded]);

  // Auto-play and loop when video loads
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !loaded) return;

    // Auto-play on load
    video.play().catch(err => {
      console.log('[VideoPreviewPlayer] Autoplay blocked, user interaction required:', err);
    });
  }, [loaded]);

  // Handle looping within trim bounds
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const currentTime = video.currentTime;
      onTimeUpdate?.(currentTime);
      
      // Loop within trim bounds
      if (endTime > 0 && currentTime >= endTime) {
        video.currentTime = startTime;
        // Continue playing after loop
        if (!video.paused) {
          video.play().catch(() => {});
        }
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [startTime, endTime, onTimeUpdate]);

  const handleLoadedMetadata = () => {
    console.log('[VideoPreviewPlayer] ✅ PREVIEW VIDEO LOADED');
    setLoaded(true);
    setError(null);
    if (videoRef.current) {
      onLoadedMetadata?.(videoRef.current.duration);
      // Set initial position to trim start
      if (startTime > 0) {
        videoRef.current.currentTime = startTime;
      }
    }
  };

  const handleError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const videoEl = e.currentTarget;
    const errorCode = videoEl.error?.code;
    const errorMsg = videoEl.error?.message || 'Failed to load video';
    console.error('[VideoPreviewPlayer] ❌ Error:', errorCode, errorMsg);
    setError(`${errorMsg} (code: ${errorCode})`);
    onError?.(errorMsg);
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black rounded-lg overflow-hidden">
      {error ? (
        <div className="text-destructive text-center p-4">
          <p>{error}</p>
          <p className="text-xs text-muted-foreground mt-2">Try refreshing or re-uploading</p>
        </div>
      ) : videoSrc ? (
        <video
          ref={videoRef}
          src={videoSrc}
          className="max-w-full max-h-full object-contain"
          style={{ filter: getFilterStyle() }}
          playsInline
          loop
          autoPlay
          muted={volume === 0}
          controls={false}
          onLoadedMetadata={handleLoadedMetadata}
          onError={handleError} preload="auto" />
      ) : (
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      )}
      {!loaded && !error && videoSrc && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      )}
    </div>
  );
});

VideoPreviewPlayer.displayName = 'VideoPreviewPlayer';
