/**
 * Validates media file for Reel requirements
 * - Must be vertical (9:16 aspect ratio)
 * - Minimum duration 3 seconds (no maximum duration)
 * - Supports both video and image
 */

export interface MediaMetadata {
  duration: number;
  width: number;
  height: number;
  aspectRatio: string;
  isValid: boolean;
  mediaType: 'video' | 'image';
  error?: string;
}

export const getVideoMetadata = (file: File): Promise<MediaMetadata> => {
  return new Promise((resolve) => {
    console.log('[Reel Validation] Reading video metadata:', {
      name: file.name,
      type: file.type,
      size: file.size
    });
    
    const video = document.createElement('video');
    
    // Check browser support - but don't reject immediately
    // canPlayType often returns "" for valid formats, so we try loading anyway
    const canPlay = video.canPlayType(file.type);
    console.log('[Reel Validation] Browser canPlayType:', { type: file.type, canPlay });
    
    // Known supported formats - try to load these even if canPlayType is uncertain
    const knownFormats = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-m4v'];
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    const knownExtensions = ['mp4', 'webm', 'ogg', 'mov', 'm4v', 'mkv', 'avi'];
    
    const isKnownFormat = knownFormats.includes(file.type) || knownExtensions.includes(fileExtension || '');
    
    // Only reject if canPlayType explicitly says no AND it's not a known format
    if (canPlay === '' && !isKnownFormat && file.type) {
      console.warn('[Reel Validation] Unknown video format, will try to load anyway:', file.type);
    }
    
    video.preload = 'metadata';
    
    // Add timeout to prevent hanging
    const timeout = setTimeout(() => {
      console.error('[Reel Validation] Video metadata loading timeout');
      URL.revokeObjectURL(video.src);
      resolve({
        duration: 0,
        width: 0,
        height: 0,
        aspectRatio: '0:0',
        mediaType: 'video',
        isValid: false,
        error: 'Video loading timeout. File may be too large or corrupted.'
      });
    }, 10000); // 10 second timeout
    
  video.onloadedmetadata = () => {
    clearTimeout(timeout);
    URL.revokeObjectURL(video.src);
    
    console.log('[Reel Validation] Video metadata loaded:', {
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight
    });
      
      const duration = Math.round(video.duration);
      const width = video.videoWidth;
      const height = video.videoHeight;
      const calculatedRatio = width / height;
      
      // 9:16 = 0.5625, allow 10% tolerance (0.506 - 0.619)
      const targetRatio = 9 / 16;
      const tolerance = 0.1;
      const minRatio = targetRatio * (1 - tolerance);
      const maxRatio = targetRatio * (1 + tolerance);
      const isVertical = calculatedRatio >= minRatio && calculatedRatio <= maxRatio;
      
      let error: string | undefined;
      let isValid = true;
      
      if (!isVertical) {
        error = 'Only vertical 9:16 media is allowed for reels.';
        isValid = false;
      } else if (duration < 3) {
        error = 'Reels must be at least 3 seconds long.';
        isValid = false;
      }
      
      resolve({
        duration,
        width,
        height,
        aspectRatio: '9:16',
        mediaType: 'video',
        isValid,
        error
      });
    };
    
  video.onerror = (e) => {
    clearTimeout(timeout);
    console.error('[Reel Validation] Video error:', e);
    console.error('[Reel Validation] Video error details:', {
      error: video.error,
      networkState: video.networkState,
      readyState: video.readyState,
      fileType: file.type,
      fileSize: file.size
    });
    URL.revokeObjectURL(video.src);
    
    let errorMessage = 'Failed to read video. ';
    if (video.error) {
      switch (video.error.code) {
        case 1: // MEDIA_ERR_ABORTED
          errorMessage = 'Video loading was cancelled. Please try again.';
          break;
        case 2: // MEDIA_ERR_NETWORK
          errorMessage = 'Network error. Please check your connection and try again.';
          break;
        case 3: // MEDIA_ERR_DECODE
          errorMessage = 'Cannot decode video. Try converting to MP4 (H.264) format.';
          break;
        case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
          errorMessage = 'Video codec not supported. Please convert to MP4 with H.264 codec.';
          break;
      }
    }
    
    resolve({
      duration: 0,
      width: 0,
      height: 0,
      aspectRatio: '0:0',
      mediaType: 'video',
      isValid: false,
      error: errorMessage
    });
  };
    
    try {
      video.src = URL.createObjectURL(file);
      console.log('[Reel Validation] Created object URL:', video.src);
    } catch (error) {
      console.error('[Reel Validation] Failed to create object URL:', error);
      clearTimeout(timeout);
      resolve({
        duration: 0,
        width: 0,
        height: 0,
        aspectRatio: '0:0',
        mediaType: 'video',
        isValid: false,
        error: 'Failed to load video file. Please try a different file.'
      });
    }
  });
};

export const getImageMetadata = (file: File): Promise<MediaMetadata> => {
  return new Promise((resolve) => {
    const img = new Image();
    
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      
      const width = img.width;
      const height = img.height;
      const calculatedRatio = width / height;
      
      // 9:16 = 0.5625, allow 10% tolerance (0.506 - 0.619)
      const targetRatio = 9 / 16;
      const tolerance = 0.1;
      const minRatio = targetRatio * (1 - tolerance);
      const maxRatio = targetRatio * (1 + tolerance);
      const isVertical = calculatedRatio >= minRatio && calculatedRatio <= maxRatio;
      
      let error: string | undefined;
      let isValid = true;
      
      if (!isVertical) {
        error = 'Only vertical 9:16 media is allowed for reels.';
        isValid = false;
      }
      
      resolve({
        duration: 0, // Will be set by user
        width,
        height,
        aspectRatio: '9:16',
        mediaType: 'image',
        isValid,
        error
      });
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      resolve({
        duration: 0,
        width: 0,
        height: 0,
        aspectRatio: '0:0',
        mediaType: 'image',
        isValid: false,
        error: 'Failed to read image metadata.'
      });
    };
    
    img.src = URL.createObjectURL(file);
  });
};

export const validateReelMedia = async (file: File): Promise<{ valid: boolean; error?: string; metadata?: MediaMetadata }> => {
  console.log('[Reel Validation] Starting validation:', {
    name: file.name,
    type: file.type,
    size: file.size
  });
  
  const isVideo = file.type.startsWith('video/');
  const isImage = file.type.startsWith('image/');
  
  if (!isVideo && !isImage) {
    console.error('[Reel Validation] Invalid file type:', file.type);
    return { valid: false, error: 'Please select a video or image file.' };
  }
  
  // Check file size (100MB max)
  if (file.size > 100 * 1024 * 1024) {
    console.error('[Reel Validation] File too large:', file.size);
    return { valid: false, error: 'File size must be less than 100MB.' };
  }
  
  // For videos, check if it's a supported format
  if (isVideo) {
    const supportedFormats = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
    if (!supportedFormats.includes(file.type)) {
      console.warn('[Reel Validation] Potentially unsupported video format:', file.type);
    }
  }
  
  const metadata = isVideo 
    ? await getVideoMetadata(file)
    : await getImageMetadata(file);
  
  console.log('[Reel Validation] Metadata result:', metadata);
  
  if (!metadata.isValid) {
    return { valid: false, error: metadata.error, metadata };
  }
  
  return { valid: true, metadata };
};
