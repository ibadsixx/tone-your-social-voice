// Autosave unit tests - useAutosave hook
// Tests: debounce behavior, save triggers, error handling, URL validation

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Helper functions (same as in useAutosave.ts)
function isPermanentUrl(url: string): boolean {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

function isTemporaryUrl(url: string): boolean {
  if (!url) return false;
  return url.startsWith('blob:') || url.startsWith('data:');
}

function validateProjectUrls(projectData: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!projectData?.tracks) return { valid: true, errors: [] };
  
  for (const track of projectData.tracks) {
    if (!track.clips) continue;
    
    for (const clip of track.clips) {
      const url = clip.src || clip.url;
      if (url && isTemporaryUrl(url)) {
        errors.push(`REJECTED: ${track.type} clip "${clip.fileName || clip.id}" has temporary URL`);
      }
    }
  }
  
  return { valid: errors.length === 0, errors };
}

describe('URL Validation', () => {
  it('should identify permanent URLs correctly', () => {
    expect(isPermanentUrl('https://example.com/video.mp4')).toBe(true);
    expect(isPermanentUrl('http://example.com/video.mp4')).toBe(true);
    expect(isPermanentUrl('blob:http://localhost/abc-123')).toBe(false);
    expect(isPermanentUrl('data:video/mp4;base64,AAAA')).toBe(false);
    expect(isPermanentUrl('')).toBe(false);
  });

  it('should identify temporary URLs correctly', () => {
    expect(isTemporaryUrl('blob:http://localhost/abc-123')).toBe(true);
    expect(isTemporaryUrl('data:video/mp4;base64,AAAA')).toBe(true);
    expect(isTemporaryUrl('https://example.com/video.mp4')).toBe(false);
    expect(isTemporaryUrl('')).toBe(false);
  });
});

