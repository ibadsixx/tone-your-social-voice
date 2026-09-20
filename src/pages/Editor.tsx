// Editor v11 - Full Integration with Autosave, Undo/Redo, Audio Effects, Performance
// Single source of truth: Editor.tsx holds project + player + all layers
// Features: Autosave (debounced), Undo/Redo stack, Audio effects engine, Performance monitoring
// NEW: Resizable, collapsible sidebar with internal scrolling and layer list

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, Save, Undo, Redo, Clock, Loader2, ChevronRight
} from 'lucide-react';
import { EditorCanvas, EditorCanvasRef } from '@/components/editor/EditorCanvas';
import { EditorSidebar } from '@/components/editor/EditorSidebar';
import MobileReelEditor from '@/components/editor/MobileReelEditor';
import { useIsMobile } from '@/hooks/use-mobile';
import { VideoTimeline } from '@/components/editor/timeline/VideoTimeline';
import { PlaybackControls } from '@/components/editor/panels/PlaybackControls';
import { useEditorProject, EditorProject } from '@/hooks/useEditorProject';
import { useEditorHistory, EditorSnapshot } from '@/hooks/useEditorHistory';
import { useAutosave } from '@/hooks/useAutosave';
import { usePerformanceMonitor } from '@/hooks/usePerformanceMonitor';
import { toast } from '@/hooks/use-toast';
import { VideoPlayer, createPlayer } from '@/lib/player';
import {
  VideoLayer, ImageLayer, TextLayer, EmojiLayer, AudioTrack,
  VideoFilter, defaultVideoFilter, defaultTextStyle, normalizeVideoFilter,
  Transcript, EditorTemplate
} from '@/types/editor';

// Sidebar width constants
const DEFAULT_SIDEBAR_WIDTH = 320;
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 480;

