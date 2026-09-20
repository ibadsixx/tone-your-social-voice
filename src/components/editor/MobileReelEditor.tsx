import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Undo2, Redo2, Check, Type, Smile, Image as ImageIcon, Music, Palette,
  Scissors, Gauge, Volume2, Play, Pause,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { EditorCanvas, EditorCanvasRef } from '@/components/editor/EditorCanvas';
import { VideoTimeline } from '@/components/editor/timeline/VideoTimeline';
import { useEditorProject } from '@/hooks/useEditorProject';
import { useEditorHistory } from '@/hooks/useEditorHistory';
import { useAutosave } from '@/hooks/useAutosave';
import { createPlayer, VideoPlayer } from '@/lib/player';
import {
  VideoLayer, TextLayer, EmojiLayer, ImageLayer, AudioTrack, VideoFilter,
  defaultVideoFilter, VideoSpeed,
} from '@/types/editor';

export interface MobileReelEditorProps {
  projectId?: string | null;
}

interface ToolDef {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TOOLS: ToolDef[] = [
  { key: 'trim', label: 'Trim', icon: Scissors },
  { key: 'text', label: 'Text', icon: Type },
  { key: 'emoji', label: 'Emoji', icon: Smile },
  { key: 'image', label: 'Image', icon: ImageIcon },
  { key: 'audio', label: 'Audio', icon: Music },
  { key: 'filter', label: 'Filter', icon: Palette },
  { key: 'speed', label: 'Speed', icon: Gauge },
  { key: 'volume', label: 'Volume', icon: Volume2 },
];

const FILTER_NAMES: VideoFilter['name'][] = [
  'none', 'warm', 'cool', 'vivid', 'mono', 'sepia', 'vintage', 'dramatic', 'cinematic', 'bloom',
];
const SPEEDS: number[] = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function MobileReelEditor({ projectId }: MobileReelEditorProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pid = projectId || searchParams.get('projectId') || undefined;

  const { project, saveProject, isLoading, updateProjectData } = useEditorProject(pid);
  const { pushSnapshot, undo, redo, canUndo, canRedo } = useEditorHistory();

  const canvasRef = useRef<EditorCanvasRef | null>(null);
  const playerRef = useRef<VideoPlayer | null>(null3);

  // Reel state (same surfaces the desktop editor uses)
  const [videoLayers, setVideoLayers] = useState<VideoLayer[]>(project?.videoLayers ?? []);
  const [textLayers, setTextLayers] = useState<TextLayer[]>(project?.textLayers ?? []);
  const [emojiLayers, setEmojiLayers] = useState<EmojiLayer[]>(project?.emojiLayers ?? []);
  const [imageLayers, setImageLayers] = useState<ImageLayer[]>(project?.imageLayers ?? []);
  const [audioTrack, setAudioTrack] = useState<AudioTrack | null>(project?.audioTrack ?? null);
  const [globalFilter, setGlobalFilter] = useState<VideoFilter>(project?.globalFilter ?? defaultVideoFilter);
  const [videoSpeed, setVideoSpeed] = useState<VideoSpeed>(1 as VideoSpeed);
  const [videoVolume, setVideoVolume] = useState(100);
  const [isVideoMuted, setIsVideoMuted] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [clipStart, setClipStart] = useState(0);
  const [clipEnd, setClipEnd] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Reuses the real player engine from the desktop editor
  useEffect(() => {
    if (project?.videoUrl) {
      const p = createPlayer();
      playerRef.current = p;
      p.loadSource?.(project.videoUrl);
    }
    return () => {
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [project?.videoUrl]);

  useAutosave(projectId, saveProject);

  const snapshot = useCallback(() => {
    pushSnapshot({
      videoLayers,
      textLayers,
      emojiLayers,
      imageLayers,
      audioTrack,
      globalFilter,
      clipStart,
      clipEnd,
      videoSpeed,
    });
  }, [pushSnapshot, videoLayers, textLayers, emojiLayers, imageLayers, audioTrack, globalFilter, clipStart, clipEnd, videoSpeed]);

  const handleUndo = useCallback(() => { snapshot(); undo(); }, [snapshot, undo]);
  const handleRedo = useCallback(() => { snapshot(); redo(); }, [snapshot, redo]);

  const handleSeek = useCallback((time: number) => {
    setCurrentTime(Math.max(0, Math.min(time, duration)));
    playerRef.current?.seekTo?.(time);
  }, [duration]);

  const handleSave = useCallback(async () => {
    snapshot();
    await saveProject({
      videoLayers,
      textLayers,
      emojiLayers,
      imageLayers,
      audioTrack,
      globalFilter,
      videoSpeed,
      videoVolume,
      clipStart,
      clipEnd,
    });
    navigate(-1);
  }, [snapshot, saveProject, videoLayers, textLayers, emojiLayers, imageLayers, audioTrack, globalFilter, videoSpeed, videoVolume, clipStart, clipEnd, navigate]);

  const addTextLayer = useCallback(() => {
    const layer: TextLayer = {
      id: `text-${Date.now()}`,
      content: 'Your text',
      fontSize: 36,
      color: '#ffffff',
      fontFamily: 'Inter',
      position: { x: 50, y: 40 },
      rotation: 0,
      opacity: 1,
      zIndex: 10,
    };
    setTextLayers(prev => [...prev, layer]);
  }, []);

  const addEmojiLayer = useCallback(() => {
    const layer: EmojiLayer = {
      id: `emoji-${Date.now()}`,
      emoji: '😀',
      size: 64,
      position: { x: 50, y: 50 },
      rotation: 0,
      opacity: 1,
      zIndex: 5,
    };
    setEmojiLayers(prev => [...prev, layer]);
  }, []);

  const addImageLayer = useCallback(() => {
    const layer: ImageLayer = {
      id: `image-${Date.now()}`,
      src: '',
      scale: 1,
      position: { x: 50, y: 60 },
      rotation: 0,
      opacity: 1,
      zIndex: 8,
    };
    setImageLayers(prev => [...prev, layer]);
  }, []);

  const updateLayer = useCallback((id: string, patch: Partial<VideoLayer>) => {
    setVideoLayers(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  const removeAudio = useCallback(() => setAudioTrack(null), []);

  return (
    <div className="absolute inset-0 flex flex-col bg-background overflow-hidden">
      {/* Mobile top bar: Back — Undo — Redo | title | Done */}
      <header className="flex items-center justify-between h-12 shrink-0 px-2 border-b bg-background/95 z-20">
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={handleUndo} disabled={!canUndo} aria-label="Undo">
            <Undo2 className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={handleRedo} disabled={!canRedo} aria-label="Redo">
            <Redo2 className="h-5 w-5" />
          </Button>
        </div>
        <span className="text-sm font-semibold truncate">Edit Reel</span>
        <Button size="sm" className="h-9 rounded-full px-3" onClick={handleSave} disabled={isLoading}>
          <Check className="h-4 w-4 mr-1" />
          Done
        </Button>
      </header>

      {/* Full-bleed preview — aspect-ratio preserved, never stretched (9:16 / 16:9 / square all supported) */}
      <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center">
        <div className="h-full w-full flex items-center justify-center">
          <div className="relative h-full aspect-[9/16] sm:aspect-square">
            <EditorCanvas
              ref={canvasRef}
              videoLayers={videoLayers}
              emojiLayers={emojiLayers}
              textLayers={textLayers}
              imageLayers={imageLayers}
              player={playerRef.current}
              isPlaying={isPlaying}
              isScrubbing={isScrubbing}
              currentTime={currentTime}
              duration={duration}
              clipStart={clipStart}
              clipEnd={clipEnd}
              globalFilter={globalFilter}
              onTimeUpdate={({ time }) => setCurrentTime(time)}
              onDurationChange={({ duration: d }) => setDuration(d)}
              onLayerUpdate={updateLayer}
              onLayerSelect={() => {}}
              onLayerDelete={() => {}}
              videoVolume={videoVolume}
              isVideoMuted={isVideoMuted}
              onVideoVolumeChange={setVideoVolume}
              onVideoMutedChange={setIsVideoMuted}
            />
          </div>
        </div>
      </div>

      {/* Bottom toolbar — mobile tools open touch-friendly bottom sheets */}
      <nav className="flex items-center justify-around shrink-0 py-2 border-t bg-background z-20">
        {TOOLS.map(tool => (
          <Sheet key={tool.key}>
            <SheetTrigger asChild>
              <button className="flex flex-col items-center gap-1 px-2 py-1 min-w-[54px]">
                <tool.icon className="h-5 w-5 text-foreground" />
                <span className="text-[10px] font-medium">{tool.label}</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[85%] flex flex-col">
              <SheetHeader>
                <SheetTitle>{tool.label}</SheetTitle>
                <SheetDescription>Tap to apply</SheetDescription>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-4 pb-6">
                {tool.key === 'trim' && (
                  <VideoTimeline
                    isPlaying={isPlaying}
                    currentTime={currentTime}
                    duration={duration}
                    clipStart={clipStart}
                    clipEnd={clipEnd}
                    videoLayers={videoLayers}
                    audioTrack={audioTrack}
                    emojiLayers={emojiLayers}
                    textLayers={textLayers}
                    imageLayers={imageLayers}
                    selectedLayerId={null}
                    player={playerRef.current}
                    onSeek={handleSeek}
                    onScrubStart={() => setIsScrubbing(true)}
                    onScrubEnd={() => setIsScrubbing(false)}
                    onTrimStartChange={setClipStart}
                    onTrimEndChange={setClipEnd}
                    onLayerSelect={() => {}}
                    onLayerUpdate={() => {}}
                    onLayerDelete={() => {}}
                    videoVolume={videoVolume}
                    isVideoMuted={isVideoMuted}
                  />
                )}
                {tool.key === 'text' && (
                  <Button className="w-full" onClick={addTextLayer}>Add Text</Button>
                )}
                {tool.key === 'emoji' && (
                  <div className="grid grid-cols-5 gap-2">
                    {['😀', '😂', '🥰', '😎', '🔥', '❤️', '✨', '🎉', '👍', '😍'].map(em => (
                      <button
                        key={em}
                        className="h-12 w-12 flex items-center justify-center text-2xl rounded-lg hover:bg-accent"
                        onClick={() => setEmojiLayers(prev => [...prev, { id: `emoji-${Date.now()}`, emoji: em, size: 64, position: { x: 50, y: 50 }, rotation: 0, opacity: 1, zIndex: 5 }])}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                )}
                {tool.key === 'image' && (
                  <Button className="w-full" onClick={addImageLayer}>Add Image</Button>
                )}
                {tool.key === 'audio' && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {audioTrack ? audioTrack.title : 'No audio track'}
                    </p>
                    {audioTrack && <Button variant="outline" className="w-full" onClick={removeAudio}>Remove Audio</Button>}
                  </div>
                )}
                {tool.key === 'filter' && (
                  <div className="grid grid-cols-2 gap-2">
                    {FILTER_NAMES.map(name => (
                      <Button
                        key={name}
                        variant={globalFilter.name === name ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setGlobalFilter(prev => ({ ...prev, name }))}
                      >
                        {name}
                      </Button>
                    ))}
                  </div>
                )}
                {tool.key === 'speed' && (
                  <div className="grid grid-cols-3 gap-2">
                    {SPEEDS.map(sp => (
                      <Button
                        key={sp}
                        variant={videoSpeed === (sp as VideoSpeed) ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setVideoSpeed(sp as VideoSpeed)}
                      >
                        {sp}x
                      </Button>
                    ))}
                  </div>
                )}
                {tool.key === 'volume' && (
                  <div className="space-y-6">
                    <Slider
                      value={[videoVolume]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={([v]) => setVideoVolume(v ?? 0)}
                    />
                    <div className="flex items-center justify-between">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsVideoMuted(m => !m)}
                      >
                        {isVideoMuted ? 'Unmute' : 'Mute'}
                      </Button>
                      <span className="text-xs text-muted-foreground">{videoVolume}%</span>
                    </div>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        ))}
      </nav>

      {/* Play / pause is available over the preview via the existing canvas interactions */}
    </div>
  );
}
