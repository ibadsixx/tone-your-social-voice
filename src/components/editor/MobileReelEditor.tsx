import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Undo2, Redo2, Check, Type, Smile, Image as ImageIcon, Music, Palette, Scissors, Gauge, Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { useEditorProject } from '@/hooks/useEditorProject';
import { useEditorHistory } from '@/hooks/useEditorHistory';
import { useAutosave } from '@/hooks/useAutosave';
import { createPlayer, VideoPlayer } from '@/lib/player';
import {
  VideoLayer, TextLayer, EmojiLayer, ImageLayer, AudioTrack, VideoFilter,
  defaultVideoFilter, VideoSpeed, defaultVideoSpeed,
} from '@/types/editor';

export interface MobileReelEditorProps {
  projectId?: string | null;
}

const FILTERS: VideoFilter['name'][] = [
  'none', 'warm', 'cool', 'vivid', 'mono', 'sepia', 'vintage', 'dramatic', 'cinematic', 'bloom',
];
const SPEEDS: number[] = [0.5, 0.75, 1, 1.25, 1.5, 2];
const EMOJIS: string[] = ['😀', '😎', '🥰', '🔥', '❤️', '😂', '✨', '👍'];

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

export default function MobileReelEditor({ projectId }: MobileReelEditorProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pid = projectId || searchParams.get('projectId') || undefined;

  const { project, saveProject, isLoading, updateProjectData } = useEditorProject(pid);
  const { pushSnapshot, undo, redo, canUndo, canRedo } = useEditorHistory();

  // ---- Own mobile state (independent of desktop panels) ----
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<VideoPlayer | null>(null;
  const [playerEl, setPlayerEl] = useState<VideoPlayer | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [clipStart, setClipStart] = useState(project?.clipStart ?? 0);
  const [clipEnd, setClipEnd] = useState(project?.clipEnd ?? 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [videoVolume, setVideoVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(falseasse);
  const [speed, setSpeed] = useState<VideoSpeed>(1 as unknown as VideoSpeed);
  const [filter, setFilter] = useState<VideoFilter>(project?.globalFilter ?? defaultVideoFilter);

  const [videoLayers, setVideoLayers] = useState<VideoLayer[]>(project?.videoLayers ?? []);
  const [textLayers, setTextLayers] = useState<TextLayer[]>(project?.textLayers ?? []);
  const [emojiLayers, setEmojiLayers] = useState<EmojiLayer[]>(project?.emojiLayers ?? []);
  const [imageLayers, setImageLayers] = useState<ImageLayer[]>(project?.imageLayers ?? []);
  const [audioTrack, setAudioTrack] = useState<AudioTrack | null>(project?.audioTrack ?? null);

  // ---- Real player bound to OUR <video> (the mobile preview owns its element) ----
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const p = createPlayer();
    p.init(el, videoLayers);
    playerRef.current = p;
    setPlayerEl(p);
    return () => {
      p.destroy?.();
      playerRef.current = null;
    };
  }, [videoLayers]);

  // Keep trim/undo bookkeeping against the real engine
  const snapshot = useCallback(() => {
    pushSnapshot({
      videoLayers, textLayers, emojiLayers, imageLayers, audioTrack, filter,
      clipStart, clipEnd, speed,
    });
  }, [pushSnapshot, videoLayers, textLayers, emojiLayers, imageLayers, audioTrack, filter, clipStart, clipEnd, speed]);

  const handleUndo = useCallback(() => {
    snapshot();
    undo();
  }, [snapshot, undo]);

  const handleRedo = useCallback(() => {
    snapshot();
    redo();
  }, [snapshot, redo]);

  const handleSeek = useCallback((time: number) => {
    setCurrentTime(time);
    playerRef.current?.seekTo?.(time);
    const el = videoRef.current;
    if (el && el.currentTime !== undefined) el.currentTime = time;
  }, []);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) playerRef.current?.pause?.();
    else playerRef.current?.play?.();
    setIsPlaying(prev => !prev);
  }, [isPlaying]);

  const handleVolume = useCallback((v: number) => {
    setVideoVolume(v);
    const el = videoRef.current;
    if (el) el.volume = v / 100;
    if (el && v > 0) el.muted = false;
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      const el = videoRef.current;
      if (el) {
        el.muted = next;
        el.volume = next ? 0 : videoVolume / 100;
      }
      return next;
    });
  }, [videoVolume]);

  const applySpeed = useCallback((sp: VideoSpeed) => {
    setSpeed(sp);
    const el = videoRef.current;
    if (el) el.playbackRate = sp as unknown as number;
    playerRef.current?.setSpeed?.(sp);
  }, []);

  const applyFilter = useCallback((name: VideoFilter['name']) => {
    setFilter(prev => ({ ...prev, name }));
  }, []);

  const setTrimStart = useCallback((v: number) => {
    setClipStart(Math.max(0, Math.min(v, clipEnd - 0.5)));
  }, [clipEnd]);

  const setTrimEnd = useCallback((v: number) => {
    setClipEnd(Math.max(clipStart + 0.5, Math.min(v, duration)));
  }, [clipStart, duration]);

  const addText = useCallback(() => {
    const layer: TextLayer = {
      id: `text-${Date.now()}`, content: 'Tap to edit', fontSize: 40, color: '#ffffff',
      position: { x: 50, y: 45 }, rotation: 0, opacity: 1, zIndex: 10,
    };
    setTextLayers(prev => [...prev, layer]);
    snapshot();
  }, [snapshot]);

  const addEmoji = useCallback(() => {
    const layer: EmojiLayer = {
      id: `emoji-${Date.now()}`, emoji: EMOJIS[0], size: 72, position: { x: 50, y: 50 }, rotation: 0, opacity: 1, zIndex: 5,
    };
    setEmojiLayers(prev => [...prev, layer]);
    snapshot();
  }, [snapshot]);

  const addImage = useCallback(() => {
    const layer: ImageLayer = {
      id: `image-${Date.now()}`, src: '', position: { x: 50, y: 55 }, scale: 1, rotation: 0, opacity: 1, zIndex: 8,
    };
    setImageLayers(prev => [...prev, layer]);
    snapshot();
  }, [snapshot]);

  const handleDone = useCallback(async () => {
    snapshot();
    await saveProject({
      videoLayers, textLayers, emojiLayers, imageLayers, audioTrack, globalFilter: filter,
      clipStart, clipEnd, videoSpeed: speed, videoVolume, isVideoMuted: isMuted,
    });
    navigate(-1);
  }, [snapshot, saveProject, videoLayers, textLayers, emojiLayers, imageLayers, audioTrack, filter, clipStart, clipEnd, speed, videoVolume, isMuted, navigate]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onTime = () => {
      if (!isScrubbing) setCurrentTime(el.currentTime);
    };
    const onDur = () => setDuration(el.duration || 0);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('durationchange', onDur);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('durationchange', onDur);
    };
  }, [isScrubbing]);

  const fmt = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const showTrim = !!videoLayers.length && duration > 0;

  return (
    <div className="absolute inset-0 flex flex-col bg-black safe-area-inset overflow-hidden">
      <header className="flex items-center justify-between h-12 shrink-0 px-2 bg-black/90 z-20" onClick={() => {}}>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => navigate(-1)} aria-label="Close">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={handleUndo} disabled={!canUndo} aria-label="Undo">
            <Undo2 className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={handleRedo} disabled={!canRedo} aria-label="Redo">
            <Redo2 className="h-5 w-5" />
          </Button>
        </div>
        <span className="text-sm font-semibold text-white truncate">Edit Reel</span>
        <Sheet>
          <SheetTrigger asChild>
            <Button className="h-10 rounded-full px-14" onClick={handleDone}>
              <Check className="h-5 w-5 mr-1" />
              Done
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="flex flex-col items-center gap-4 pt-6">
            <SheetHeader>
              <SheetTitle>Save Reel</SheetTitle>
              <SheetDescription>Your edits are trimmed to {fmt(clipStart)}–{fmt(clipEnd)} of {fmt(duration)}.</SheetDescription>
            </SheetHeader>
            <Button className="w-full" onClick={handleDone}>{isLoading : 'Saving…' : 'Save & Post'}</Button>
          </SheetContent>
        </Sheet>
      </header>

      {/* Full-bleed real video preview — preserves the Reel's own aspect ratio (9/16, 16/9, square); object-contain, never stretched */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-black" onClick={() => {}}>
        <video
          ref={videoRef}
          className="max-h-full max-w-full object-contain"
          src={project?.videoUrl}
          playsinline
          muted={isMuted}
          onClick={handlePlayPause}
        />
        <button className="absolute inset-0 z-10" onClick={handlePlayPause} aria-label={isPlaying ? 'Pause' : 'Play'} />
      </div>

      {/* Mobile touch timeline — big scrub rail + large trim handles + playhead + time labels */}
      <div className="shrink-0 px-4 py-5 bg-black border-t border-white/10 space-y-2">
        {showTrim ? (
          <>
            <div className="flex items-center justify-between text-[11px] text-white/70 font-mono">
              <span>{fmt(currentTime)}</span>
              <span>{fmt(duration)}</span>
            </div>
            <div className="relative h-8">
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-white/20" />
              <div
                className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-white/60"
                style={{ left: `${(clipStart / duration) * 100}%`, width: `${((clipEnd - clipStart) / duration) * 100}%` }}
              />
              <input
                type="range"
                min={0}
                max={duration}
                step={0.05}
                value={currentTime}
                onChange={(e) => handleSeek(Number(e.target.value))}
                onPointerDown={() => setIsScrubbing(true)}
                onPointerUp={() => setIsScrubbing(false)}
                className="absolute inset-0 w-full h-full opacity-0 z-10"
                aria-label="Scrub"
              />
              <div
                className="absolute top-0 bottom-0 w-10 -translate-x-1/2 z-20 cursor-grab"
                style={{ left: `${(clipStart / duration) * 100}%` }}
                onPointerDown={() => {}}
              >
                <input
                  type="range"
                  min={0}
                  max={clipEnd}
                  step={0.05}
                  defaultValue={clipStart}
                  onChange={(e) => setTrimStart(Number(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-grab"
                  aria-label="Trim start handle"
                />
                <div className="absolute inset-y-0 left-0 w-1.5 bg-white rounded-full" />
              </div>
              <div
                className="absolute top-0 bottom-0 w-10 -translate-x-1/2 z-20 cursor-grab"
                style={{ left: `${(clipEnd / duration) * 100}%` }}
                onPointerDown={() => {}}
              >
                <input
                  type="range"
                  min={clipStart}
                  max={duration}
                  step={0.05}
                  defaultValue={clipEnd}
                  onChange={(e) => setTrimEnd(Number(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-grab"
                  aria-label="Trim end handle"
                />
                <div className="absolute inset-y-0 right-0 w-1.5 bg-white rounded-full" />
              </div>
              <div
                className="absolute top-1/2 -translate-y-1/2 h-6 w-0.5 bg-white rounded-full z-20 pointer-events-none"
                style={{ left: `${(currentTime / duration) * 100}%` }}
              />
            </div>
          </>
        ) : (
          <p className="text-center text-xs text-white/50 py-15">Select a Reel to start editing</p>
        )}
      </div>

      {/* Mobile toolbox — each tool opens a bottom sheet (never a desktop panel) */}
      <nav className="flex items-center justify-around shrink-0 px-1 py-2 border-t border-white/10 bg-black z-20">
        {TOOLS.map(tool => (
          <Sheet key={tool.key}>
            <SheetTrigger asChild>
              <button className="flex flex-col items-center gap-1 py-1 px-2 min-w-[56px]" aria-label={tool.label}>
                <tool.icon className="h-5 w-5 text-white" />
                <span className="text-[10px] text-white/80">{tool.label}</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[70%] flex flex-col gap-4 pt-6">
              <SheetHeader>
                <SheetTitle className="text-lg">{tool.label}</SheetTitle>
                <SheetDescription>
                  {tool.key === 'trim' && 'Touch to scrub, drag the white handles to trim'}
                  {tool.key === 'filter' && 'Tap a filter — the preview updates live'}
                  {tool.key === 'speed' && 'Tap a speed — audio and preview are affected'}
                  {tool.key === 'volume' && 'Slide to adjust the reel volume'}
                  {tool.key === 'audio' && !audioTrack && 'Attach audio to the reel'}
                  {tool.key === 'text' && 'Tap to add a text layer to the reel'}
                  {tool.key === 'emoji' && 'Tap to add an emoji stamp'}
                  {tool.key === 'image' && 'Tap to add an overlay image'}
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-2 pb-8 space-y-3">
                {tool.key === 'trim' && showTrim && (
                  <div className="space-y-4">
                    <div className="px-2">
                      <Slider value={[currentTime]} min={0} max={duration} step={0.05} onValueChange={([v]) => handleSeek(v ?? 0)} />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-foreground/70 font-mono">
                      <span>Start {fmt(clipStart)}</span>
                      <span>End {fmt(clipEnd)}</span>
                    </div>
                    <div className="px-2">
                      <Slider value={[clipStart]} min={0} max={clipEnd} step={0.05} onValueChange={([v]) => v != null && setTrimStart(v)} />
                    </div>
                    <div className="px-2">
                      <Slider value={[clipEnd]} min={clipStart} max={duration} step={0.05} onValueChange={([v]) => v != null && setTrimEnd(v)} />
                    </div>
                  </div>
                )}
                {tool.key === 'text' && (
                  <Button className="w-full" onClick={addText}>
                    <Type className="h-5 w-5 mr-2" />Add Text Layer
                  </Button>
                )}
                {tool.key === 'emoji' && (
                  <div className="grid grid-cols-4 gap-3">
                    {EMOJIS.map(em => (
                      <button
                        key={em}
                        className="h-16 w-16 flex items-center justify-center text-3xl hover:bg-accent rounded-xl"
                        onClick={() => setEmojiLayers(prev => {
                          const layer: EmojiLayer = {
                            id: `emoji-${Date.now()}-${Math.random()}`, emoji: em, size: 72,
                            position: { x: 50, y: 100 }, rotation: 0, opacity: 1, zIndex: 5,
                          };
                          return [...prev, layer];
                        })}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                )}
                {tool.key === 'image' && (
                  <Button className="w-full" onClick={addImage}>
                    <ImageIcon className="h-5 w-5 mr-2" />Add Overlay Image
                  </Button>
                )}
                {tool.key === 'audio' && (
                  <div className="space-y-3">
                    <p className="text-xs text-foreground/70">
                      {audioTrack ? `Track: ${audioTrack.title ?? 'attached'}` : 'No audio attached'}
                    </p>
                    <Button variant="outline" className="w-full" onClick={() => setAudioTrack(null)}>Remove Audio</Button>
                  </div>
                )}
                {tool.key === 'filter' && (
                  <div className="grid grid-cols-2 gap-2">
                    {FILTERS.map(name => (
                      <Button
                        key={name}
                        variant={filter.name === name ? 'default' : 'outline'}
                        size="sm"
                        className="justify-start"
                        onClick={() => applyFilter(name)}
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
                        variant={speed === (sp as unknown as VideoSpeed) ? 'default' : 'outline'}
                        onClick={() => applySpeed(sp as unknown as VideoSpeed)}
                      >
                        {sp}x
                      </Button>
                    ))}
                  </div>
                )}
                {tool.key === 'volume' && (
                  <div className="space-y-6 px-2">
                    <Slider value={[videoVolume]} min={0} max={100} step={1} onValueChange={([v]) => handleVolume(v ?? 0)} />
                    <Button variant={isMuted ? 'default' : 'outline'} className="w-full" onClick={toggleMute}>
                      {isMuted ? 'Unmute' : 'Mute'}
                    </Button>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        ))}
      </nav>
    </div>
  );
}