export default function Editor() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId') || undefined;
  
  // Single project hook - loads by projectId
  const { project, saveProject, isLoading, updateProjectData } = useEditorProject(projectId);
  const isMobile = useIsMobile();
  const canvasRef = useRef<EditorCanvasRef>(null);
  const playerRef = useRef<VideoPlayer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioEngineRef = useRef<import('@/lib/audioEngine').AudioEngine | null>(null);
  
  // History for undo/redo
  const { 
    pushSnapshot, 
    undo, 
    redo, 
    canUndo, 
    canRedo, 
    undoCount, 
    redoCount,
    getRecentActions 
  } = useEditorHistory();
  
  // Autosave hook
  const { 
    queueSave, 
    saveNow, 
    isSaving, 
    lastSaveTime, 
    pendingChanges 
  } = useAutosave(project?.id, {
    debounceMs: 1000,
    onSaveSuccess: (timestamp) => {
      console.log('[Editor] ✅ Autosave complete at', timestamp.toISOString());
    },
    onSaveError: (error) => {
      console.error('[Editor] ❌ Autosave failed:', error);
      toast({ title: 'Autosave failed', description: error.message, variant: 'destructive' });
    },
  });
  
  // Performance monitoring
  const { recordFrame, markEvent, metrics } = usePerformanceMonitor({ 
    enabled: process.env.NODE_ENV === 'development',
    logInterval: 10000,
  });
  
  // Playback state - synced with player
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [videoVolume, setVideoVolume] = useState(100);
  const [audioTrackVolume, setAudioTrackVolume] = useState(100);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  
  // Sidebar state - persisted with autosave
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);

  // Trim state (playback range)
  const [clipStart, setClipStart] = useState(0);
  const [clipEnd, setClipEnd] = useState(30);

  // Editor state - Single source of truth for layers
  const [videoLayers, setVideoLayers] = useState<VideoLayer[]>([]);
  const [imageLayers, setImageLayers] = useState<ImageLayer[]>([]);
  const [textLayers, setTextLayers] = useState<TextLayer[]>([]);
  const [emojiLayers, setEmojiLayers] = useState<EmojiLayer[]>([]);
  const [audioTrack, setAudioTrack] = useState<AudioTrack | null>(null);
  const [globalFilter, setGlobalFilter] = useState<VideoFilter>(defaultVideoFilter);
  const [duration, setDuration] = useState(30);
  const [transcript, setTranscript] = useState<Transcript | null>(null);

  // UI state
  const [activePanel, setActivePanel] = useState<string>('media');
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [selectedLayerType, setSelectedLayerType] = useState<string | null>(null);

  const projectLoadedRef = useRef<string | null>(null);

  // Initialize player
  useEffect(() => {
    if (!playerRef.current) {
      playerRef.current = createPlayer();
      console.log('[Editor] Created player instance');
    }

    const player = playerRef.current;

    // Subscribe to player events
    const handleTimeUpdate = (data: { time: number; clipIndex: number }) => {
      setCurrentTime(data.time);
    };

    const handleStateChange = (state: any) => {
      setIsPlaying(state.isPlaying);
      setIsScrubbing(state.isScrubbing);
    };

    const handleDurationChange = (data: { duration: number }) => {
      if (data.duration > 0 && data.duration !== duration) {
        setDuration(data.duration);
        setClipEnd(data.duration);
      }
    };

    player.on('timeupdate', handleTimeUpdate);
    player.on('statechange', handleStateChange);
    player.on('durationchange', handleDurationChange);

    return () => {
      player.off('timeupdate', handleTimeUpdate);
      player.off('statechange', handleStateChange);
      player.off('durationchange', handleDurationChange);
    };
  }, [duration]);

  // Callback when video element is ready for WebAudio connection
  // This is called from EditorCanvas when video canplaythrough fires
  const handleVideoElementReady = useCallback(async (videoEl: HTMLVideoElement) => {
    const { getAudioEngine } = require('@/lib/audioEngine');
    const engine = getAudioEngine();
    audioEngineRef.current = engine;
    
    // Resume context and apply current volume setting
    await engine.resume();
    const effectiveVolume = isVideoMuted ? 0 : videoVolume;
    engine.setVideoVolume(effectiveVolume);
    console.log(`[AUDIO_ENGINE] video routed through WebAudio`);
    console.log(`[AUDIO_ENGINE] video gain applied -> ${(effectiveVolume / 100).toFixed(2)}`);
  }, [videoVolume, isVideoMuted]);

  // Sync video volume state to AudioEngine whenever volume changes
  useEffect(() => {
    if (audioEngineRef.current) {
      // Use async resume to ensure context is running
      audioEngineRef.current.resume().then(() => {
        const effectiveVolume = isVideoMuted ? 0 : videoVolume;
        audioEngineRef.current?.setVideoVolume(effectiveVolume);
        console.log(`[AUDIO_ENGINE] video gain applied -> ${(effectiveVolume / 100).toFixed(2)}`);
      });
    }
  }, [videoVolume, isVideoMuted]);

  // Create current snapshot for history
  const createSnapshot = useCallback((action: string): Omit<EditorSnapshot, 'timestamp'> => ({
    action,
    videoLayers: [...videoLayers],
    audioTrack: audioTrack ? { ...audioTrack } : null,
    emojiLayers: [...emojiLayers],
    textLayers: [...textLayers],
    imageLayers: [...imageLayers],
    globalFilter: { ...globalFilter },
    duration,
    clipStart,
    clipEnd,
    transcript,
  }), [videoLayers, audioTrack, emojiLayers, textLayers, imageLayers, globalFilter, duration, clipStart, clipEnd, transcript]);

  // Apply snapshot from history
  const applySnapshot = useCallback((snapshot: EditorSnapshot) => {
    console.log('[Editor] Applying snapshot:', snapshot.action);
    setVideoLayers(snapshot.videoLayers);
    setAudioTrack(snapshot.audioTrack);
    setEmojiLayers(snapshot.emojiLayers);
    setTextLayers(snapshot.textLayers);
    setImageLayers(snapshot.imageLayers);
    setGlobalFilter(snapshot.globalFilter);
    setDuration(snapshot.duration);
    setClipStart(snapshot.clipStart);
    setClipEnd(snapshot.clipEnd);
    setTranscript(snapshot.transcript);
  }, []);

  // Handle undo action
  const handleUndo = useCallback(() => {
    const previous = undo();
    if (previous) {
      applySnapshot(previous);
      toast({ title: `Undo: ${previous.action}` });
    }
  }, [undo, applySnapshot]);

  // Handle redo action
  const handleRedo = useCallback(() => {
    const next = redo();
    if (next) {
      applySnapshot(next);
      toast({ title: `Redo: ${next.action}` });
    }
  }, [redo, applySnapshot]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Update player when videoLayers change
  useEffect(() => {
    if (playerRef.current && videoLayers.length > 0) {
      console.log('[Editor] Updating player with', videoLayers.length, 'clips');
      playerRef.current.setClips(videoLayers);
    }
  }, [videoLayers]);

  // Load project data into state when project changes
  useEffect(() => {
    if (!project) return;
    if (projectLoadedRef.current === project.id) return;

    console.log('[EDITOR] ========================================');
    console.log('[EDITOR] loading project id:', project.id);
    console.log('[EDITOR] ========================================');
    loadProjectIntoState(project);
    projectLoadedRef.current = project.id as any;
  }, [project?.id]);

  // Load project data into state
  const loadProjectIntoState = async (proj: EditorProject) => {
    if (!proj?.project_json) return;

    const tracks = proj.project_json.tracks || [];
    const settings = proj.project_json.settings;

    // Load video layers
    const videoTrack = tracks.find((t: any) => t.type === 'video');
    if (videoTrack?.clips) {
      const vLayers: VideoLayer[] = videoTrack.clips.map((clip: any, index: number) => {
        const url = clip.src;
        
        // Log URL type for each clip
        const isTemporary = url?.startsWith('blob:') || url?.startsWith('data:');
        const isPermanent = url?.startsWith('http://') || url?.startsWith('https://');
        
        if (isTemporary) {
          console.warn(`[EDITOR] ⚠️ TEMPORARY URL for clip ${index}: ${url?.slice(0, 50)}...`);
        } else if (isPermanent) {
          console.log(`[EDITOR] using permanent URL for clip ${index}: ${url?.slice(0, 80)}...`);
        }
        
        return {
          id: clip.id,
          type: 'video',
          src: url,
          fileName: clip.fileName || 'Video',
          start: clip.start || 0,
          end: clip.end || clip.duration,
          duration: clip.duration,
          volume: clip.volume || 1,
          position: { x: 50, y: 50 },
          scale: 1,
          rotation: 0,
          filter: normalizeVideoFilter(clip.filter),
        };
      });
      
      setVideoLayers(vLayers);
      
      if (vLayers.length > 0) {
        const totalDur = Math.max(...vLayers.map(v => v.end || v.duration || 30));
        setDuration(totalDur);
        setClipEnd(totalDur);
        setGlobalFilter(normalizeVideoFilter(vLayers[0].filter));
        console.log('[EDITOR] ✅ Videos loaded:', vLayers.length, 'clips, total duration:', totalDur);
      }
    } else {
      console.log('[EDITOR] player.init delayed: waiting for clips');
    }

    // Load audio track
    const audioTrackData = tracks.find((t: any) => t.type === 'audio');
    if (audioTrackData?.clips?.[0]) {
      const clip = audioTrackData.clips[0];
      setAudioTrack({
        id: clip.id,
        type: 'audio',
        url: clip.src,
        sourceType: clip.sourceType || 'direct',
        title: clip.title || 'Music',
        artist: clip.artist,
        startAt: clip.start || 0,
        endAt: clip.end || clip.duration,
        duration: clip.duration,
        volume: (clip.volume || 1) * 100,
        muted: false,
        effects: clip.effects,
      });
    }

    // Load overlay layers
    const overlayTrack = tracks.find((t: any) => t.type === 'overlay');
    if (overlayTrack?.clips) {
      const eLayers: EmojiLayer[] = overlayTrack.clips.map((clip: any) => ({
        id: clip.id,
        type: clip.type || 'emoji',
        content: clip.content,
        start: clip.start || 0,
        end: clip.end || settings?.duration || 30,
        position: clip.position || { x: 50, y: 50 },
        scale: clip.scale || 1,
        rotation: clip.rotation || 0,
      }));
      setEmojiLayers(eLayers);
    }

    // Load text layers
    const textTrack = tracks.find((t: any) => t.type === 'text');
    if (textTrack?.clips) {
      const tLayers: TextLayer[] = textTrack.clips.map((clip: any) => {
        // Normalize fontWeight from old string format to number
        const normalizeStyle = (style: any) => {
          if (!style) return defaultTextStyle;
          let fontWeight = style.fontWeight;
          if (typeof fontWeight === 'string') {
            fontWeight = fontWeight === 'bold' ? 700 : 400;
          }
          return {
            ...defaultTextStyle,
            ...style,
            fontWeight: fontWeight || 700,
          };
        };
        
        return {
          id: clip.id,
          type: 'text' as const,
          content: clip.content,
          start: clip.start || 0,
          end: clip.end || settings?.duration || 30,
          position: clip.position || { x: 50, y: 50 },
          scale: clip.scale || 1,
          rotation: clip.rotation || 0,
          style: normalizeStyle(clip.style),
          animation: clip.animation,
        };
      });
      setTextLayers(tLayers);
    }

    // Load image layers
    const imageTrack = tracks.find((t: any) => t.type === 'image');
    if (imageTrack?.clips) {
      const iLayers: ImageLayer[] = imageTrack.clips.map((clip: any) => ({
        id: clip.id,
        type: 'image',
        src: clip.src,
        fileName: clip.fileName,
        start: clip.start || 0,
        end: clip.end || settings?.duration || 30,
        position: clip.position || { x: 50, y: 50 },
        scale: clip.scale || 1,
        rotation: clip.rotation || 0,
      }));
      setImageLayers(iLayers);
    }

    // Load transcript if exists
    if (proj.project_json.transcripts?.[0]) {
      setTranscript(proj.project_json.transcripts[0]);
    }

    if (settings?.duration) {
      setDuration(settings.duration);
      setClipEnd(settings.duration);
    }
    
    if (settings?.clipStart !== undefined) {
      setClipStart(settings.clipStart);
    }
    if (settings?.clipEnd !== undefined) {
      setClipEnd(settings.clipEnd);
    }

    // Restore volumes from settings (legacy) or audio block (new schema)
    const audioState = (proj.project_json as any).audio as
      | { videoVolume?: number; tracks?: Record<string, { volume?: number }> }
      | undefined;

    let restoredVideoVolume = settings?.videoVolume;
    if (audioState?.videoVolume !== undefined) {
      restoredVideoVolume = Math.round(audioState.videoVolume * 100);
    }
    if (restoredVideoVolume !== undefined) {
      setVideoVolume(restoredVideoVolume);
    }

    if (audioTrackData?.clips?.[0]) {
      const clip = audioTrackData.clips[0];
      const trackVolumeFromAudio = audioState?.tracks?.[clip.id]?.volume;
      const resolvedVolume =
        typeof trackVolumeFromAudio === 'number'
          ? Math.round(trackVolumeFromAudio * 100)
          : (clip.volume || 1) * 100;

      setAudioTrack({
        id: clip.id,
        type: 'audio',
        url: clip.src,
        sourceType: clip.sourceType || 'direct',
        title: clip.title || 'Music',
        artist: clip.artist,
        startAt: clip.start || 0,
        endAt: clip.end || clip.duration,
        duration: clip.duration,
        volume: resolvedVolume,
        muted: false,
        effects: clip.effects,
      });
      setAudioTrackVolume(resolvedVolume);
      console.log('[AUDIO] restored volumes from project', {
        videoVolume: restoredVideoVolume,
        audioTrackId: clip.id,
        audioTrackVolume: resolvedVolume,
      });
    }
  };

  // Push initial snapshot after loading
  useEffect(() => {
    if (projectLoadedRef.current && videoLayers.length > 0) {
      pushSnapshot(createSnapshot('Project loaded'));
    }
  }, [projectLoadedRef.current]);

  // Helper to push snapshot with action name
  const pushWithAction = useCallback((action: string) => {
    pushSnapshot(createSnapshot(action));
  }, [pushSnapshot, createSnapshot]);

  // Auto-save when layers change (debounced)
  // Auto-save when layers change (debounced via useAutosave hook)
  useEffect(() => {
    if (!projectLoadedRef.current || videoLayers.length === 0) return;
    
    // Build project JSON for autosave
    const projectData = buildProjectJson();
    queueSave(projectData);
    
    // Record performance frame
    recordFrame();
  }, [videoLayers, audioTrack, audioTrackVolume, videoVolume, emojiLayers, textLayers, imageLayers, duration, clipStart, clipEnd, transcript]);

  // Build project JSON for saving (no blob/objectURL)
  const buildProjectJson = useCallback(() => {
    const tracks: any[] = [];

    if (videoLayers.length > 0) {
      tracks.push({
        id: 'track-video',
        type: 'video',
        clips: videoLayers.map(layer => ({
          id: layer.id,
          type: 'video',
          src: layer.src,
          fileName: layer.fileName,
          start: layer.start,
          end: layer.end,
          duration: layer.duration,
          volume: layer.volume,
          filter: layer.filter,
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

    if (imageLayers.length > 0) {
      tracks.push({
        id: 'track-image',
        type: 'image',
        clips: imageLayers.map(layer => ({
          id: layer.id,
          type: 'image',
          src: layer.src,
          fileName: layer.fileName,
          start: layer.start,
          end: layer.end,
          position: layer.position,
          scale: layer.scale,
          rotation: layer.rotation,
        })),
      });
    }

    const audioState = audioTrack ? {
      videoVolume: videoVolume / 100,
      tracks: {
        [audioTrack.id]: {
          volume: audioTrackVolume / 100,
        },
      },
    } : {
      videoVolume: videoVolume / 100,
      tracks: {},
    };

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
      audio: audioState,
    };
  }, [videoLayers, audioTrack, audioTrackVolume, emojiLayers, textLayers, imageLayers, duration, clipStart, clipEnd, transcript, videoVolume]);

  // Save draft on page leave/refresh - triggers saveNow synchronously
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingChanges) {
        // Trigger immediate save
        const projectData = buildProjectJson();
        saveNow(projectData);
        // Show browser's "unsaved changes" warning
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [pendingChanges, buildProjectJson, saveNow]);

  // Handlers
  const handleSave = async () => {
    try {
      markEvent('manual-save-start');
      const projectData = buildProjectJson();
      updateProjectData({
        ...project!,
        project_json: projectData,
      });
      await saveNow(projectData);
      toast({ title: 'Project saved' });
      markEvent('manual-save-end');
    } catch (error) {
      console.error('[Editor] ❌ Save failed:', error);
      toast({ title: 'Failed to save', variant: 'destructive' });
    }
  };

  // Save Draft - saves with status='draft' and shows confirmation
  const handleSaveDraft = async () => {
    try {
      markEvent('save-draft-start');
      const projectData = buildProjectJson();
      updateProjectData({
        ...project!,
        project_json: projectData,
        status: 'draft',
      });
      await saveNow(projectData);
      toast({ title: 'Draft saved', description: 'Your work has been saved' });
      markEvent('save-draft-end');
    } catch (error) {
      console.error('[Editor] ❌ Save draft failed:', error);
      toast({ title: 'Failed to save draft', variant: 'destructive' });
    }
  };

  // Next - validates, saves draft, and navigates to publish page
  const handleNext = async () => {
    // Validate: must have at least one video clip
    if (videoLayers.length === 0) {
      toast({ 
        title: 'No video added', 
        description: 'Please add a video clip before continuing',
        variant: 'destructive' 
      });
      return;
    }

    try {
      markEvent('next-save-start');
      const projectData = buildProjectJson();
      updateProjectData({
        ...project!,
        project_json: projectData,
        status: 'draft',
      });
      await saveNow(projectData);
      markEvent('next-save-end');
      
      // Navigate to publish page
      navigate(`/editor/publish?projectId=${project?.id}`);
    } catch (error) {
      console.error('[Editor] ❌ Save before next failed:', error);
      toast({ 
        title: 'Failed to save', 
        description: 'Please try again',
        variant: 'destructive' 
      });
    }
  };

  const handleBack = () => navigate(-1);

  const handleLayerUpdate = useCallback((type: string, id: string, updates: any) => {
    // Push snapshot before change for undo
    pushWithAction(`Update ${type} layer`);
    
    switch (type) {
      case 'video':
        setVideoLayers(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
        break;
      case 'audio':
        setAudioTrack(prev => prev ? { ...prev, ...updates } : null);
        break;
      case 'emoji':
        if (updates.scale !== undefined) {
          console.log('[EMOJI] updated scale=', updates.scale.toFixed(2), 'id=', id);
        }
        if (updates.position !== undefined) {
          console.log('[EMOJI] updated position=', updates.position, 'id=', id);
        }
        setEmojiLayers(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
        break;
      case 'text':
        setTextLayers(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
        break;
      case 'image':
        setImageLayers(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
        break;
    }
  }, [pushWithAction]);

  const handleLayerDelete = useCallback((type: string, id: string) => {
    // Push snapshot before delete for undo
    pushWithAction(`Delete ${type} layer`);
    
    switch (type) {
      case 'video':
        setVideoLayers(prev => prev.filter(l => l.id !== id));
        break;
      case 'audio':
        setAudioTrack(null);
        break;
      case 'emoji':
        console.log('[EMOJI] removed id=', id);
        setEmojiLayers(prev => prev.filter(l => l.id !== id));
        break;
      case 'text':
        setTextLayers(prev => prev.filter(l => l.id !== id));
        break;
      case 'image':
        setImageLayers(prev => prev.filter(l => l.id !== id));
        break;
    }
    if (selectedLayerId === id) {
      setSelectedLayerId(null);
      setSelectedLayerType(null);
    }
  }, [selectedLayerId, pushWithAction]);

  const handleLayerSelect = useCallback((type: string | null, id: string | null) => {
    setSelectedLayerId(id);
    setSelectedLayerType(type);
    // Auto-switch to text panel when text layer is selected
    if (type === 'text' && id) {
      setActivePanel('text');
      console.log('[Editor] 📝 Selected text layer:', id, '→ switching to text panel');
    }
  }, []);

  const handleAddEmoji = useCallback((emoji: Omit<EmojiLayer, 'id' | 'start' | 'end'>) => {
    pushWithAction('Add emoji');
    
    const newEmoji: EmojiLayer = {
      id: `emoji-${Date.now()}`,
      ...emoji,
      start: 0,
      end: duration,
    };
    console.log('[EMOJI] added layer id=', newEmoji.id, 'content=', newEmoji.content, 'scale=', newEmoji.scale);
    setEmojiLayers(prev => [...prev, newEmoji]);
    setSelectedLayerId(newEmoji.id);
    setSelectedLayerType('emoji');
  }, [duration, pushWithAction]);

  const handleAddText = useCallback((text: Omit<TextLayer, 'id' | 'start' | 'end'>) => {
    pushWithAction('Add text layer');
    
    const newText: TextLayer = {
      id: `text-${Date.now()}`,
      ...text,
      start: currentTime,
      end: Math.min(currentTime + 5, duration),
    };
    console.log('[Editor] addTextLayer:', newText.id);
    setTextLayers(prev => [...prev, newText]);
    setSelectedLayerId(newText.id);
    setSelectedLayerType('text');
  }, [duration, currentTime, pushWithAction]);

  // Add text from transcript
  const handleAddTextFromTranscript = useCallback((textData: Omit<TextLayer, 'id'>) => {
    const newText: TextLayer = {
      id: `text-${Date.now()}`,
      ...textData,
    };
    console.log('[Editor] addTextLayer from transcript:', newText.id, 'time:', newText.start, '-', newText.end);
    setTextLayers(prev => [...prev, newText]);
    setSelectedLayerId(newText.id);
    setSelectedLayerType('text');
  }, []);

  const handleAddImage = useCallback((image: Omit<ImageLayer, 'id'>) => {
    const newImage: ImageLayer = {
      id: `image-${Date.now()}`,
      ...image,
    };
    setImageLayers(prev => [...prev, newImage]);
    setSelectedLayerId(newImage.id);
    setSelectedLayerType('image');
    
    const newEndTime = Math.max(duration, image.end || 0);
    if (newEndTime > duration) {
      setDuration(newEndTime);
      setClipEnd(newEndTime);
    }
  }, [duration]);

  const handleAudioChange = useCallback((audio: AudioTrack | null) => {
    console.log('[Editor] Audio track changed:', audio?.id);
    setAudioTrack(audio);
    if (audio) {
      setAudioTrackVolume(audio.volume ?? 100);
    }
    // Apply current volume to new audio track element
    if (audioRef.current && audio) {
      audioRef.current.volume = 1;
      audioRef.current.src = audio.url;
    }
  }, []);

  const handleTranscriptUpdate = useCallback((newTranscript: Transcript) => {
    console.log('[Editor] Transcript updated:', newTranscript.id);
    setTranscript(newTranscript);
  }, []);

  const handleApplyTemplate = useCallback((template: EditorTemplate) => {
    console.log('[Editor] Applying template:', template.name);
    
    // Apply text layers from template
    if (template.textLayers) {
      const newTextLayers = template.textLayers.map(layer => ({
        ...layer,
        id: `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      }));
      setTextLayers(prev => [...prev, ...newTextLayers]);
    }
    
    // Apply global filter
    if (template.globalFilter) {
      setGlobalFilter(template.globalFilter);
      setVideoLayers(prev => prev.map(layer => ({ ...layer, filter: template.globalFilter })));
    }
    
    // Apply emoji layers
    if (template.emojiLayers) {
      const newEmojiLayers = template.emojiLayers.map(layer => ({
        ...layer,
        id: `emoji-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      }));
      setEmojiLayers(prev => [...prev, ...newEmojiLayers]);
    }
  }, []);

  // CRITICAL: Add video clip handler - recomputes all clip boundaries
  const handleAddVideo = useCallback((video: Omit<VideoLayer, 'id'>) => {
    const newVideo: VideoLayer = {
      id: `video-${Date.now()}`,
      ...video,
    };
    
    setVideoLayers(prev => {
      const updated = [...prev, newVideo];
      
      // Recompute clip.start for all clips
      let cumulativeTime = 0;
      const recomputed = updated.map(clip => {
        const clipDuration = clip.duration || (clip.end - clip.start) || 5;
        const newClip = {
          ...clip,
          start: cumulativeTime,
          end: cumulativeTime + clipDuration,
          duration: clipDuration,
        };
        cumulativeTime += clipDuration;
        return newClip;
      });
      
      const totalDur = cumulativeTime;
      
      console.log('[Editor] ➕ Added video clip:', newVideo.fileName);
      console.log('[Editor] 📊 Total clips:', recomputed.length, 'Duration:', totalDur, 's');
      
      setDuration(totalDur);
      setClipEnd(totalDur);
      
      return recomputed;
    });
  }, []);

  const handleFilterChange = useCallback((filter: VideoFilter) => {
    setGlobalFilter(filter);
    setVideoLayers(prev => prev.map(layer => ({ ...layer, filter })));
  }, []);

  const handleDurationChange = useCallback((newDuration: number) => {
    if (newDuration !== duration && newDuration > 0) {
      setDuration(newDuration);
      setClipEnd(Math.max(clipEnd, newDuration));
      console.log('[Editor] 📏 Duration updated to:', newDuration, 's');
    }
  }, [duration, clipEnd]);

  // Playback controls - use player and sync audio track
  const togglePlayPause = useCallback(() => {
    if (!playerRef.current) return;
    
    if (isPlaying) {
      playerRef.current.pause();
      // Pause audio track
      if (audioRef.current) {
        audioRef.current.pause();
      }
    } else {
      playerRef.current.play();
      // Play audio track
      if (audioRef.current && audioTrack) {
        audioRef.current.currentTime = currentTime - (audioTrack.startAt || 0);
        audioRef.current.play().catch(e => console.warn('[Editor] Audio play failed:', e));
      }
    }
  }, [isPlaying, audioTrack, currentTime]);

  const toggleVideoMute = () => setIsVideoMuted(prev => !prev);
  const toggleAudioMute = () => {
    setIsAudioMuted(prev => {
      const newMuted = !prev;
      console.log(`[AUDIO] track volume set -> trackId=${audioTrack?.id ?? 'none'} value=${newMuted ? 0 : audioTrackVolume / 100}`);
      if (audioEngineRef.current && audioTrack) {
        audioEngineRef.current.updateEffect(audioTrack.id, 'volume', newMuted ? 0 : audioTrackVolume);
      }
      if (audioRef.current) {
        audioRef.current.volume = 1;
      }
      return newMuted;
    });
  };
  const toggleLoop = () => setIsLooping(prev => !prev);
  const toggleSidebar = () => setSidebarCollapsed(prev => !prev);

  // Sync audio track volume with audio element + AudioEngine
  useEffect(() => {
    if (audioRef.current && audioTrack) {
      audioRef.current.volume = 1;
    }
    if (audioEngineRef.current && audioTrack) {
      const effectiveVolume = isAudioMuted ? 0 : audioTrackVolume;
      audioEngineRef.current.updateEffect(audioTrack.id, 'volume', effectiveVolume);
      console.log(`[AUDIO] track volume set -> trackId=${audioTrack.id} value=${(effectiveVolume / 100).toFixed(2)}`);
    }
  }, [audioTrackVolume, isAudioMuted, audioTrack]);

  // Seek handler - uses player and syncs audio track
  const handleSeek = useCallback((time: number) => {
    const clampedTime = Math.max(0, Math.min(time, duration));
    console.log('[Editor] 🎯 handleSeek:', clampedTime.toFixed(2), 's');
    setCurrentTime(clampedTime);
    
    if (playerRef.current) {
      playerRef.current.seekGlobalTime(clampedTime);
    }
    if (canvasRef.current) {
      canvasRef.current.seekTo(clampedTime);
    }
    // Sync audio track seek
    if (audioRef.current && audioTrack) {
      const audioTime = clampedTime - (audioTrack.startAt || 0);
      if (audioTime >= 0 && audioTime <= (audioTrack.duration || Infinity)) {
        audioRef.current.currentTime = audioTime;
      }
    }
  }, [duration, audioTrack]);

  // Scrub handlers - uses player
  const handleScrubStart = useCallback(() => {
    setIsScrubbing(true);
    if (playerRef.current) {
      playerRef.current.startScrub();
    }
  }, []);

  const handleScrubEnd = useCallback(() => {
    setIsScrubbing(false);
    if (playerRef.current) {
      playerRef.current.endScrub();
    }
  }, []);

  // Duplicate text layer
  const handleDuplicateTextLayer = useCallback((layer: TextLayer) => {
    const newLayer: TextLayer = {
      ...layer,
      id: `text-${Date.now()}`,
      start: layer.start + 1,
      end: layer.end + 1,
    };
    setTextLayers(prev => [...prev, newLayer]);
    setSelectedLayerId(newLayer.id);
  }, []);


  if (isLoading && !project) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!project && !isLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background">
        <h2 className="text-xl font-semibold mb-2">No Project Found</h2>
        <p className="text-muted-foreground mb-4">Upload a video to create a new project.</p>
        <Button onClick={() => navigate('/')}>Go Home</Button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b bg-card">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-semibold">{project?.title || 'Advanced Editor'}</h1>
          {/* Save status indicator */}
          {isSaving ? (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving...
            </Badge>
          ) : lastSaveTime ? (
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" />
              Saved {lastSaveTime.toLocaleTimeString()}
            </Badge>
          ) : pendingChanges ? (
            <Badge variant="secondary" className="gap-1">
              <Clock className="h-3 w-3" />
              Unsaved changes
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {/* Undo button */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleUndo}
            disabled={!canUndo}
            title={`Undo (Ctrl+Z) - ${undoCount} actions`}
          >
            <Undo className="h-5 w-5" />
          </Button>
          {/* Redo button */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleRedo}
            disabled={!canRedo}
            title={`Redo (Ctrl+Shift+Z) - ${redoCount} actions`}
          >
            <Redo className="h-5 w-5" />
          </Button>
          <Button variant="outline" onClick={handleSaveDraft} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Draft
          </Button>
          <Button onClick={handleNext} disabled={isSaving || videoLayers.length === 0}>
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - Resizable, collapsible with internal scrolling */}
        <EditorSidebar
          isCollapsed={sidebarCollapsed}
          width={sidebarWidth}
          activePanel={activePanel}
          textLayers={textLayers}
          emojiLayers={emojiLayers}
          imageLayers={imageLayers}
          videoLayers={videoLayers}
          audioTrack={audioTrack}
          selectedLayerId={selectedLayerId}
          selectedLayerType={selectedLayerType}
          duration={duration}
          globalFilter={globalFilter}
          transcript={transcript}
          onToggleCollapse={toggleSidebar}
          onWidthChange={setSidebarWidth}
          onPanelChange={setActivePanel}
          onLayerSelect={handleLayerSelect}
          onLayerDelete={handleLayerDelete}
          onAddText={handleAddText}
          onAddEmoji={handleAddEmoji}
          onAddImage={handleAddImage}
          onAddVideo={handleAddVideo}
          onAudioChange={handleAudioChange}
          onFilterChange={handleFilterChange}
          onTranscriptUpdate={handleTranscriptUpdate}
          onAddTextFromTranscript={handleAddTextFromTranscript}
          onApplyTemplate={handleApplyTemplate}
          onSeek={handleSeek}
          onTextUpdate={(id, updates) => handleLayerUpdate('text', id, updates)}
          onTextDelete={(id) => handleLayerDelete('text', id)}
          onTextDuplicate={handleDuplicateTextLayer}
        />

        {/* Center - Canvas */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 relative">
            <EditorCanvas
              ref={canvasRef}
              isPlaying={isPlaying}
              isScrubbing={isScrubbing}
              videoLayers={videoLayers}
              currentTime={currentTime}
              clipStart={clipStart}
              clipEnd={clipEnd}
              onTimeUpdate={setCurrentTime}
              onDurationChange={handleDurationChange}
              globalFilter={globalFilter}
              emojiLayers={emojiLayers}
              textLayers={textLayers}
              imageLayers={imageLayers}
              onLayerUpdate={handleLayerUpdate}
              onLayerSelect={handleLayerSelect}
              onLayerDelete={handleLayerDelete}
              selectedLayerId={selectedLayerId}
              player={playerRef.current}
              videoVolume={videoVolume}
              videoMuted={isVideoMuted}
              onVideoElementReady={handleVideoElementReady}
            />
          </div>

          {/* Playback controls with separate video/audio volumes */}
          <PlaybackControls
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            volume={videoVolume}
            isMuted={isVideoMuted}
            isLooping={isLooping}
            playbackSpeed={playbackSpeed}
            onPlayPause={togglePlayPause}
            onSeek={handleSeek}
            onVolumeChange={setVideoVolume}
            onMuteToggle={toggleVideoMute}
            onLoopToggle={toggleLoop}
            onSpeedChange={setPlaybackSpeed}
            // Additional audio track controls
            audioTrackVolume={audioTrackVolume}
            isAudioMuted={isAudioMuted}
            onAudioVolumeChange={setAudioTrackVolume}
            onAudioMuteToggle={toggleAudioMute}
            hasAudioTrack={!!audioTrack}
          />
        </div>

        {/* Hidden audio element for audio track playback */}
        {audioTrack && (
          <audio
            ref={audioRef}
            src={audioTrack.url}
            loop={isLooping}
            style={{ display: 'none' }}
          />
        )}
      </div>

      {/* Bottom - Timeline */}
      <div className="h-56 border-t bg-card">
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
          selectedLayerId={selectedLayerId}
          onSeek={handleSeek}
          onScrubStart={handleScrubStart}
          onScrubEnd={handleScrubEnd}
          onTrimStartChange={setClipStart}
          onTrimEndChange={setClipEnd}
          onLayerSelect={handleLayerSelect}
          onLayerUpdate={handleLayerUpdate}
          onLayerDelete={handleLayerDelete}
          onAddVideo={handleAddVideo}
          onAddImage={handleAddImage}
          player={playerRef.current}
          videoVolume={videoVolume}
          isVideoMuted={isVideoMuted}
          onVideoVolumeChange={setVideoVolume}
          onVideoMutedChange={setIsVideoMuted}
        />
      </div>
    </div>
  );
}
