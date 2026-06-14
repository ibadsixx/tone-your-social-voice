import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Upload, Loader2 } from 'lucide-react';
import { useStories } from '@/hooks/useStories';

interface CreateStoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CreateStoryDialog = ({ open, onOpenChange }: CreateStoryDialogProps) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const { createStory } = useStories();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith('image/') && !selectedFile.type.startsWith('video/')) {
      alert('Please select an image or video file');
      return;
    }

    if (selectedFile.size > 50 * 1024 * 1024) {
      alert('File size must be less than 50MB');
      return;
    }

    setUploading(true);
    setUploadProgress('Uploading...');

    try {
      const result = await createStory(selectedFile);

      if (result) {
        onOpenChange(false);
      }
    } catch (error) {
      console.error('[CreateStoryDialog] ❌ Failed:', error);
      alert(error instanceof Error ? error.message : 'Failed to create story');
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  const handleClose = () => {
    if (uploading) return;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Story</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-accent/50 transition-colors">
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
                  <p className="text-xs text-muted-foreground">Image or Video (MAX. 50MB)</p>
                </>
              )}
            </div>
            <input
              type="file"
              className="hidden"
              accept="image/*,video/*"
              onChange={handleFileSelect}
              disabled={uploading}
            />
          </label>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateStoryDialog;
