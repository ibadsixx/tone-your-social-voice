import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';
import { ImageIcon } from 'lucide-react';

interface PhotoLibraryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPhotoSelect: (photoUrl: string) => void;
}

const PhotoLibraryModal = ({ open, onOpenChange, onPhotoSelect }: PhotoLibraryModalProps) => {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (open && user?.id) {
      fetchUserPhotos();
    }
  }, [open, user?.id]);

  const fetchUserPhotos = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      // Get photos from user's posts
      const { data: posts, error: postsError } = await gateway
        .from('posts')
        .select('media_url')
        .eq('user_id', user.id)
        .not('media_url', 'is', null)
        .order('created_at', { ascending: false });

      if (postsError) throw postsError;

      // Get photos from user's avatar uploads
      const { data: avatarFiles, error: avatarError } = await gateway.storage
        .from('avatars')
        .list(user.id, {
          limit: 50,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (avatarError) throw avatarError;

      // Get photos from user's cover uploads
      const { data: coverFiles, error: coverError } = await gateway.storage
        .from('covers')
        .list(user.id, {
          limit: 50,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (coverError) throw coverError;

      // Combine all photo URLs
      const allPhotos = new Set<string>();

      // Add post media
      posts?.forEach(post => {
        if (post.media_url) {
          allPhotos.add(post.media_url);
        }
      });

      // Add avatar files
      avatarFiles?.forEach(file => {
        const { data } = gateway.storage
          .from('avatars')
          .getPublicUrl(`${user.id}/${file.name}`);
        allPhotos.add(data.publicUrl);
      });

      // Add cover files
      coverFiles?.forEach(file => {
        const { data } = gateway.storage
          .from('covers')
          .getPublicUrl(`${user.id}/${file.name}`);
        allPhotos.add(data.publicUrl);
      });

      setPhotos(Array.from(allPhotos));
    } catch (error) {
      console.error('Error fetching photos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPhoto = () => {
    if (selectedPhoto) {
      onPhotoSelect(selectedPhoto);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Choose a Photo</DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-96">
          {loading ? (
            <div className="grid grid-cols-3 md:grid-cols-4 gap-4 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-lg" />
              ))}
            </div>
          ) : photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ImageIcon className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No photos found</p>
              <p className="text-sm text-muted-foreground">Upload some photos to your posts first</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-4 gap-4 p-4">
              {photos.map((photo, index) => (
                <div
                  key={index}
                  className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                    selectedPhoto === photo
                      ? 'border-primary ring-2 ring-primary/20'
                      : 'border-transparent hover:border-muted'
                  }`}
                  onClick={() => setSelectedPhoto(photo)}
                >
                  <img
                    src={photo}
                    alt={`Photo ${index + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {selectedPhoto === photo && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSelectPhoto}
            disabled={!selectedPhoto}
          >
            Select Photo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PhotoLibraryModal;