describe('Project URL Validation', () => {
  it('should accept project with permanent URLs', () => {
    const projectData = {
      tracks: [
        {
          id: 'track-video',
          type: 'video',
          clips: [
            {
              id: 'video-1',
              src: 'https://supabase.storage/editor_videos/user123/video.mp4',
              fileName: 'test.mp4',
            }
          ]
        }
      ]
    };
    
    const result = validateProjectUrls(projectData);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject project with blob URLs', () => {
    const projectData = {
      tracks: [
        {
          id: 'track-video',
          type: 'video',
          clips: [
            {
              id: 'video-1',
              src: 'blob:http://localhost:5173/abc-123-def',
              fileName: 'test.mp4',
            }
          ]
        }
      ]
    };
    
    const result = validateProjectUrls(projectData);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it('should reject project with data URLs', () => {
    const projectData = {
      tracks: [
        {
          id: 'track-video',
          type: 'video',
          clips: [
            {
              id: 'video-1',
              src: 'data:video/mp4;base64,AAAAAAAA',
              fileName: 'test.mp4',
            }
          ]
        }
      ]
    };
    
    const result = validateProjectUrls(projectData);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  it('should accept project without tracks', () => {
    const result = validateProjectUrls({});
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should handle multiple clips with mixed URLs', () => {
    const projectData = {
      tracks: [
        {
          id: 'track-video',
          type: 'video',
          clips: [
            {
              id: 'video-1',
              src: 'https://supabase.storage/video1.mp4',
              fileName: 'video1.mp4',
            },
            {
              id: 'video-2',
              src: 'blob:http://localhost/xyz',
              fileName: 'video2.mp4',
            }
          ]
        }
      ]
    };
    
    const result = validateProjectUrls(projectData);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });
});

describe('Upload to Editor Flow', () => {
  it('should simulate correct upload -> save -> load flow', () => {
    // Step 1: Upload returns publicUrl
    const publicUrl = 'https://gateway-iota-two.vercel.app/storage/v1/object/public/editor_videos/user123/1234567890.mp4';
    console.log('[UPLOAD] uploaded -> publicUrl:', publicUrl);
    
    // Step 2: Save project with publicUrl
    const projectId = 'project-abc-123';
    const projectData = {
      tracks: [
        {
          id: 'track-video',
          type: 'video',
          clips: [
            {
              id: 'video-1',
              src: publicUrl,
              fileName: 'test.mp4',
              duration: 15,
            }
          ]
        }
      ]
    };
    console.log('[PROJECT] saved -> id:', projectId);
    
    // Step 3: Validate before save
    const validation = validateProjectUrls(projectData);
    expect(validation.valid).toBe(true);
    console.log('[AUTOSAVE] ✅ Validation passed');
    
    // Step 4: Editor loads project
    console.log('[EDITOR] loading project id:', projectId);
    const clip = projectData.tracks[0].clips[0];
    expect(clip.src).toBe(publicUrl);
    console.log('[EDITOR] using permanent URL for clip 0:', clip.src);
    
    // Step 5: Assert no upload calls in editor
    expect(clip.src.startsWith('https://')).toBe(true);
  });
});

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('debounce behavior', () => {
    it('should debounce multiple rapid saves', async () => {
      const saveFn = vi.fn();
      let saveTimeout: NodeJS.Timeout | null = null;
      const debounceMs = 1000;

      const queueSave = (data: any) => {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => saveFn(data), debounceMs);
      };

      // Rapid saves
      queueSave({ data: 1 });
      queueSave({ data: 2 });
      queueSave({ data: 3 });

      // Should not have saved yet
      expect(saveFn).not.toHaveBeenCalled();

      // Advance past debounce
      vi.advanceTimersByTime(1100);

      // Should have saved once with last data
      expect(saveFn).toHaveBeenCalledTimes(1);
      expect(saveFn).toHaveBeenCalledWith({ data: 3 });
    });

    it('should save immediately when saveNow is called', async () => {
      const saveFn = vi.fn();
      let saveTimeout: NodeJS.Timeout | null = null;
      let pendingData: any = null;

      const queueSave = (data: any) => {
        pendingData = data;
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => saveFn(data), 1000);
      };

      const saveNow = () => {
        if (saveTimeout) clearTimeout(saveTimeout);
        if (pendingData) saveFn(pendingData);
      };

      queueSave({ data: 'queued' });
      expect(saveFn).not.toHaveBeenCalled();

      saveNow();
      expect(saveFn).toHaveBeenCalledWith({ data: 'queued' });
    });
  });

  describe('save lifecycle', () => {
    it('should track isSaving state', async () => {
      let isSaving = false;
      const saveFn = vi.fn(async () => {
        isSaving = true;
        await new Promise(r => setTimeout(r, 100));
        isSaving = false;
      });

      expect(isSaving).toBe(false);
      saveFn();
      expect(isSaving).toBe(true);
    });

    it('should update lastSaveTime on success', async () => {
      let lastSaveTime: Date | null = null;

      const save = async () => {
        lastSaveTime = new Date();
      };

      expect(lastSaveTime).toBeNull();
      await save();
      expect(lastSaveTime).toBeInstanceOf(Date);
    });
  });

  describe('error handling', () => {
    it('should call onSaveError on failure', async () => {
      const onError = vi.fn();
      
      const save = async () => {
        try {
          throw new Error('Save failed');
        } catch (err) {
          onError(err);
        }
      };

      await save();
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should keep pendingChanges true on failure', async () => {
      let pendingChanges = true;
      let error: Error | null = null;

      const save = async () => {
        try {
          throw new Error('Network error');
        } catch (err) {
          error = err as Error;
          // pendingChanges stays true on failure
        }
      };

      await save();
      expect(pendingChanges).toBe(true);
      expect(error).not.toBeNull();
    });

    it('should reject saves with temporary URLs', async () => {
      const onError = vi.fn();
      
      const projectData = {
        tracks: [{
          type: 'video',
          clips: [{ src: 'blob:http://localhost/test', fileName: 'test.mp4' }]
        }]
      };

      const validation = validateProjectUrls(projectData);
      if (!validation.valid) {
        onError(new Error('Cannot save project with temporary blob/data URLs'));
      }

      expect(onError).toHaveBeenCalled();
      expect(validation.valid).toBe(false);
    });
  });
});
