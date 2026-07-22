// useAutosave - Debounced autosave hook for editor projects
// Persists project state to database with configurable delay
// Enhanced with comprehensive logging, URL validation, and audio volume persistence

import { useCallback, useRef, useEffect, useState } from 'react';
import { gateway } from '@/lib/gateway';

interface AutosaveOptions {
  debounceMs?: number;
  onSaveStart?: () => void;
  onSaveSuccess?: (timestamp: Date) => void;
  onSaveError?: (error: Error) => void;
}

interface AutosaveState {
  isSaving: boolean;
  lastSaveTime: Date | null;
  error: Error | null;
  pendingChanges: boolean;
  saveCount: number;
}

export function isPermanentUrl(url: string): boolean {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

export function isTemporaryUrl(url: string): boolean {
  if (!url) return false;
  return url.startsWith('blob:') || url.startsWith('data:');
}

export function validateProjectUrls(projectData: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!projectData?.tracks) return { valid: true, errors: [] };
  
  for (const track of projectData.tracks) {
    if (!track.clips) continue;
    
    for (const clip of track.clips) {
      const url = clip.src || clip.url;
      if (url && isTemporaryUrl(url)) {
        errors.push(`[AUTOSAVE] ⚠️ REJECTED: ${track.type} clip "${clip.fileName || clip.id}" has temporary URL (${url.slice(0, 30)}...)`);
      }
    }
  }
  
  return { valid: errors.length === 0, errors };
}

export function useAutosave(
  projectId: string | undefined,
  options: AutosaveOptions = {}
) {
  const { 
    debounceMs = 1000, 
    onSaveStart, 
    onSaveSuccess, 
    onSaveError 
  } = options;

  const [state, setState] = useState<AutosaveState>({
    isSaving: false,
    lastSaveTime: null,
    error: null,
    pendingChanges: false,
    saveCount: 0,
  });

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingDataRef = useRef<any>(null);
  const saveStartTimeRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const persistToDatabase = useCallback(async (projectData: any) => {
    if (!projectId) {
      console.warn('[AUTOSAVE] ⚠️ No project ID, skipping save');
      return;
    }

    const validation = validateProjectUrls(projectData);
    if (!validation.valid) {
      console.error('[AUTOSAVE] ========================================');
      console.error('[AUTOSAVE] ❌ SAVE BLOCKED - TEMPORARY URLs DETECTED');
      validation.errors.forEach(err => console.error(err));
      console.error('[AUTOSAVE] ========================================');
      const error = new Error('Cannot save project with temporary blob/data URLs. Please re-upload media.');
      setState(prev => ({ ...prev, error }));
      onSaveError?.(error);
      return;
    }

    saveStartTimeRef.current = performance.now();
    
    console.log('[AUTOSAVE] ========================================');
    console.log('[AUTOSAVE] 📤 SAVING PROJECT TO DATABASE...');
    console.log('[AUTOSAVE] Project ID:', projectId);
    console.log('[AUTOSAVE] Timestamp:', new Date().toISOString());
    
    // Log tracks
    if (projectData?.tracks) {
      for (const track of projectData.tracks) {
        if (track.clips) {
          console.log(`[AUTOSAVE] Track: ${track.type}, clips: ${track.clips.length}`);
          for (const clip of track.clips) {
            const url = clip.src || clip.url;
            if (url) {
              console.log(`[AUTOSAVE] ✅ ${track.type} clip: ${clip.fileName || clip.id} -> ${url.slice(0, 80)}...`);
            }
          }
        }
      }
    }

    // Log audio volumes - CRITICAL for persistence verification
    if (projectData?.audio) {
      console.log('[AUTOSAVE] [AUDIO] audio volumes saved', {
        videoVolume: projectData.audio.videoVolume,
        trackCount: Object.keys(projectData.audio.tracks || {}).length,
        tracks: projectData.audio.tracks,
      });
    }
    
    // Log settings including legacy volume
    if (projectData?.settings?.videoVolume !== undefined) {
      console.log('[AUTOSAVE] [AUDIO] settings.videoVolume:', projectData.settings.videoVolume);
    }
    
    console.log('[AUTOSAVE] ========================================');
    
    onSaveStart?.();
    setState(prev => ({ ...prev, isSaving: true, error: null }));

    try {
      const { data, error } = await gateway
        .from('editor_projects')
        .update({
          project_json: projectData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
        .select();

      if (error) throw error;

      const saveTime = new Date();
      const duration = performance.now() - saveStartTimeRef.current;
      
      console.log('[AUTOSAVE] ========================================');
      console.log('[AUTOSAVE] ✅ SAVE SUCCESSFUL');
      console.log('[AUTOSAVE] Save time:', saveTime.toISOString());
      console.log('[AUTOSAVE] Duration:', duration.toFixed(2), 'ms');
      console.log('[AUTOSAVE] ========================================');
      
      setState(prev => ({ 
        ...prev, 
        isSaving: false, 
        lastSaveTime: saveTime,
        pendingChanges: false,
        saveCount: prev.saveCount + 1,
      }));
      
      onSaveSuccess?.(saveTime);
    } catch (err) {
      const duration = performance.now() - saveStartTimeRef.current;
      console.error('[AUTOSAVE] ========================================');
      console.error('[AUTOSAVE] ❌ SAVE FAILED');
      console.error('[AUTOSAVE] Duration:', duration.toFixed(2), 'ms');
      console.error('[AUTOSAVE] Error:', err);
      console.error('[AUTOSAVE] ========================================');
      
      const error = err as Error;
      
      setState(prev => ({ 
        ...prev, 
        isSaving: false, 
        error,
        pendingChanges: true,
      }));
      
      onSaveError?.(error);
    }
  }, [projectId, onSaveStart, onSaveSuccess, onSaveError]);

  const queueSave = useCallback((projectData: any) => {
    pendingDataRef.current = projectData;
    setState(prev => ({ ...prev, pendingChanges: true }));

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    console.log('[AUTOSAVE] 📝 Change detected, queuing save (debounce:', debounceMs, 'ms)');

    saveTimeoutRef.current = setTimeout(() => {
      if (pendingDataRef.current) {
        console.log('[AUTOSAVE] ⏰ Debounce complete, executing save...');
        persistToDatabase(pendingDataRef.current);
      }
    }, debounceMs);
  }, [debounceMs, persistToDatabase]);

  const saveNow = useCallback(async (projectData?: any) => {
    console.log('[AUTOSAVE] 💾 Manual save triggered');
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    const dataToSave = projectData || pendingDataRef.current;
    if (dataToSave) {
      await persistToDatabase(dataToSave);
    }
  }, [persistToDatabase]);

  const clearPending = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    pendingDataRef.current = null;
    setState(prev => ({ ...prev, pendingChanges: false }));
  }, []);

  return {
    queueSave,
    saveNow,
    clearPending,
    isSaving: state.isSaving,
    lastSaveTime: state.lastSaveTime,
    error: state.error,
    pendingChanges: state.pendingChanges,
    saveCount: state.saveCount,
  };
}
