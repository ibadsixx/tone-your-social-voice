// EditorCanvas - Multi-clip video preview canvas with overlay layers
// Receives player from Editor.tsx - does NOT own its own project state
// Syncs with VideoPlayer for playback
// CRITICAL: Notifies parent when video element is ready for AudioEngine connection

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { VideoFilter, EmojiLayer, TextLayer, ImageLayer, VideoLayer } from '@/types/editor';
import { VideoPlayer } from '@/lib/player';
import { TextLayerCanvas } from './text/TextLayerCanvas';
import { EmojiLayerCanvas } from './emoji/EmojiLayerCanvas';
import { getAudioEngine } from '@/lib/audioEngine';

export interface EditorCanvasRef {
  videoElement: HTMLVideoElement | null;
  seekTo: (time: number) => void;
  play: () => Promise<void>;
  pause: () => void;
  getCurrentClipIndex: () => number;
}

interface EditorCanvasProps {
  isPlaying: boolean;
  isScrubbing: boolean;
  videoLayers: VideoLayer[];
  currentTime: number;
  clipStart: number;
  clipEnd: number;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  globalFilter: VideoFilter;
  emojiLayers: EmojiLayer[];
  textLayers: TextLayer[];
  imageLayers: ImageLayer[];
  onLayerUpdate: (type: 'emoji' | 'text' | 'image', id: string, updates: any) => void;
  onLayerSelect: (type: 'emoji' | 'text' | 'image' | null, id: string | null) => void;
  onLayerDelete: (type: 'emoji' | 'text' | 'image', id: string) => void;
  selectedLayerId: string | null;
  player: VideoPlayer | null;
  // Video audio controls
  videoVolume?: number;
  videoMuted?: boolean;
  // Callback when video element is ready for WebAudio connection
  onVideoElementReady?: (videoElement: HTMLVideoElement) => void;
}

