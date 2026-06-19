import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Camera, Image as ImageIcon, Move, Trash2, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import PhotoLibraryModal from './PhotoLibraryModal';
import CoverRepositionModal from './CoverRepositionModal';

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

  const handleFileUpload = async (file: File) => {
    if (!user?.id) return;
    
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

      // Upload to Supabase storage
      const fileExt = 'jpg';
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('covers')
        .upload(fileName, blob);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('covers')
        .getPublicUrl(fileName);

      // Update profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          cover_pic: publicUrl,
          cover_position_y: 0 // Reset position for new cover
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      toast({
        title: 'Success',
        description: 'Cover photo updated successfully'
      });

      onProfileUpdate?.();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to upload cover photo',
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveCover = async () => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
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
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to remove cover photo',
        variant: 'destructive'
      });
    }
  };

  const coverStyle = profile.cover_pic ? {
    backgroundImage: `url(${profile.cover_pic})`,
    backgroundPosition: `center ${profile.cover_position_y || 0}px`,
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat'
  } : {
    background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%)'
  };

  return (
    <>
      <div 
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
            const { error } = await supabase
              .from('profiles')
              .update({ 
                cover_pic: photoUrl,
                cover_position_y: 0
              })
              .eq('id', user.id);

            if (error) throw error;

            toast({
              title: 'Success',
              description: 'Cover photo updated'
            });

            onProfileUpdate?.();
            setShowPhotoLibrary(false);
          } catch (error: any) {
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
            const { error } = await supabase
              .from('profiles')
              .update({ cover_position_y: position })
              .eq('id', user.id);

            if (error) throw error;

            toast({
              title: 'Success',
              description: 'Cover position updated'
            });

            onProfileUpdate?.();
            setShowReposition(false);
          } catch (error: any) {
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