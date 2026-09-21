import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  X, Check, Play, Pause, Type, Music, Smile, Palette, Scissors,
  Trash2, Search, Link as LinkIcon, Music2, Youtube, AlertCircle, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { useEditorProject, ParsedProjectData } from '@/hooks/useEditorProject';
import { useEditorHistory, EditorSnapshot } from '@/hooks/useEditorHistory';
import { useAutosave } from '@/hooks/useAutosave';
import { useMusicLibrary } from '@/hooks/useMusicLibrary';
import { createPlayer, VideoPlayer } from '@/lib/player';
import { MusicTrimmer } from '@/components/music/MusicTrimmer';
import { detectMusicUrl } from '@/utils/musicUrlDetector';
import { extractMusicMetadata } from '@/utils/musicMetadataExtractor';
import { cityFilterPresets, basicFilterPresets } from '@/components/editor/panels/FiltersPanel';
import { toast } from '@/hooks/use-toast';
import {
  VideoLayer, TextLayer, EmojiLayer, ImageLayer, AudioTrack, VideoFilter,
  Position, Transcript, defaultVideoFilter, defaultTextStyle,
} from '@/types/editor';

export interface MobileReelEditorProps {
  projectId?: string | null;
}

type ToolKey = 'trim' | 'text' | 'audio' | 'effects' | 'filters';

const EMOJIS: string[] = [
  '😀', '😂', '😍', '🥰', '😎', '🤩', '🔥', '❤️', '💯', '✨',
  '👍', '👏', '🙌', '🎉', '💥', '🦄', '🌈', '🎂',
];
const TEXT_COLORS: string[] = ['#ffffff', '#000000', '#ffdd00', '#ff5a5f', '#3b82f6', '#10b981', '#a855f7', '#f97316'];

const TOOLS: { key: ToolKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'trim', label: 'Trim', icon: Scissors },
  { key: 'text', label: 'Text', icon: Type },
  { key: 'audio', label: 'Audio', icon: Music },
  { key: 'effects', label: 'Effects', icon: Smile },
  { key: 'filters', label: 'Filters', icon: Palette },
];

const FILTER_PRESETS = [
  { id: 'original', name: 'Original', filter: defaultVideoFilter },
  ...cityFilterPresets,
  ...basicFilterPresets,
];

// Same CSS recipe as EditorCanvas so the phone preview matches the desktop one.
const buildFilterStyle = (filter: VideoFilter): string => `
  brightness(${filter.brightness}%)
  contrast(${filter.contrast}%)
  saturate(${filter.saturation}%)
  ${filter.temperature > 0 ? `sepia(${filter.temperature}%)` : ''}
  ${filter.temperature < 0 ? `hue-rotate(${filter.temperature}deg)` : ''}
  blur(${filter.blur}px)
  ${filter.hueRotate ? `hue-rotate(${filter.hueRotate}deg)` : ''}
`.trim();