export const EditorCanvas = forwardRef<EditorCanvasRef, EditorCanvasProps>(({
  isPlaying,
  isScrubbing,
  videoLayers,
  currentTime,
  clipStart,
  clipEnd,
  onTimeUpdate,
  onDurationChange,
  globalFilter,
  emojiLayers,
  textLayers,
  imageLayers,
  onLayerUpdate,
  onLayerSelect,
  onLayerDelete,
  selectedLayerId,
  player,
  videoVolume = 100,
  videoMuted = false,
  onVideoElementReady,
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [currentClipIndex, setCurrentClipIndex] = useState(0);
  const [draggingLayer, setDraggingLayer] = useState<{ type: string; id: string } | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; layerX: number; layerY: number } | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const audioEngineConnectedRef = useRef(false);
  
  const playerInitializedRef = useRef(false);
  
  // CRITICAL: Track if any drag/interaction just happened to prevent canvas click clearing selection
  const isDraggingRef = useRef(false);
  const pointerDownRef = useRef(false);

  const sortedClips = [...videoLayers].sort((a, b) => a.start - b.start);
  const currentClip = sortedClips[currentClipIndex] || null;
  const videoSrc = currentClip?.src;

  useImperativeHandle(ref, () => ({
    videoElement: videoRef.current,
    seekTo: (time: number) => {
      console.log('[Canvas] seekTo:', time.toFixed(2));
      if (player) {
        player.seekGlobalTime(time);
      }
    },
    play: async () => {
      if (player) {
        player.play();
      }
    },
    pause: () => {
      if (player) {
        player.pause();
      }
    },
    getCurrentClipIndex: () => currentClipIndex,
  }), [currentClipIndex, player]);

  useEffect(() => {
    const updateSize = () => {
      if (canvasRef.current) {
        setCanvasSize({
          width: canvasRef.current.clientWidth,
          height: canvasRef.current.clientHeight,
        });
      }
    };
    
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  useEffect(() => {
    if (!player) return;

    const handleClipChange = (data: { index: number; clip: VideoLayer }) => {
      console.log(`[Canvas] Clip changed to ${data.index}: ${data.clip.fileName}`);
      setCurrentClipIndex(data.index);
    };

    const handleClipLoaded = (data: { index: number; clip: VideoLayer }) => {
      console.log(`[Canvas] Clip ${data.index} loaded: ${data.clip.fileName}`);
      setVideoLoaded(true);
      setVideoError(null);
    };

    const handleError = (data: { message: string }) => {
      console.error('[Canvas] Player error:', data.message);
      setVideoError(data.message);
      setVideoLoaded(false);
    };

    const handleDurationChange = (data: { duration: number }) => {
      if (data.duration > 0) {
        onDurationChange(data.duration);
      }
    };

    player.on('clipchange', handleClipChange);
    player.on('cliploaded', handleClipLoaded);
    player.on('error', handleError);
    player.on('durationchange', handleDurationChange);

    return () => {
      player.off('clipchange', handleClipChange);
      player.off('cliploaded', handleClipLoaded);
      player.off('error', handleError);
      player.off('durationchange', handleDurationChange);
    };
  }, [player, onDurationChange]);

  useEffect(() => {
    if (!player) return;
    if (!videoRef.current) return;
    if (sortedClips.length === 0) {
      console.log('[Canvas] ⏳ Waiting for clips to load before init...');
      return;
    }
    
    if (playerInitializedRef.current === true) {
      console.log('[Canvas] Player already initialized, updating clips');
      player.setClips(sortedClips);
      return;
    }

    console.log('[Canvas] ✅ Initializing player with', sortedClips.length, 'clips');
    player.init(videoRef.current, sortedClips);
    playerInitializedRef.current = true;
  }, [player, sortedClips]);

  useEffect(() => {
    return () => {
      playerInitializedRef.current = false;
    };
  }, []);

  // CRITICAL: Connect video element to WebAudio when it's ready to play
  // This MUST happen after the video has loaded metadata for createMediaElementSource to work
  const connectVideoToAudioEngine = useCallback(async () => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    if (audioEngineConnectedRef.current) return;
    
    console.log('[AUDIO] Connecting video element to WebAudio...');
    
    try {
      const audioEngine = getAudioEngine();
      
      // Resume AudioContext (required after user interaction)
      await audioEngine.resume();
      console.log('[AUDIO] context state:', audioEngine.getState());
      
      const success = await audioEngine.connectVideoElement(videoEl);
      
      if (success) {
        // VERIFY the graph is truly connected before muting
        const gainNode = audioEngine.getVideoGainNode(videoEl);
        if (!gainNode) {
          console.error('[AUDIO] ❌ Connection returned success but no gain node found - NOT muting video');
          return;
        }
        
        audioEngineConnectedRef.current = true;
        console.log('[AUDIO] source created once: confirmed');
        
        // MANDATORY: Mute video element ONLY AFTER routing is confirmed
        // Audio goes through WebAudio graph, not native video output
        videoEl.muted = true;
        videoEl.volume = 1; // Keep internal at max for WebAudio source signal
        console.log('[AUDIO] video muted AFTER routing: true');
        
        // Apply current volume setting to the gain node
        const effectiveVolume = videoMuted ? 0 : videoVolume;
        audioEngine.setVideoVolume(effectiveVolume);
        console.log(`[AUDIO] video gain applied -> ${(effectiveVolume / 100).toFixed(2)}`);
        
        // Notify parent if callback provided
        onVideoElementReady?.(videoEl);
      } else {
        console.error('[AUDIO] ❌ Failed to connect video - keeping native audio');
        // Don't mute the video if WebAudio connection failed
        videoEl.muted = false;
      }
    } catch (error) {
      console.error('[AUDIO] ❌ Error connecting to AudioEngine:', error);
      // On error, ensure video is not muted so user still hears audio
      if (videoRef.current) {
        videoRef.current.muted = false;
      }
    }
  }, [videoVolume, videoMuted, onVideoElementReady]);

  // CRITICAL: Mute the video element AFTER connecting to WebAudio
  // When using createMediaElementSource, audio is routed through WebAudio graph
  // The video element's native output is bypassed - we mute it to prevent double audio
  // Volume control happens ONLY through videoGainNode in AudioEngine
  useEffect(() => {
    if (videoRef.current && audioEngineConnectedRef.current) {
      // MANDATORY: Mute native video output - all audio goes through WebAudio
      videoRef.current.muted = true;
      videoRef.current.volume = 1; // Keep internal volume at max for WebAudio source
      console.log(`[AUDIO_ENGINE] video muted=true (audio routed through WebAudio ONLY)`);
    }
  }, [audioEngineConnectedRef.current]);

  const filterStyle = `
    brightness(${globalFilter.brightness}%) 
    contrast(${globalFilter.contrast}%) 
    saturate(${globalFilter.saturation}%) 
    ${globalFilter.temperature > 0 ? `sepia(${globalFilter.temperature}%)` : ''} 
    ${globalFilter.temperature < 0 ? `hue-rotate(${globalFilter.temperature}deg)` : ''}
    blur(${globalFilter.blur}px)
    ${globalFilter.hueRotate ? `hue-rotate(${globalFilter.hueRotate}deg)` : ''}
  `.trim();

  // CRITICAL: Connect to AudioEngine when video is ready to play
  // This is the safest time to call createMediaElementSource
  const handleCanPlay = useCallback(() => {
    console.log('[Canvas] Video canplaythrough - connecting to AudioEngine');
    setVideoLoaded(true);
    setVideoError(null);
    
    // Connect video to WebAudio graph
    connectVideoToAudioEngine();
  }, [connectVideoToAudioEngine]);

  const handleError = useCallback(() => {
    const video = videoRef.current;
    const errorMsg = video?.error?.message || 'Unknown error';
    console.error(`[Canvas] Video error: ${errorMsg}`);
    setVideoError(`Video load failed: ${errorMsg}`);
    setVideoLoaded(false);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent, type: string, id: string, layer: any) => {
    e.stopPropagation();
    onLayerSelect(type as any, id);
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    setDraggingLayer({ type, id });
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      layerX: layer.position.x,
      layerY: layer.position.y,
    });
  }, [onLayerSelect]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingLayer || !dragStart || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const deltaX = ((e.clientX - dragStart.x) / rect.width) * 100;
    const deltaY = ((e.clientY - dragStart.y) / rect.height) * 100;

    const newX = Math.max(0, Math.min(100, dragStart.layerX + deltaX));
    const newY = Math.max(0, Math.min(100, dragStart.layerY + deltaY));

    onLayerUpdate(draggingLayer.type as any, draggingLayer.id, {
      position: { x: newX, y: newY }
    });
  }, [draggingLayer, dragStart, onLayerUpdate]);

  const handleMouseUp = useCallback(() => {
    setDraggingLayer(null);
    setDragStart(null);
  }, []);

  const isLayerVisible = (layer: { start: number; end: number }) => {
    return currentTime >= layer.start && currentTime <= layer.end;
  };

  const handleTextLayerUpdate = useCallback((id: string, updates: Partial<TextLayer>) => {
    onLayerUpdate('text', id, updates);
  }, [onLayerUpdate]);

  const handleTextLayerSelect = useCallback((id: string) => {
    onLayerSelect('text', id);
  }, [onLayerSelect]);

  const handleTextStartEdit = useCallback((id: string) => {
    setEditingTextId(id);
  }, []);

  const handleTextEndEdit = useCallback(() => {
    setEditingTextId(null);
  }, []);

  return (
    <div 
      className="w-full h-full flex items-center justify-center p-4 bg-muted/20"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div 
        ref={canvasRef}
        className="relative bg-black rounded-lg shadow-lg overflow-hidden"
        style={{ 
          aspectRatio: '9/16',
          height: '100%',
          maxWidth: '100%',
        }}
        onPointerDown={() => {
          // Start a new pointer interaction on the canvas; do NOT clear selection here.
          pointerDownRef.current = true;
          isDraggingRef.current = false;
        }}
        onPointerMove={() => {
          // If the pointer moved while down, we treat it as a drag and must ignore the subsequent click.
          if (!pointerDownRef.current) return;
          isDraggingRef.current = true;
        }}
        onPointerUp={() => {
          // IMPORTANT: Never clear selection on pointer up.
          pointerDownRef.current = false;
        }}
        onClick={() => {
          // CRITICAL: Ignore the click that fires after a drag (desktop mouseup -> click)
          if (isDraggingRef.current) {
            console.log('[CANVAS] click ignored (drag)');
            return;
          }
          console.log('[CANVAS] click on empty area - clearing selection');
          onLayerSelect(null, null);
          setEditingTextId(null);
        }}
      >
        {/* Main Video Layer */}
        {videoSrc && (
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-contain"
            style={{ filter: filterStyle }}
            playsInline
            controls={false}
            loop={false}
            onCanPlay={handleCanPlay}
            onError={handleError} preload="metadata" />
        )}

        {/* Error/Loading/Empty State */}
        {(!videoLoaded || videoError || !videoSrc) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center text-white p-4">
              {videoError ? (
                <>
                  <p className="text-sm text-red-400">Video Error</p>
                  <p className="text-xs mt-1 text-red-300">{videoError}</p>
                </>
              ) : sortedClips.length === 0 ? (
                <>
                  <p className="text-sm">No video loaded</p>
                  <p className="text-xs mt-1 text-muted-foreground">Upload a video to start editing</p>
                </>
              ) : (
                <>
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm">Loading clip {currentClipIndex + 1} of {sortedClips.length}...</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Clip indicator */}
        {sortedClips.length > 1 && videoLoaded && (
          <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
            Clip {currentClipIndex + 1} / {sortedClips.length}
          </div>
        )}

        {/* Image Layers */}
        {imageLayers.filter(isLayerVisible).map((layer) => (
          <div
            key={layer.id}
            className={`absolute cursor-move select-none ${selectedLayerId === layer.id ? 'ring-2 ring-primary' : ''}`}
            style={{
              left: `${layer.position.x}%`,
              top: `${layer.position.y}%`,
              transform: `translate(-50%, -50%) scale(${layer.scale}) rotate(${layer.rotation}deg)`,
            }}
            onMouseDown={(e) => handleMouseDown(e, 'image', layer.id, layer)}
          >
            <img 
              src={layer.src} 
              alt={layer.fileName} 
              className="max-w-[50%] max-h-[50%] pointer-events-none"
              draggable={false}
             loading="eager" decoding="async" />
          </div>
        ))}

        {/* Emoji/Sticker Layers - Using EmojiLayerCanvas */}
        {emojiLayers.filter(isLayerVisible).map((layer) => (
          <EmojiLayerCanvas
            key={layer.id}
            layer={layer}
            isSelected={selectedLayerId === layer.id}
            onSelect={() => onLayerSelect('emoji', layer.id)}
            onUpdate={(updates) => onLayerUpdate('emoji', layer.id, updates)}
            onDelete={() => onLayerDelete('emoji', layer.id)}
            containerWidth={canvasSize.width}
            containerHeight={canvasSize.height}
            onDragStart={() => {
              isDraggingRef.current = true;
            }}
            onDragEnd={() => {
              // IMPORTANT: Do NOT reset isDraggingRef here.
              // We only reset it on the next pointer down, so the post-drag click is ignored.
            }}
          />
        ))}

        {/* Text Layers - Using TextLayerCanvas for each */}
        {textLayers.filter(isLayerVisible).map((layer) => (
          <TextLayerCanvas
            key={layer.id}
            layer={layer}
            isSelected={selectedLayerId === layer.id}
            isEditing={editingTextId === layer.id}
            onSelect={() => handleTextLayerSelect(layer.id)}
            onUpdate={(updates) => handleTextLayerUpdate(layer.id, updates)}
            onStartEdit={() => handleTextStartEdit(layer.id)}
            onEndEdit={handleTextEndEdit}
            onDelete={() => onLayerDelete('text', layer.id)}
            containerWidth={canvasSize.width}
            containerHeight={canvasSize.height}
            onDragStart={() => {
              isDraggingRef.current = true;
            }}
            onDragEnd={() => {
              // IMPORTANT: Do NOT reset isDraggingRef here.
              // We only reset it on the next pointer down, so the post-drag click is ignored.
            }}
          />
        ))}
      </div>
    </div>
  );
});

EditorCanvas.displayName = 'EditorCanvas';
