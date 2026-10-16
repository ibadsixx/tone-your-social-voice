import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Camera } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { gateway } from '@/lib/gateway';

// The Page counterpart of the personal `CoverPhotoEditor`. It renders the same
// cover band (the shared ProfileHeader owns the surrounding template) but writes
// the chosen image to the `pages` row instead of the viewer's `profiles` row.
// Keeping this in its own component is what lets ProfileHeader stay a single
// shared template for both people and pages.
interface PageCoverPhotoEditorProps {
  pageId: string;
  coverImage: string | null;
  /** True only for the page admin acting as the page. */
  canEdit: boolean;
  onUploaded: (url: string) => void;
}

const PageCoverPhotoEditor = ({ pageId, coverImage, canEdit, onUploaded }: PageCoverPhotoEditorProps) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 5MB', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${pageId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await gateway.storage
        .from('covers')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = gateway.storage.from('covers').getPublicUrl(path);
      const cover_image = urlData.publicUrl;
      const { error } = await gateway.from('pages').update({ cover_image }).eq('id', pageId);
      if (error) throw error;

      onUploaded(cover_image);
      toast({ title: 'Cover updated' });
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Could not update the cover photo',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div className="relative w-full h-36 md:h-56 overflow-hidden bg-gradient-to-br from-primary/20 to-purple-500/20">
        {coverImage && (
          <img src={coverImage} alt="Page cover" className="w-full h-full object-cover" loading="eager" decoding="async" />
        )}
        {canEdit && (
          <Button
            size="sm"
            variant="secondary"
            className="absolute bottom-3 right-3"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Camera className="h-4 w-4 mr-2" />
            {uploading ? 'Uploading...' : 'Edit cover'}
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
            e.target.value = '';
          }}
        />
      </div>
    </>
  );
};

export default PageCoverPhotoEditor;
