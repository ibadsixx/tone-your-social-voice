import { useState, useEffect, useCallback } from 'react';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';
import {
  VideoLayer,
  AudioTrack,
  EmojiLayer,
  TextLayer,
  ImageLayer,
  VideoFilter,
  Transcript,
  defaultVideoFilter,
} from '@/types/editor';

export interface EditorProject {
  id: string;
  owner_id: string;
  title: string;
  project_json: {
    tracks?: any[];
    clips?: any[];
    effects?: any[];
    settings?: any;
    transcripts?: Transcript[];
  };
  status: 'draft' | 'rendering' | 'done' | 'failed';
  output_url?: string;
  created_at: string;
  updated_at: string;
}

export interface ParsedProjectData {
  videoLayers: VideoLayer[];
  audioTrack: AudioTrack | null;
  emojiLayers: EmojiLayer[];
  textLayers: TextLayer[];
  imageLayers: ImageLayer[];
  globalFilter: VideoFilter;
  duration: number;
  clipStart: number;
  clipEnd: number;
  transcript: Transcript | null;
}

export const useEditorProject = (projectId?: string) => {
  const { user } = useAuth();
  const [project, setProject] = useState<EditorProject | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    console.log('[useEditorProject] Effect triggered - projectId:', projectId, 'user:', user?.id);
    
    if (projectId && user) {
      console.log('[useEditorProject] Loading existing project:', projectId);
      loadProject(projectId);
    } else if (user && !projectId) {
      console.log('[useEditorProject] Creating new project for user:', user.id);
      createNewProject();
    } else {
      console.log('[useEditorProject] Waiting for user authentication...');
    }
  }, [projectId, user]);

  const loadProject = async (id: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('[useEditorProject] ========================================');
      console.log('[useEditorProject] Fetching project from database:', id);
      const { data, error: fetchError } = await gateway
        .from('editor_projects')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
      
      console.log('[useEditorProject] Project loaded successfully:', data.id);
      
      const projectJson = data.project_json as any;
      if (projectJson?.tracks) {
        for (const track of projectJson.tracks) {
          if (track.clips) {
            for (const clip of track.clips) {
              const url = clip.src || clip.url;
              if (url) {
                const isPermanent = url.startsWith('http://') || url.startsWith('https://');
                const isTemporary = url.startsWith('blob:') || url.startsWith('data:');
                if (isTemporary) {
                  console.warn(`[useEditorProject] ⚠️ TEMPORARY URL detected: ${url.slice(0, 50)}...`);
                } else if (isPermanent) {
                  console.log(`[useEditorProject] ✅ Permanent URL: ${url.slice(0, 80)}...`);
                }
              }
            }
          }
        }
      }
      console.log('[useEditorProject] ========================================');
      
      setProject(data as EditorProject);
    } catch (err) {
      console.error('[useEditorProject] Failed to load project:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  };

  const createNewProject = async () => {
    if (!user) {
      console.warn('[useEditorProject] Cannot create project - no user');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('[useEditorProject] Creating new project in database...');
      const { data, error: createError } = await gateway
        .from('editor_projects')
        .insert({
          owner_id: user.id,
          title: 'Untitled Project',
          project_json: {
            tracks: [],
            clips: [],
            effects: [],
            settings: {
              duration: 30,
              fps: 30,
              resolution: { width: 1080, height: 1920 }
            }
          },
          status: 'draft'
        })
        .select()
        .single();

      if (createError) throw createError;
      
      console.log('[useEditorProject] New project created successfully:', data);
      setProject(data as EditorProject);
    } catch (err) {
      console.error('[useEditorProject] Failed to create project:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveProject = async (projectData?: any) => {
    if (!project || !user) return;

    setIsLoading(true);
    setError(null);

    try {
      const dataToSave = projectData || project.project_json;
      
      const { error: updateError } = await gateway
        .from('editor_projects')
        .update({
          title: project.title,
          project_json: dataToSave,
          status: project.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', project.id);

      if (updateError) throw updateError;
      
      console.log('[useEditorProject] Project saved successfully');
    } catch (err) {
      setError(err as Error);
      console.error('[useEditorProject] Failed to save project:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const updateProjectData = useCallback((updates: Partial<EditorProject>) => {
    console.log('[useEditorProject] 🔄 UPDATE PROJECT DATA called');
    
    setProject(prev => {
      if (!prev) {
        console.warn('[useEditorProject] ⚠️ Cannot update - no current project');
        return null;
      }
      const updated = { ...prev, ...updates };
      console.log('[useEditorProject] ✅ PROJECT STATE UPDATED');
      return updated;
    });
  }, []);

  const parseProjectData = useCallback((proj: EditorProject): ParsedProjectData => {
    const data: ParsedProjectData = {
      videoLayers: [],
      audioTrack: null,
      emojiLayers: [],
      textLayers: [],
      imageLayers: [],
      globalFilter: defaultVideoFilter,
      duration: 30,
      clipStart: 0,
      clipEnd: 30,
      transcript: null,
    };

    if (!proj?.project_json) return data;

    const tracks = proj.project_json.tracks || [];
    const settings = proj.project_json.settings;

    const videoTrack = tracks.find((t: any) => t.type === 'video');
    if (videoTrack?.clips) {
      data.videoLayers = videoTrack.clips.map((clip: any) => ({
        id: clip.id,
        type: 'video',
        src: clip.src,
        fileName: clip.fileName || 'Video',
        start: clip.start || 0,
        end: clip.end || clip.duration,
        duration: clip.duration,
        volume: clip.volume || 1,
        position: clip.position || { x: 50, y: 50 },
        scale: clip.scale || 1,
        rotation: clip.rotation || 0,
        filter: clip.filter || defaultVideoFilter,
      }));

      if (data.videoLayers.length > 0) {
        const totalDur = Math.max(...data.videoLayers.map(v => v.end || v.duration || 30));
        data.duration = totalDur;
        data.clipEnd = totalDur;
        data.globalFilter = data.videoLayers[0].filter || defaultVideoFilter;
      }
    }

    const audioTrackData = tracks.find((t: any) => t.type === 'audio');
    if (audioTrackData?.clips?.[0]) {
      const clip = audioTrackData.clips[0];
      data.audioTrack = {
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
      };
    }

    const overlayTrack = tracks.find((t: any) => t.type === 'overlay');
    if (overlayTrack?.clips) {
      data.emojiLayers = overlayTrack.clips.map((clip: any) => ({
        id: clip.id,
        type: clip.type || 'emoji',
        content: clip.content,
        start: clip.start || 0,
        end: clip.end || data.duration,
        position: clip.position || { x: 50, y: 50 },
        scale: clip.scale || 1,
        rotation: clip.rotation || 0,
      }));
    }

    const textTrack = tracks.find((t: any) => t.type === 'text');
    if (textTrack?.clips) {
      data.textLayers = textTrack.clips.map((clip: any) => ({
        id: clip.id,
        type: 'text',
        content: clip.content,
        start: clip.start || 0,
        end: clip.end || data.duration,
        position: clip.position || { x: 50, y: 50 },
        scale: clip.scale || 1,
        rotation: clip.rotation || 0,
        style: clip.style || {
          fontFamily: 'Inter',
          fontSize: 32,
          color: '#ffffff',
          fontWeight: 'bold',
          fontStyle: 'normal',
          textAlign: 'center',
        },
        animation: clip.animation,
      }));
    }

    const imageTrack = tracks.find((t: any) => t.type === 'image');
    if (imageTrack?.clips) {
      data.imageLayers = imageTrack.clips.map((clip: any) => ({
        id: clip.id,
        type: 'image',
        src: clip.src,
        fileName: clip.fileName,
        start: clip.start || 0,
        end: clip.end || data.duration,
        position: clip.position || { x: 50, y: 50 },
        scale: clip.scale || 1,
        rotation: clip.rotation || 0,
      }));
    }

    if (proj.project_json.transcripts?.[0]) {
      data.transcript = proj.project_json.transcripts[0];
    }

    if (settings?.duration) {
      data.duration = settings.duration;
      data.clipEnd = settings.duration;
    }
    if (settings?.clipStart !== undefined) {
      data.clipStart = settings.clipStart;
    }
    if (settings?.clipEnd !== undefined) {
      data.clipEnd = settings.clipEnd;
    }

    return data;
  }, []);

  return {
    project,
    isLoading,
    error,
    saveProject,
    updateProjectData,
    createNewProject,
    parseProjectData,
  };
};
