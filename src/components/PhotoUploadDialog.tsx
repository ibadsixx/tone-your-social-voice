import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Camera, Upload } from 'lucide-react';

interface PhotoUploadDialogProps {
  type: 'profile' | 'cover';
  onUpload: (file: File, postText?: string) => Promise<void>;
  isUploading: boolean;
  children: React.ReactNode;
}

const PhotoUploadDialog = ({ type, onUpload, isUploading, children }: PhotoUploadDialogProps) => {
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [postText, setPostText] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      await onUpload(selectedFile, postText);
      setOpen(false);
      setSelectedFile(null);
      setPostText('');
      setPreviewUrl(null);
    } catch (error) {
      // Error is handled in the parent component
    }
  };

  const handleClose = () => {
    setOpen(false);
    setSelectedFile(null);
    setPostText('');
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Upload {type === 'profile' ? 'Profile Picture' : 'Cover Photo'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* File Selection */}
          {!selectedFile ? (
            <div className="border-2 border-dashed border-muted rounded-lg p-6 text-center">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
                id={`${type}-file-input`}
              />
              <label htmlFor={`${type}-file-input`} className="cursor-pointer">
                <div className="flex flex-col items-center gap-2">
                  <Camera className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Click to select an image
                  </span>
                </div>
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Image Preview */}
              <div className="relative">
                <img
                  src={previewUrl!}
                  alt="Preview"
                  className={`w-full rounded-lg object-cover ${
                    type === 'profile' ? 'aspect-square max-h-64' : 'aspect-[3/1] max-h-48'
                  }`}
                 loading="lazy" decoding="async" />
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setSelectedFile(null);
                    setPreviewUrl(null);
                  }}
                  className="absolute top-2 right-2"
                >
                  ×
                </Button>
              </div>

              {/* Optional Post Text */}
              <div className="space-y-2">
                <Label htmlFor="post-text">
                  Add a caption (optional)
                </Label>
                <Textarea
                  id="post-text"
                  placeholder={`Share something about your new ${type === 'profile' ? 'profile picture' : 'cover photo'}...`}
                  value={postText}
                  onChange={(e) => setPostText(e.target.value)}
                  className="min-h-[80px]"
                />
              </div>

              {/* Upload Button */}
              <Button 
                onClick={handleUpload} 
                disabled={isUploading}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                {isUploading ? 'Uploading...' : 'Upload & Post'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PhotoUploadDialog;