const fmt = (t: number) => {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

interface PendingMusic {
  url: string;
  title: string;
  artist?: string | null;
  thumbnail_url?: string | null;
  duration?: number | null;
}

export default function MobileReelEditor({ projectId }: MobileReelEditorProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pid = projectId || searchParams.get('projectId') || undefined;

  const { project, isLoading, updateProjectData, parseProjectData } = useEditorProject(pid);
  const { pushSnapshot, undo, redo, canUndo, canRedo } = useEditorHistory();
  const { queueSave, saveNow } = useAutosave(project?.id);

  // ---- Editor state ----
  const [videoLayers, setVideoLayers] = useState<VideoLayer[]>([]);
  const [textLayers, setTextLayers] = useState<TextLayer[]>([]);
  const [emojiLayers, setEmojiLayers] = useState<EmojiLayer[]>([]);
  const [imageLayers, setImageLayers] = useState<ImageLayer[]>([]);
  const [audioTrack, setAudioTrack] = useState<AudioTrack | null>(null);
  const [globalFilter, setGlobalFilter] = useState<VideoFilter>(defaultVideoFilter);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [duration, setDuration] = useState(30);
  const [clipStart, setClipStart] = useState(0);
  const [clipEnd, setClipEnd] = useState(30);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // ---- UI state ----
  const [activeTool, setActiveTool] = useState<ToolKey | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState('');
  const [musicQuery, setMusicQuery] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  const [pendingMusic, setPendingMusic] = useState<PendingMusic | null>(null);
  const [musicSegStart, setMusicSegStart] = useState(0);
  const [musicSegEnd, setMusicSegEnd] = useState(15);
  const [isAddingMusic, setIsAddingMusic] = useState(false);

  // ---- Refs ----
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<VideoPlayer | null>(null);
  const playerInitRef = useRef(false);
  const dataLoadedRef = useRef<string | null>(null);
  const isPlayingRef = useRef(false);
  const clipStartRef = useRef(0);
  const clipEndRef = useRef(30);
  const dragRef = useRef<{ type: 'text' | 'emoji'; id: string; startPX: number; startPY: number; startPos: Position } | null>(null);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { clipStartRef.current = clipStart; }, [clipStart]);
  useEffect(() => { clipEndRef.current = clipEnd; }, [clipEnd]);

  const musicLibrary = useMusicLibrary();

  // ---- Player lifecycle ----
  useEffect(() => {
    const p = createPlayer();
    playerRef.current = p;

    const onTime = (data: { time: number }) => {
      setCurrentTime(data?.time ?? 0);
      // Preview the trimmed region: loop back to the start when we hit the end.
      if (isPlayingRef.current && data?.time >= clipEndRef.current) {
        p.seekGlobalTime(clipStartRef.current);
      }
    };
    const onState = (state: any) => setIsPlaying(state?.isPlaying ?? false);
    const onDuration = (data: { duration: number }) => {
      if (data?.duration > 0) setDuration(data.duration);
    };

    p.on('timeupdate', onTime);
    p.on('statechange', onState);
    p.on('durationchange', onDuration);

    return () => {
      p.off('timeupdate', onTime);
      p.off('statechange', onState);
      p.off('durationchange', onDuration);
      p.destroy();
      playerRef.current = null;
      playerInitRef.current = false;
    };
  }, []);

  // (Re)bind clips to the player when layers change.
  useEffect(() => {
    const el = videoRef.current;
    const p = playerRef.current;
    if (!el || !p || videoLayers.length === 0) return;

    if (!playerInitRef.current) {
      p.init(el, videoLayers);
      playerInitRef.current = true;
    } else {
      p.setClips(videoLayers);
    }
    el.volume = videoLayers[0]?.volume ?? 1;
  }, [videoLayers]);

  // ---- Snapshots ----
  const createSnapshot = useCallback((): Omit<EditorSnapshot, 'timestamp'> => ({
    action: 'Edit',
    videoLayers: videoLayers.map(l => ({ ...l })),
    audioTrack: audioTrack ? { ...audioTrack } : null,
    emojiLayers: emojiLayers.map(l => ({ ...l })),
    textLayers: textLayers.map(l => ({ ...l })),
    imageLayers: imageLayers.map(l => ({ ...l })),
    globalFilter: { ...globalFilter },
    duration,
    clipStart,
    clipEnd,
    transcript,
  }), [videoLayers, audioTrack, emojiLayers, textLayers, imageLayers, globalFilter, duration, clipStart, clipEnd, transcript]);

  const applySnapshot = useCallback((snap: EditorSnapshot) => {
    setVideoLayers(snap.videoLayers);
    setAudioTrack(snap.audioTrack);
    setEmojiLayers(snap.emojiLayers);
    setTextLayers(snap.textLayers);
    setImageLayers(snap.imageLayers);
    setGlobalFilter(snap.globalFilter);
    setDuration(snap.duration);
    setClipStart(snap.clipStart);
    setClipEnd(snap.clipEnd);
    setTranscript(snap.transcript);
  }, []);

  const pushWithAction = useCallback((action: string) => {
    pushSnapshot({ ...createSnapshot(), action });
  }, [pushSnapshot, createSnapshot]);

  const handleUndo = useCallback(() => {
    const previous = undo();
    if (previous) applySnapshot(previous);
  }, [undo, applySnapshot]);

  const handleRedo = useCallback(() => {
    const next = redo();
    if (next) applySnapshot(next);
  }, [redo, applySnapshot]);

  // Normalize text layer styles (fontWeight may be 'bold'/'normal' strings in legacy data)
  const normalizeTextLayer = useCallback((l: TextLayer): TextLayer => {
    const style: any = { ...defaultTextStyle, ...(l.style as any) };
    let fontWeight: number | string = style.fontWeight;
    if (fontWeight === 'bold') fontWeight = 700;
    if (fontWeight === 'normal') fontWeight = 400;
    if (typeof fontWeight === 'string') fontWeight = Number(fontWeight) || 700;
    style.fontWeight = fontWeight;
    return { ...l, style };
  }, []);

  // ---- Load project once ----
  useEffect(() => {
    if (!project) return;
    if (dataLoadedRef.current === project.id) return;

    const data: ParsedProjectData = parseProjectData(project);
    const vLayers = data.videoLayers;
    const tLayers = data.textLayers.map(normalizeTextLayer);
    const eLayers = data.emojiLayers;
    const iLayers = data.imageLayers;
    const aTrack = data.audioTrack;
    const gFilter = data.globalFilter;
    const dur = data.duration;
    const cStart = data.clipStart;
    const cEnd = data.clipEnd;

    setVideoLayers(vLayers);
    setAudioTrack(aTrack);
    setEmojiLayers(eLayers);
    setTextLayers(tLayers);
    setImageLayers(iLayers);
    setGlobalFilter(gFilter);
    setTranscript(data.transcript);
    setDuration(dur);
    setClipStart(cStart);
    setClipEnd(cEnd);
    dataLoadedRef.current = project.id;

    pushSnapshot({
      action: 'Project loaded',
      videoLayers: vLayers,
      audioTrack: aTrack,
      emojiLayers: eLayers,
      textLayers: tLayers,
      imageLayers: iLayers,
      globalFilter: gFilter,
      duration: dur,
      clipStart: cStart,
      clipEnd: cEnd,
      transcript: data.transcript,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  // ---- Persistence (tracks format matches the desktop editor) ----
  const buildProjectJson = useCallback(() => {
    const tracks: any[] = [];

    if (videoLayers.length > 0) {
      tracks.push({
        id: 'track-video',
        type: 'video',
        clips: videoLayers.map((layer, i) => ({
          id: layer.id,
          type: 'video',
          src: layer.src,
          fileName: layer.fileName,
          start: layer.start,
          end: layer.end,
          duration: layer.duration,
          volume: layer.volume,
          filter: i === 0 ? globalFilter : layer.filter,
        })),
      });
    }

    if (audioTrack) {
      tracks.push({
        id: 'track-audio',
        type: 'audio',
        clips: [{
          id: audioTrack.id,
          type: 'audio',
          src: audioTrack.url,
          sourceType: audioTrack.sourceType,
          start: audioTrack.startAt,
          end: audioTrack.endAt,
          duration: audioTrack.duration,
          volume: audioTrack.volume / 100,
          title: audioTrack.title,
          artist: audioTrack.artist,
          effects: audioTrack.effects,
        }],
      });
    }

    if (emojiLayers.length > 0) {
      tracks.push({
        id: 'track-overlay',
        type: 'overlay',
        clips: emojiLayers.map(layer => ({
          id: layer.id,
          type: layer.type,
          content: layer.content,
          start: layer.start,
          end: layer.end,
          position: layer.position,
          scale: layer.scale,
          rotation: layer.rotation,
        })),
      });
    }

    if (textLayers.length > 0) {
      tracks.push({
        id: 'track-text',
        type: 'text',
        clips: textLayers.map(layer => ({
          id: layer.id,
          type: 'text',
          content: layer.content,
          start: layer.start,
          end: layer.end,
          position: layer.position,
          scale: layer.scale,
          rotation: layer.rotation,
          style: layer.style,
          animation: layer.animation,
        })),
      });
    }

    const videoVolume = Math.round((videoLayers[0]?.volume ?? 1) * 100);

    return {
      tracks,
      settings: {
        duration,
        clipStart,
        clipEnd,
        fps: 30,
        resolution: { width: 1080, height: 1920 },
        videoVolume,
      },
      transcripts: transcript ? [transcript] : [],
      audio: {
        videoVolume: videoVolume / 100,
        tracks: audioTrack ? { [audioTrack.id]: { volume: audioTrack.volume / 100 } } : {},
      },
    };
  }, [videoLayers, audioTrack, emojiLayers, textLayers, globalFilter, duration, clipStart, clipEnd, transcript]);

  // Debounced autosave
  useEffect(() => {
    if (!dataLoadedRef.current || videoLayers.length === 0) return;
    queueSave(buildProjectJson());
  }, [videoLayers, audioTrack, emojiLayers, textLayers, globalFilter, duration, clipStart, clipEnd, transcript]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save on page leave
  useEffect(() => {
    const handler = () => saveNow(buildProjectJson());
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [buildProjectJson, saveNow]);

  // ---- Handlers ----
  const togglePlay = useCallback(() => {
    if (isPlaying) playerRef.current?.pause();
    else playerRef.current?.play();
  }, [isPlaying]);

  const seekTo = useCallback((t: number) => {
    setCurrentTime(t);
    playerRef.current?.seekGlobalTime(t);
  }, []);

  const applyFilter = useCallback((filter: VideoFilter) => {
    pushWithAction('Change filter');
    setGlobalFilter({ ...filter });
  }, [pushWithAction]);

  const addText = useCallback((content?: string) => {
    pushWithAction('Add text');
    const layer: TextLayer = {
      id: `text-${Date.now()}`,
      type: 'text',
      content: content?.trim() || 'Your text',
      start: clipStart,
      end: clipEnd,
      position: { x: 50, y: 42 },
      scale: 1,
      rotation: 0,
      style: { ...defaultTextStyle },
    };
    setTextLayers(prev => [...prev, layer]);
    setSelectedLayerId(layer.id);
    setTextDraft(layer.content);
  }, [pushWithAction, clipStart, clipEnd]);

  const updateSelectedText = useCallback((patch: Partial<TextLayer>) => {
    setSelectedLayerId(id => {
      if (!id) return id;
      setTextLayers(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));
      return id;
    });
  }, []);

  const toggleSelectedTextBold = useCallback(() => {
    const layer = textLayers.find(l => l.id === selectedLayerId);
    if (!layer) return;
    pushWithAction('Toggle text bold');
    const nextWeight = layer.style.fontWeight === 400 ? 700 : 400;
    updateSelectedText({ style: { ...layer.style, fontWeight: nextWeight } });
  }, [textLayers, selectedLayerId, pushWithAction, updateSelectedText]);

  const deleteLayer = useCallback((type: 'text' | 'emoji', id: string) => {
    pushWithAction(`Delete ${type} layer`);
    if (type === 'text') {
      setTextLayers(prev => prev.filter(l => l.id !== id));
      setSelectedLayerId(prev => (prev === id ? null : prev));
    } else {
      setEmojiLayers(prev => prev.filter(l => l.id !== id));
    }
  }, [pushWithAction]);

  const addEmoji = useCallback((emoji: string) => {
    pushWithAction('Add effect');
    const layer: EmojiLayer = {
      id: `emoji-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'emoji',
      content: emoji,
      start: clipStart,
      end: clipEnd,
      position: { x: 50, y: 50 },
      scale: 1,
      rotation: 0,
    };
    setEmojiLayers(prev => [...prev, layer]);
  }, [pushWithAction, clipStart, clipEnd]);

  // ---- Drag layers on the preview ----
  const startDrag = useCallback((
    e: React.PointerEvent,
    type: 'text' | 'emoji',
    id: string,
    pos: Position,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      type, id,
      startPX: e.clientX,
      startPY: e.clientY,
      startPos: { ...pos },
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const moveDrag = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    const rect = previewRef.current?.getBoundingClientRect();
    if (!d || !rect || rect.width === 0 || rect.height === 0) return;

    const nx = Math.max(0, Math.min(100, d.startPos.x + ((e.clientX - d.startPX) / rect.width) * 100));
    const ny = Math.max(0, Math.min(100, d.startPos.y + ((e.clientY - d.startPY) / rect.height) * 100));

    if (d.type === 'text') {
      setTextLayers(prev => prev.map(l => (l.id === d.id ? { ...l, position: { x: nx, y: ny } } : l)));
    } else {
      setEmojiLayers(prev => prev.map(l => (l.id === d.id ? { ...l, position: { x: nx, y: ny } } : l)));
    }
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  // ---- Music ----
  const pickMusic = useCallback(async (item: { url: string; title: string; artist?: string | null; thumbnail_url?: string | null; duration?: number | null }) => {
    try {
      await musicLibrary.addOrIncrement({
        url: item.url,
        title: item.title,
        artist: item.artist || undefined,
        duration: item.duration || undefined,
        thumbnail_url: item.thumbnail_url || undefined,
      });
      const maxSeg = Math.min(Math.max(item.duration || 60, 5), 60);
      setMusicSegStart(0);
      setMusicSegEnd(Math.min(maxSeg, 15));
      setPendingMusic(item);
      setMusicQuery('');
    } catch (err) {
      toast({ title: 'Failed to add music', description: (err as Error).message, variant: 'destructive' });
    }
  }, [musicLibrary]);

  const handleMusicUrlSubmit = useCallback(async () => {
    if (!urlInput.trim()) return;
    const info = detectMusicUrl(urlInput.trim());
    if (!info.isValid) {
      setUrlError(info.error || 'Invalid URL');
      return;
    }
    setIsAddingMusic(true);
    setUrlError('');
    try {
      const meta = await extractMusicMetadata(urlInput.trim());
      await pickMusic({
        url: urlInput.trim(),
        title: meta.title,
        artist: meta.artist,
        thumbnail_url: meta.thumbnail,
        duration: meta.duration,
      });
      setUrlInput('');
    } catch (err) {
      setUrlError((err as Error).message || 'Failed to add music');
    } finally {
      setIsAddingMusic(false);
    }
  }, [urlInput, pickMusic]);

  const confirmMusic = useCallback(() => {
    if (!pendingMusic) return;
    pushWithAction('Add audio');
    const info = detectMusicUrl(pendingMusic.url);
    const sourceType: AudioTrack['sourceType'] = info.type as AudioTrack['sourceType'];
    setAudioTrack({
      id: `audio-${Date.now()}`,
      type: 'audio',
      url: pendingMusic.url,
      sourceType,
      videoId: info.videoId || undefined,
      title: pendingMusic.title,
      artist: pendingMusic.artist || undefined,
      thumbnailUrl: pendingMusic.thumbnail_url || undefined,
      startAt: musicSegStart,
      endAt: musicSegEnd,
      duration: musicSegEnd - musicSegStart,
      volume: 100,
      muted: false,
    });
    setPendingMusic(null);
    setActiveTool(null);
  }, [pendingMusic, musicSegStart, musicSegEnd, pushWithAction]);

  const removeMusic = useCallback(() => {
    pushWithAction('Remove audio');
    setAudioTrack(null);
  }, [pushWithAction]);

  const filteredMusic = musicLibrary.tracks.filter(
    t => t.title.toLowerCase().includes(musicQuery.toLowerCase()) ||
      (t.artist && t.artist.toLowerCase().includes(musicQuery.toLowerCase()))
  );
  const musicToShow = musicQuery ? filteredMusic : (musicLibrary.popularTracks.length ? musicLibrary.popularTracks : musicLibrary.trendingTracks);

  // ---- Save / Next ----
  const handleNext = async () => {
    if (videoLayers.length === 0) {
      toast({ title: 'No video added', description: 'Please add a video clip before continuing', variant: 'destructive' });
      return;
    }
    try {
      const data = buildProjectJson();
      if (project) {
        updateProjectData({ ...project, project_json: data, status: 'draft' });
      }
      await saveNow(data);
      navigate(`/editor/publish?projectId=${project?.id}`);
    } catch (err) {
      console.error('[MobileReelEditor] Save before next failed:', err);
      toast({ title: 'Failed to save', variant: 'destructive' });
    }
  };

  const handleClose = async () => {
    if (dataLoadedRef.current && videoLayers.length > 0) {
      await saveNow(buildProjectJson());
    }
    navigate(-1);
  };

  // ---- Render helpers ----
  const selectedText = textLayers.find(l => l.id === selectedLayerId);

  const renderTextOverlays = (visible: boolean) => {
    if (!visible || textLayers.length === 0) return null;
    return textLayers.map(layer => (
      <button
        key={layer.id}
        className="absolute select-none touch-none" 
        style={{
          left: `${layer.position.x}%`,
          top: `${layer.position.y}%`,
          transform: 'translate(-50%, -50%)',
          fontSize: `${layer.style.fontSize * layer.scale}px`,
          fontWeight: layer.style.fontWeight as number,
          color: layer.style.color,
          fontStyle: layer.style.fontStyle,
          lineHeight: 1.2,
          whiteSpace: 'pre-wrap',
          maxWidth: '88%',
          textShadow: '0 2px 6px rgba(0,0,0,0.6)',
          outline: layer.id === selectedLayerId ? '1px dashed rgba(255,255,255,0.7)' : 'none',
          background: layer.style.backgroundColor || 'transparent',
          borderRadius: 4,
          padding: '2px 6px',
        }}
        onPointerDown={e => startDrag(e, 'text', layer.id, layer.position)}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onClick={(e) => { e.stopPropagation(); setSelectedLayerId(layer.id); setTextDraft(layer.content); }}
      >
        {layer.content}
      </button>
    ));
  };

  const renderEmojiOverlays = (visible: boolean) => {
    if (!visible || emojiLayers.length === 0) return null;
    return emojiLayers.map(layer => (
      <button
        key={layer.id}
        className="absolute select-none touch-none"
        style={{
          left: `${layer.position.x}%`,
          top: `${layer.position.y}%`,
          transform: 'translate(-50%, -50%)',
          fontSize: `${layer.scale * 56}px`,
          lineHeight: 1,
          outline: layer.id === selectedLayerId ? '1px dashed rgba(255,255,255,0.7)' : 'none',
          borderRadius: 8,
        }}
        onPointerDown={e => startDrag(e, 'emoji', layer.id, layer.position)}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onClick={(e) => { e.stopPropagation(); setSelectedLayerId(layer.id); }}
      >
        {layer.content}
      </button>
    ));
  };

  const renderTrimPanel = () => (
    <div className="px-4 py-4 space-y-4">
      <div className="flex items-center justify-between text-xs font-mono text-white/80">
        <span>{fmt(currentTime)}</span>
        <span>Trim {fmt(clipStart)} – {fmt(clipEnd)}</span>
        <span>{fmt(duration)}</span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-white/60">
          <span>Playhead</span>
          <span>{fmt(currentTime)}</span>
        </div>
        <Slider
          min={0}
          max={Math.max(duration, 1)}
          step={0.05}
          value={[currentTime]}
          onValueChange={([v]) => v != null && seekTo(v)}
          className="[&>span:first-child]:h-6"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-white/60">
          <span>Start</span>
          <span>{fmt(clipStart)}</span>
        </div>
        <Slider
          min={0}
          max={Math.max(clipEnd - 0.2, 0.2)}
          step={0.05}
          value={[clipStart]}
          onValueChange={([v]) => {
            if (v == null) return;
            pushWithAction('Trim start');
            setClipStart(Math.max(0, Math.min(v, clipEnd - 0.2)));
          }}
          className="[&>span:first-child]:h-6"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-white/60">
          <span>End</span>
          <span>{fmt(clipEnd)}</span>
        </div>
        <Slider
          min={Math.min(clipStart + 0.2, Math.max(duration - 0.2, 0.2))}
          max={Math.max(duration, 1)}
          step={0.05}
          value={[clipEnd]}
          onValueChange={([v]) => {
            if (v == null) return;
            pushWithAction('Trim end');
            setClipEnd(Math.max(clipStart + 0.2, Math.min(v, duration)));
          }}
          className="[&>span:first-child]:h-6"
        />
      </div>

      <Button className="w-full" onClick={() => setActiveTool(null)}>
        <Check className="h-4 w-4 mr-1" /> Done
      </Button>
    </div>
  );

  const renderTextPanel = () => (
    <div className="px-4 py-4 space-y-4">
      <div className="flex items-center gap-2">
        <Input
          className="flex-1 text-white bg-white/10 border-white/20"
          placeholder="Add text to your reel"
          value={textDraft}
          onChange={e => setTextDraft(e.target.value)}
        />
        <Button
          onClick={() => {
            addText(textDraft);
            setTextDraft('');
          }}
        >
          Add
        </Button>
      </div>

      {selectedText ? (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-white/60">
              <span>Edit text</span>
              <span>{selectedText.content}</span>
            </div>
            <Input
              className="text-white bg-white/10 border-white/20"
              value={selectedText.content}
              onChange={e => updateSelectedText({ content: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-white/60">
              <span>Size</span>
              <span>{Math.round(selectedText.style.fontSize)}</span>
            </div>
            <Slider
              min={12}
              max={120}
              step={1}
              value={[selectedText.style.fontSize]}
              onValueChange={([v]) => v != null && updateSelectedText({ style: { ...selectedText.style, fontSize: v } })}
              className="[&>span:first-child]:h-6"
            />
          </div>

          <div className="space-y-2">
            <span className="text-xs text-white/60">Color</span>
            <div className="flex flex-wrap gap-2">
              {TEXT_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => updateSelectedText({ style: { ...selectedText.style, color } })}
                  className="h-8 w-8 rounded-full border-2"
                  style={{
                    background: color,
                    borderColor: selectedText.style.color === color ? '#ffffff' : 'transparent',
                  }}
                  aria-label={`Text color ${color}`}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 text-white border-white/20"
              onClick={toggleSelectedTextBold}
            >
              Bold: {selectedText.style.fontWeight === 700 ? 'On' : 'Off'}
            </Button>
            <Button
              variant="outline"
              className="flex-1 text-red-400 border-red-500/30"
              onClick={() => deleteLayer('text', selectedText.id)}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          </div>

          <p className="text-xs text-white/50">Tip: drag the text on the video to move it.</p>
        </>
      ) : (
        <p className="text-sm text-white/60">Tap <b>Add</b> to place text, then drag it on the preview.</p>
      )}
    </div>
  );

  const renderEffectsPanel = () => (
    <div className="px-4 py-4 space-y-4">
      <div className="grid grid-cols-6 gap-2">
        {EMOJIS.map(emoji => (
          <button
            key={emoji}
            className="h-12 flex items-center justify-center text-2xl rounded-xl bg-white/10 hover:bg-white/20"
            onClick={() => addEmoji(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>

      {emojiLayers.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs text-white/60">On your reel (tap to select, drag to move)</span>
          <div className="flex flex-wrap gap-2">
            {emojiLayers.map(layer => (
              <button
                key={layer.id}
                onClick={() => setSelectedLayerId(layer.id)}
                className={`relative flex items-center gap-2 rounded-xl border px-3 py-1.5 ${
                  selectedLayerId === layer.id ? 'border-white/80 bg-white/20' : 'border-white/20 bg-white/5'
                }`}
              >
                <span className="text-lg">{layer.content}</span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteLayer('emoji', layer.id);
                  }}
                  className="text-white/60 hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderAudioPanel = () => {
    if (audioTrack) {
      return (
        <div className="px-4 py-4 space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 p-3">
            {audioTrack.thumbnailUrl ? (
              <img src={audioTrack.thumbnailUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
            ) : (
              <div className="h-12 w-12 rounded-lg bg-white/20 flex items-center justify-center">
                <Music className="h-6 w-6 text-white" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{audioTrack.title}</p>
              <p className="text-xs text-white/60 truncate">{audioTrack.artist || audioTrack.sourceType}</p>
              <p className="text-xs text-white/50">Segment {fmt(audioTrack.startAt)} – {fmt(audioTrack.endAt)}</p>
            </div>
            <Button variant="outline" size="sm" className="text-red-400 border-red-500/30" onClick={removeMusic}>
              <Trash2 className="h-4 w-4 mr-1" /> Remove
            </Button>
          </div>
          <p className="text-xs text-white/50">Tip: audio plays with your reel preview.</p>
        </div>
      );
    }

    if (pendingMusic) {
      return (
        <div className="px-4 py-4 space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 p-3">
            {pendingMusic.thumbnail_url && <img src={pendingMusic.thumbnail_url} alt="" className="h-12 w-12 rounded-lg object-cover" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{pendingMusic.title}</p>
              <p className="text-xs text-white/60 truncate">{pendingMusic.artist}</p>
            </div>
          </div>

          <MusicTrimmer
            duration={Math.min(pendingMusic.duration || 300, 300)}
            onSelectSegment={(start, end) => { setMusicSegStart(start); setMusicSegEnd(end); }}
            initialStart={musicSegStart}
            initialEnd={musicSegEnd}
            maxSegmentDuration={Math.min(Math.max(pendingMusic.duration || 60, 5), 60)}
          />

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 text-white border-white/20" onClick={() => setPendingMusic(null)}>
              Back
            </Button>
            <Button className="flex-1" onClick={confirmMusic}>
              <Check className="h-4 w-4 mr-1" /> Add to Reel
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="px-4 py-4 space-y-4">
        <div className="flex items-center gap-2">
          <Input
            className="flex-1 text-white bg-white/10 border-white/20"
            placeholder="Paste a YouTube / SoundCloud link"
            value={urlInput}
            onChange={e => { setUrlInput(e.target.value); setUrlError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleMusicUrlSubmit()}
          />
          <Button onClick={handleMusicUrlSubmit} disabled={isAddingMusic}>
            {isAddingMusic ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
          </Button>
        </div>
        {urlError && (
          <div className="flex items-center gap-2 text-xs text-red-400">
            <AlertCircle className="h-4 w-4" /> {urlError}
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-2">
            <Search className="h-4 w-4 text-white/50" />
            <Input
              className="flex-1 h-9 text-sm text-white bg-white/10 border-white/20"
              placeholder="Search music library"
              value={musicQuery}
              onChange={e => setMusicQuery(e.target.value)}
            />
          </div>

          <div className="max-h-56 overflow-y-auto space-y-2">
            {musicToShow.map(track => (
              <button
                key={track.id}
                onClick={() => pickMusic(track)}
                className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2.5 text-left hover:bg-white/10"
              >
                {track.thumbnail_url ? (
                  <img src={track.thumbnail_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center">
                    {track.source_type === 'youtube'
                      ? <Youtube className="h-5 w-5 text-red-400" />
                      : <Music2 className="h-5 w-5 text-white/60" />}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{track.title}</p>
                  <p className="text-xs text-white/60 truncate">{track.artist || 'Unknown artist'}</p>
                </div>
                {typeof track.usage_count === 'number' && track.usage_count > 0 && (
                  <span className="text-xs text-white/40 shrink-0">{track.usage_count} uses</span>
                )}
              </button>
            ))}
            {musicToShow.length === 0 && !musicLibrary.isLoading && (
              <p className="text-sm text-white/50 text-center py-6">No music found. Add a link above.</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderFiltersStrip = () => (
    <div className="border-t border-white/10 bg-black/90 px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-white/60 shrink-0">Filter</span>
        <div className="flex gap-2 overflow-x-auto">
          {FILTER_PRESETS.map(preset => {
            const active = (globalFilter.brightness === preset.filter.brightness &&
              globalFilter.contrast === preset.filter.contrast &&
              globalFilter.saturation === preset.filter.saturation) || (preset.id === 'original' && globalFilter.brightness === 100);
            return (
              <button
                key={preset.id}
                onClick={() => applyFilter(preset.filter)}
                className={`shrink-0 flex flex-col items-center gap-1 rounded-xl border p-2 ${
                  active ? 'border-purple-500 bg-purple-500/20' : 'border-white/15 bg-white/5'
                }`}
              >
                <span
                  className="h-12 w-10 rounded-md block"
                  style={{
                    background: 'linear-gradient(135deg, #f97316, #10b981, #3b82f6, #a855f7)',
                    filter: buildFilterStyle(preset.filter),
                  }}
                />
                <span className="text-[10px] text-white/80 truncate max-w-[64px]">{preset.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ---- Empty / loading states ----
  if (isLoading && !project) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black text-white">
        <Loader2 className="h-10 w-10 animate-spin text-white/70" />
      </div>
    );
  }

  if (!project && !isLoading) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black text-white gap-4">
        <p className="text-lg font-semibold">No Reel project found</p>
        <p className="text-sm text-white/60">Upload a video to start editing.</p>
        <Button variant="outline" onClick={() => navigate('/create/post')}>Go to Create</Button>
      </div>
    );
  }

  const hasVideo = videoLayers.length > 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black text-white overflow-hidden"
      style={{
        height: '100dvh',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Top bar: back, undo/redo, Next */}
      <header className="flex items-center justify-between gap-2 px-2 py-2 shrink-0">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-10 w-10 text-white" onClick={handleClose} aria-label="Close">
            <X className="h-6 w-6" />
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10 text-white" onClick={handleUndo} disabled={!canUndo} aria-label="Undo">
            <span className="text-lg rotate-180">↩</span>
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10 text-white" onClick={handleRedo} disabled={!canRedo} aria-label="Redo">
            <span className="text-lg">↩</span>
          </Button>
        </div>

        <div className="text-center">
          <h1 className="text-sm font-semibold leading-tight">Edit Reel</h1>
          <p className="text-[10px] text-white/50">{hasVideo ? fmt(clipStart) + ' – ' + fmt(clipEnd) + ' of ' + fmt(duration) : 'No video'}</p>
        </div>

        <Button
          onClick={handleNext}
          disabled={!hasVideo}
          className="bg-purple-600 hover:bg-purple-500 text-white rounded-full px-6 h-10 font-semibold"
        >
          Next
        </Button>
      </header>

      {/* Preview */}
      <div
        ref={previewRef}
        className="relative flex-1 min-h-0 overflow-hidden flex items-center justify-center"
        onDoubleClick={hasVideo ? togglePlay : undefined}
      >
        {hasVideo ? (
          <>
            <video
              ref={videoRef}
              className="max-h-full max-w-full object-contain"
              playsInline
              style={{ filter: buildFilterStyle(globalFilter) }}
              onClick={togglePlay}
            />
            {renderTextOverlays(true)}
            {renderEmojiOverlays(true)}

            {!isPlaying && (
              <button
                className="absolute inset-0 flex items-center justify-center bg-black/20"
                onClick={togglePlay}
                aria-label="Play"
              >
                <span className="h-20 w-20 rounded-full bg-black/40 flex items-center justify-center">
                  <Play className="h-10 w-10 text-white fill-white" />
                </span>
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center px-6">
            <p className="text-base text-white/70">Select a Reel to start editing</p>
            <Button onClick={() => navigate('/create/post')} className="bg-purple-600 hover:bg-purple-500 text-white rounded-full px-6">
              Upload a Reel
            </Button>
          </div>
        )}
      </div>

      {/* Tool panel (TikTok/Reels-style bottom sheet, filters render as a strip) */}
      {activeTool === 'filters' && renderFiltersStrip()}
      {activeTool === 'trim' && (
        <div className="shrink-0 border-t border-white/10 bg-black/95 max-h-[55dvh] overflow-y-auto">
          {renderTrimPanel()}
        </div>
      )}
      {activeTool === 'text' && (
        <div className="shrink-0 border-t border-white/10 bg-black/95 max-h-[55dvh] overflow-y-auto">
          {renderTextPanel()}
        </div>
      )}
      {activeTool === 'effects' && (
        <div className="shrink-0 border-t border-white/10 bg-black/95 max-h-[55dvh] overflow-y-auto">
          {renderEffectsPanel()}
        </div>
      )}
      {activeTool === 'audio' && (
        <div className="shrink-0 border-t border-white/10 bg-black/95 max-h-[60dvh] overflow-y-auto">
          {renderAudioPanel()}
        </div>
      )}

      {/* Tool rail */}
      <nav className="flex items-center justify-around shrink-0 border-t border-white/10 bg-black/95 px-1 pt-2 pb-1">
        {TOOLS.map(tool => (
          <button
            key={tool.key}
            className={`flex flex-col items-center gap-1 py-1 px-3 min-w-[56px] ${
              activeTool === tool.key ? 'text-purple-400' : 'text-white/80'
            }`}
            onClick={() => setActiveTool(prev => (prev === tool.key ? null : tool.key))}
          >
            <tool.icon className="h-6 w-6" />
            <span className="text-[10px]">{tool.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}