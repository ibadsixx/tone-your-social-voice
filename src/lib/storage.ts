// Shared Storage Utility for Video Uploads
// Use ONLY this utility for all video uploads - never upload inside Editor.tsx

import { gateway } from '@/lib/gateway';

interface UploadResult {
  path: string;
  publicUrl: string;
}

interface UploadOptions {
  bucket?: string;
  folder?: string;
}

/**
 * Upload a video file to Supabase storage
 * @param file - The file to upload
 * @param userId - The authenticated user's ID
 * @param options - Optional bucket and folder settings
 * @returns The storage path and public URL
 */
export async function uploadVideo(
  file: File,
  userId: string,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const { bucket = 'editor_videos', folder = '' } = options;

  // Validation
  if (!file) {
    throw new Error('No file provided');
  }

  if (file.size === 0) {
    throw new Error('File is empty');
  }

  if (!userId) {
    throw new Error('User ID is required');
  }

  // Validate user is authenticated
  const { data: { user }, error: authError } = await gateway.auth.getUser();
  if (authError || !user) {
    console.error('[storage] ❌ Auth check failed:', authError);
    throw new Error('User not authenticated');
  }

  if (user.id !== userId) {
    console.error('[storage] ❌ User ID mismatch');
    throw new Error('User ID mismatch');
  }

  // Generate safe unique filename
  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'mp4';
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  const safeFileName = `${timestamp}-${random}.${fileExt}`;
  
  // Build path
  const pathParts = [userId];
  if (folder) pathParts.push(folder);
  pathParts.push(safeFileName);
  const filePath = pathParts.join('/');

  console.log('[storage] 📤 UPLOAD START:', {
    bucket,
    path: filePath,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    userId,
  });

  // Perform upload
  const { data: uploadData, error: uploadError } = await gateway.storage
    .from(bucket)
    .upload(filePath, file, {
      contentType: file.type || 'video/mp4',
      upsert: false,
      cacheControl: '3600',
    });

  if (uploadError) {
    console.error('[storage] ❌ UPLOAD ERROR:', {
      message: uploadError.message,
      name: uploadError.name,
      details: uploadError,
    });
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  console.log('[storage] ✅ UPLOAD SUCCESS:', uploadData);

  // Get public URL (Cloudinary delivery URL when the gateway returns one)
  const { data: urlData } = gateway.storage
    .from(bucket)
    .getPublicUrl(filePath);

  const publicUrl = uploadData?.url || urlData.publicUrl;

  console.log('[UPLOAD] ========================================');
  console.log('[UPLOAD] uploaded -> publicUrl:', publicUrl);
  console.log('[UPLOAD] ========================================');

  return {
    path: filePath,
    publicUrl,
  };
}

/**
 * Validate that a URL is accessible (HEAD check)
 * @param url - The URL to check
 * @returns Whether the URL is accessible
 */
export async function validateVideoUrl(url: string): Promise<{ valid: boolean; status?: number; error?: string }> {
  try {
    console.log('[storage] 🔍 HEAD check:', url);
    
    const response = await fetch(url, {
      method: 'HEAD',
      mode: 'cors',
    });

    if (!response.ok) {
      console.warn('[storage] ⚠️ HEAD check failed:', response.status, response.statusText);
      return { valid: false, status: response.status, error: response.statusText };
    }

    console.log('[storage] ✅ HEAD check passed:', response.status);
    return { valid: true, status: response.status };
  } catch (error) {
    console.error('[storage] ❌ HEAD check error:', error);
    return { valid: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get video metadata (duration, dimensions)
 */
export function getVideoMetadata(url: string): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';
    video.src = url;

    video.onloadedmetadata = () => {
      const metadata = {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      };
      console.log('[storage] 📊 Video metadata:', metadata);
      resolve(metadata);
    };

    video.onerror = () => {
      console.error('[storage] ❌ Failed to load video metadata');
      reject(new Error('Failed to load video metadata'));
    };

    // Timeout after 10 seconds
    setTimeout(() => {
      reject(new Error('Video metadata load timeout'));
    }, 10000);
  });
}
