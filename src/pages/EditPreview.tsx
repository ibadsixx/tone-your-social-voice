import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { VideoEditingPreview } from '@/components/video-preview/VideoEditingPreview';
import { VideoUploadData, VideoEdits } from '@/types/videoEditing';
import { useAuth } from '@/hooks/useAuth';
import { gateway } from '@/lib/gateway';
import { Loader2 } from 'lucide-react';

export default function EditPreview() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [uploadData, setUploadData] = useState<VideoUploadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('[EditPreview] 📦 Loading upload data...');
    
    // Load from sessionStorage - now contains permanentUrl
    const storedData = sessionStorage.getItem('editor_video_upload');
    console.log('[EditPreview] 📥 sessionStorage data exists:', !!storedData);
    
    if (storedData) {
      try {
        const parsed = JSON.parse(storedData);
        console.log('[EditPreview] ✅ LOADED FROM sessionStorage');
        console.log('[EditPreview] - File name:', parsed.file?.name);
        console.log('[EditPreview] - Content type:', parsed.contentType);
        console.log('[EditPreview] - Duration:', parsed.metadata?.duration);
        console.log('[EditPreview] - Has permanentUrl:', !!parsed.permanentUrl);
        
        // Convert to VideoUploadData format, using permanentUrl as the video source
        const uploadData: VideoUploadData = {
          dataUrl: parsed.permanentUrl || parsed.dataUrl, // Use permanent URL or fallback
          file: parsed.file,
          metadata: parsed.metadata,
          contentType: parsed.contentType,
        };
        
        setUploadData(uploadData);
        setLoading(false);
        return;
      } catch (e) {
        console.error('[EditPreview] ❌ Failed to parse sessionStorage data:', e);
      }
    }

    // No data found - redirect back
    console.error('[EditPreview] ❌ No upload data found in sessionStorage');
    setError('No video data found. Please try uploading again.');
    setLoading(false);
  }, [searchParams]);

  const handlePublish = async (edits: VideoEdits) => {
    if (!uploadData || !user) {
      throw new Error('Missing data');
    }

    console.log('[EditPreview] 📤 Publishing with edits:', {
      layersCount: edits.layers.length,
      hasMusic: !!edits.music,
      filter: edits.filter,
      videoVolume: edits.videoVolume,
    });

    // Use the permanent URL that was already uploaded
    const publicUrl = uploadData.dataUrl;
    
    if (!publicUrl || publicUrl.startsWith('blob:') || publicUrl.startsWith('data:')) {
      throw new Error('Invalid video URL - expected permanent URL');
    }

    console.log('[EditPreview] ✅ Using permanent URL:', publicUrl);

    // Create the post
    const postType = uploadData.contentType === 'story' ? 'normal_post' : 'reel';
    
    const postData: {
      user_id: string;
      type: 'normal_post' | 'reel';
      media_url: string;
      media_type: string;
      duration: number;
      aspect_ratio: string;
      music_url: string | null;
      music_title: string | null;
      music_artist: string | null;
      music_start: number | null;
      status: string;
    } = {
      user_id: user.id,
      type: postType,
      media_url: publicUrl,
      media_type: 'video',
      duration: uploadData.metadata.duration,
      aspect_ratio: uploadData.metadata.aspectRatio,
      music_url: edits.music?.url || null,
      music_title: edits.music?.title || null,
      music_artist: edits.music?.artist || null,
      music_start: edits.music?.startTime || null,
      status: 'published',
    };

    const { error: postError } = await gateway.from('posts').insert([postData]);

    if (postError) {
      console.error('[EditPreview] ❌ Post creation error:', postError);
      throw postError;
    }

    console.log('[EditPreview] ✅ Post created successfully');
    
    // Clear sessionStorage
    sessionStorage.removeItem('editor_video_upload');
    
    // Navigate to home
    navigate('/');
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading video...</p>
        </div>
      </div>
    );
  }

  if (error || !uploadData) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md p-8">
          <p className="text-destructive mb-4">{error || 'Failed to load video'}</p>
          <button
            onClick={() => navigate(-1)}
            className="text-primary hover:underline"
          >
            Go back and try again
          </button>
        </div>
      </div>
    );
  }

  return <VideoEditingPreview uploadData={uploadData} onPublish={handlePublish} />;
}
