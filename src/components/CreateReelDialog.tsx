import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Upload, Loader2, AlertCircle } from 'lucide-react';
import { validateReelMedia } from '@/utils/reelValidation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';
import { uploadVideo, getVideoMetadata } from '@/lib/storage';
import { toast } from '@/hooks/use-toast';

interface CreateReelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const CreateReelDialog = ({ open, onOpenChange, onSuccess }: CreateReelDialogProps) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [validationError, setValidationError] = useState<string>('');
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) {
      console.log('[CreateReelDialog] ❌ No file selected');
      return;
    }

    console.log('[CreateReelDialog] 📁 FILE DETAILS:', {
      name: selectedFile.name,
      size: selectedFile.size,
      type: selectedFile.type,
    });

    if (selectedFile.size === 0) {
      setValidationError('Selected file is empty');
      return;
    }

    if (!user?.id) {
      console.error('[CreateReelDialog] ❌ User not authenticated');
      setValidationError('Please log in to create a reel');
      return;
    }

    setValidationError('');
    setUploading(true);
    setUploadProgress('Validating video...');

    try {
      // Validate media
      const validation = await validateReelMedia(selectedFile);
      if (!validation.valid) {
        setValidationError(validation.error || 'Invalid video');
        return;
      }

      setUploadProgress('Uploading to storage...');

      // Use shared upload utility
      const { publicUrl } = await uploadVideo(selectedFile, user.id);
      
      console.log('[CreateReelDialog] ✅ UPLOAD COMPLETE:', publicUrl);

      // Get video metadata from the uploaded URL
      setUploadProgress('Loading metadata...');
      const metadata = await getVideoMetadata(publicUrl);

      // Create editor project in database
      setUploadProgress('Creating project...');
      
      const projectJson = {
        tracks: [
          {
            id: 'track-video',
            type: 'video',
            clips: [
              {
                id: `video-${Date.now()}`,
                type: 'video',
                src: publicUrl,
                fileName: selectedFile.name,
                start: 0,
                end: metadata.duration,
                duration: metadata.duration,
                volume: 1,
              }
            ]
          }
        ],
        settings: {
          duration: metadata.duration,
          fps: 30,
          resolution: { width: 1080, height: 1920 },
          contentType: 'reel',
        }
      };
      
      const { data: projectData, error: projectError } = await gateway
        .from('editor_projects')
        .insert({
          owner_id: user.id,
          title: selectedFile.name.replace(/\.[^/.]+$/, ''),
          project_json: projectJson,
          status: 'draft',
        })
        .select()
        .single();

      if (projectError) {
        console.error('[CreateReelDialog] ❌ Project creation failed:', projectError);
        throw new Error('Failed to create project');
      }

      console.log('[PROJECT] ========================================');
      console.log('[PROJECT] saved -> id:', projectData.id);
      console.log('[PROJECT] video URL:', publicUrl);
      console.log('[PROJECT] ========================================');
      
      toast({
        title: 'Video uploaded',
        description: 'Opening editor...',
      });

      onOpenChange(false);
      
      // Navigate with projectId
      navigate(`/editor?projectId=${projectData.id}`);
      
    } catch (error) {
      console.error('[CreateReelDialog] ❌ Failed:', error);
      setValidationError(error instanceof Error ? error.message : 'Failed to process video');
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  const handleClose = () => {
    setValidationError('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Reel</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {validationError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{validationError}</AlertDescription>
            </Alert>
          )}

          <label className="flex flex-col items-center justify-center w-full h-96 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              {uploading ? (
                <>
                  <Loader2 className="w-10 h-10 mb-3 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">{uploadProgress || 'Processing...'}</p>
                </>
              ) : (
                <>
                  <Upload className="w-10 h-10 mb-3 text-muted-foreground" />
                  <p className="mb-2 text-sm text-muted-foreground">
                    <span className="font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground">Vertical video (9:16)</p>
                  <p className="text-xs text-muted-foreground">3-60 seconds, MAX 100MB</p>
                  <p className="text-xs text-primary mt-2">Add filters, stickers & music</p>
                </>
              )}
            </div>
            <input
              type="file"
              className="hidden"
              accept="video/*"
              onChange={handleFileSelect}
              disabled={uploading}
            />
          </label>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateReelDialog;
