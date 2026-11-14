import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Camera, Image as ImageIcon, Move, Trash2, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { gateway } from '@/lib/gateway';
import PhotoLibraryModal from './PhotoLibraryModal';
import CoverRepositionModal from './CoverRepositionModal';
import {
  createPhotoUpdatePost,
  photoErrorMessage,
  saveProfileImage,
  uploadPhotoToStorage,
  validatePhotoFile,
} from '@/hooks/usePhotoUpload';
import { POST_CREATED_EVENT } from '@/hooks/useHomeFeed';
import {
  normalizeCoverPosition,
  getCoverBackgroundPosition,
  getCoverMaxMovement,
} from '@/lib/coverPosition';

interface CoverPhotoEditorProps {
  profile: {
    id: string;
    cover_pic: string | null;
    cover_position_y?: number;
  };
  isOwnProfile: boolean;
  onProfileUpdate?: () => void;
}

const CoverPhotoEditor = ({ profile, isOwnProfile, onProfileUpdate }: CoverPhotoEditorProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [uploading, setUploading] = useState(false);
  const [showPhotoLibrary, setShowPhotoLibrary] = useState(false);
  const [showReposition, setShowReposition] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const coverContainerRef = useRef<HTMLDivElement>(null);
  // Normalized cover position (0-100, 50 = center). Shared with the
  // repositioning modal so preview and final render match exactly.
  const [coverPositionPercent, setCoverPositionPercent] = useState(() =>
    normalizeCoverPosition(profile.cover_position_y)
  );

  // Recalculate the cover's background-position whenever the cover image,
  // saved position, or container dimensions change. Uses the same shared
  // calculation as the repositioning modal, so preview and final render
  // show identical image composition regardless of container size.
  useEffect(() => {
    if (!profile.cover_pic || !coverContainerRef.current) {
      setCoverPositionPercent(normalizeCoverPosition(profile.cover_position_y));
      return;
    }

    const container = coverContainerRef.current;

    const updateCoverPosition = () => {
      const { clientWidth: containerWidth, clientHeight: containerHeight } = container;
      if (containerWidth === 0 || containerHeight === 0) return;

      const img = new Image();
      img.src = profile.cover_pic;
      img.onload = () => {
        // background-size: cover scales to cover both dimensions.
        const maxMovement = getCoverMaxMovement(
          img.naturalWidth,
          img.naturalHeight,
          containerWidth,
          containerHeight
        );

        // Clamp the stored position to the valid range for this container,
        // then express it as a normalized percentage (0-100).
        const clampedPx = Math.max(
          -maxMovement,
          Math.min(maxMovement, positionPercentToPxRaw(profile.cover_position_y || 0, maxMovement))
        );
        const percent = maxMovement > 0
          ? 50 + (clampedPx / maxMovement) * 50
          : 50;
        setCoverPositionPercent(Math.max(0, Math.min(100, percent)));
      };
      img.onerror = () => setCoverPositionPercent(normalizeCoverPosition(profile.cover_position_y));
    };

    const observer = new ResizeObserver(() => {
      updateCoverPosition();
    });
    observer.observe(container);

    updateCoverPosition();

    return () => observer.disconnect();
  }, [profile.cover_pic, profile.cover_position_y]);

  // Helper: convert a raw stored position (legacy pixels or new %) to a
  // pixel offset for clamping against the current container's max movement.
  function positionPercentToPxRaw(
    storedValue: number,
    maxMovement: number
  ): number {
    // Legacy default: 0 meant center (0 pixel offset).
    if (storedValue === 0) {
      return 0;
    }
    // If already a 0-100 percentage, convert back to pixels.
    if (storedValue > 0 && storedValue <= 100) {
      return ((storedValue - 50) / 50) * maxMovement;
    }
    // Legacy pixel value: use directly.
    return storedValue;
  }

  const handleFileUpload = async (file: File) => {
    if (!user?.id) return;

    try {
      validatePhotoFile(file, 'cover photo');
    } catch (validationError) {
      console.error('[CoverPhotoEditor] rejected cover file:', validationError);
      toast({
        title: 'Error',
        description: photoErrorMessage(validationError, 'cover photo'),
        variant: 'destructive'
      });
      return;
    }

    setUploading(true);
    try {
      // Resize image to max 1920px width for performance
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = URL.createObjectURL(file);
      });

      const maxWidth = 1920;
      const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;

      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to convert canvas to blob'));
          }
        }, 'image/jpeg', 0.9);
      });

      // Upload + profile write go through the same shared helpers the
      // profile-picture path uses, so the two surfaces cannot drift apart
      // again (do.md §2). The canvas output is always a JPEG.
      const { publicUrl } = await uploadPhotoToStorage(blob, 'covers', user.id, 'jpg');

      await saveProfileImage(user.id, 'cover_pic', publicUrl, {
        cover_position_y: 0, // Reset position for new cover
      });

      // Automatic cover-photo-change post — only after the upload AND profile
      // update have succeeded. The insert reuses the composer's canonical
      // creation path (postsApi), and failure is surfaced loudly rather than
      // swallowed: the cover is saved, but the announcement post is a real DB
      // row that must exist (verified by the feed). On success the app's
      // POST_CREATED_EVENT makes mounted home/profile feeds refresh right away.
      try {
        await createPhotoUpdatePost(user.id, publicUrl, 'cover');
        window.dispatchEvent(new CustomEvent(POST_CREATED_EVENT));
        toast({
          title: 'Success',
          description: 'Cover photo updated successfully'
        });
      } catch (postError) {
        console.error('[CoverPhotoEditor] Failed to create cover-change post:', postError);
        toast({
          title: 'Cover photo updated',
          description: 'Your cover photo was saved, but the automatic post could not be created.',
          variant: 'destructive'
        });
      }

      onProfileUpdate?.();
    } catch (error) {
      // Never swallow the cause: this bare `catch {}` reported the same
      // "Failed to upload cover photo" for a decode failure, an oversized body
      // and a Cloudinary outage alike, with nothing in the console to
      // distinguish them (do.md §7).
      console.error('[CoverPhotoEditor] cover photo update failed:', error);
      toast({
        title: 'Error',
        description: photoErrorMessage(error, 'cover photo'),
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveCover = async () => {
    if (!user?.id) return;

    try {
      const { error } = await gateway
        .from('profiles')
        .update({ 
          cover_pic: null,
          cover_position_y: 0
        })
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Cover photo removed'
      });

      onProfileUpdate?.();
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to remove cover photo',
        variant: 'destructive'
      });
    }
  };

  const coverStyle = profile.cover_pic ? {
    backgroundImage: `url(${profile.cover_pic})`,
    backgroundPosition: getCoverBackgroundPosition(coverPositionPercent),
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat'
  } : {
    background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%)'
  };

  return (
    <>
      <div 
        ref={coverContainerRef}
        className="relative w-full h-36 md:h-56 overflow-hidden group cursor-pointer"
        style={coverStyle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Hover Overlay */}
        {isOwnProfile && (
          <div 
            className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity duration-300 ${
              isHovered ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {profile.cover_pic ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" disabled={uploading}>
                    <Camera className="h-4 w-4 mr-2" />
                    {uploading ? 'Uploading...' : 'Edit Cover'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                    <Camera className="h-4 w-4 mr-2" />
                    Upload Photo
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowPhotoLibrary(true)}>
                    <ImageIcon className="h-4 w-4 mr-2" />
                    Choose Photo
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowReposition(true)}>
                    <Move className="h-4 w-4 mr-2" />
                    Reposition
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleRemoveCover} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button 
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Plus className="h-4 w-4 mr-2" />
                {uploading ? 'Uploading...' : 'Add Cover Photo'}
              </Button>
            )}
          </div>
        )}

        {/* Default background when no cover */}
        {!profile.cover_pic && !isOwnProfile && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white/70 text-center">
              <Camera className="h-12 w-12 mx-auto mb-2" />
              <p className="text-sm">No cover photo</p>
            </div>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (import.meta.env.DEV) {
            console.debug('[CoverPhotoEditor] file selected:', file ? { name: file.name, size: file.size, type: file.type } : null);
          }
          if (file) {
            handleFileUpload(file);
          }
        }}
        accept="image/*"
        className="hidden"
      />

      {/* Modals */}
      <PhotoLibraryModal
        open={showPhotoLibrary}
        onOpenChange={setShowPhotoLibrary}
        onPhotoSelect={async (photoUrl) => {
          if (!user?.id) return;
          
          try {
            const { error } = await gateway
              .from('profiles')
              .update({ 
                cover_pic: photoUrl,
                cover_position_y: 0
              })
              .eq('id', user.id);

            if (error) throw error;

            // Automatic cover-photo-change post once the cover update succeeds.
            try {
              await createPhotoUpdatePost(user.id, photoUrl, 'cover');
              window.dispatchEvent(new CustomEvent(POST_CREATED_EVENT));
              toast({
                title: 'Success',
                description: 'Cover photo updated'
              });
            } catch (postError) {
              console.error('[CoverPhotoEditor] Failed to create cover-change post:', postError);
              toast({
                title: 'Cover photo updated',
                description: 'Your cover photo was saved, but the automatic post could not be created.',
                variant: 'destructive'
              });
            }

            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('profile:updated', { detail: { userId: user.id, type: 'cover', publicUrl: photoUrl } }));
            }
            onProfileUpdate?.();
            setShowPhotoLibrary(false);
          } catch {
            toast({
              title: 'Error',
              description: 'Failed to update cover photo',
              variant: 'destructive'
            });
          }
        }}
      />

      <CoverRepositionModal
        open={showReposition}
        onOpenChange={setShowReposition}
        coverUrl={profile.cover_pic}
        currentPosition={profile.cover_position_y || 0}
        onPositionSave={async (position) => {
          if (!user?.id) return;
          
          try {
            const { error } = await gateway
              .from('profiles')
              .update({ cover_position_y: position })
              .eq('id', user.id);

            if (error) throw error;

            toast({
              title: 'Success',
              description: 'Cover position updated'
            });

            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('profile:updated', { detail: { userId: user.id, type: 'cover-position' } }));
            }
            onProfileUpdate?.();
            setShowReposition(false);
          } catch {
            toast({
              title: 'Error',
              description: 'Failed to update position',
              variant: 'destructive'
            });
          }
        }}
      />
    </>
  );
};

export default CoverPhotoEditor;