import { useState } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';

interface UploadResponse {
  publicUrl: string;
  fileName: string;
}

export interface ProfileUpdatePostPayload {
  content: string;
  type: 'profile_picture_update' | 'cover_photo_update';
}

// Data integrity rule (photo profile posts): the stored caption is ONLY the
// user's own text. The "changed their profile picture" / "updated their cover
// photo" phrase is rendered by Post.tsx in the POST HEADER next to the user's
// name — it must never be inserted into, appended to, or stored as part of the
// caption. Posting the update back is what lets the header text appear.
export const buildProfileUpdatePost = (
  type: 'profile' | 'cover',
  customText?: string
): ProfileUpdatePostPayload => ({
  content: (customText ?? '').trim(),
  type: type === 'profile' ? 'profile_picture_update' : 'cover_photo_update',
});

// Shared post-creation for automatic profile/cover-photo-change posts. Inserted
// only with the user's actual caption (empty when none was entered) and the
// dedicated post type so Post.tsx renders "changed their profile picture" /
// "changed their cover photo" in the header — the phrase is never persisted
// into the caption. Reused by the profile upload flow and the cover editor so
// both photo changes produce the same kind of post.
export const createPhotoUpdatePost = async (
  userId: string,
  imageUrl: string,
  type: 'profile' | 'cover',
  customText?: string
): Promise<void> => {
  const payload = buildProfileUpdatePost(type, customText);

  const { error } = await gateway
    .from('posts')
    .insert({
      user_id: userId,
      content: payload.content,
      media_url: imageUrl,
      type: payload.type
    });

  if (error) throw error;
};

export const usePhotoUpload = () => {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const uploadImage = async (
    file: File, 
    bucketName: 'avatars' | 'covers', 
    userId: string
  ): Promise<UploadResponse> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}.${fileExt}`;
    
    const { error: uploadError } = await gateway.storage
      .from(bucketName)
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = gateway.storage
      .from(bucketName)
      .getPublicUrl(fileName);

    return { publicUrl, fileName };
  };

  const updateProfile = async (
    userId: string,
    field: 'profile_pic' | 'cover_pic',
    imageUrl: string
  ) => {
    const { error } = await gateway
      .from('profiles')
      .update({ [field]: imageUrl })
      .eq('id', userId);

    if (error) throw error;
  };

  const createPost = async (
    userId: string,
    imageUrl: string,
    type: 'profile' | 'cover',
    customText?: string
  ) => {
    await createPhotoUpdatePost(userId, imageUrl, type, customText);
  };

  const uploadPhoto = async (
    file: File,
    type: 'profile' | 'cover',
    userId: string,
    customText?: string
  ) => {
    setUploading(true);
    
    try {
      // Upload image to storage
      const bucketName = type === 'profile' ? 'avatars' : 'covers';
      const { publicUrl } = await uploadImage(file, bucketName, userId);
      
      // Update profile
      const profileField = type === 'profile' ? 'profile_pic' : 'cover_pic';
      await updateProfile(userId, profileField, publicUrl);
      
      // Create post
      await createPost(userId, publicUrl, type, customText);
      
      toast({
        title: 'Success',
        description: `${type === 'profile' ? 'Profile picture' : 'Cover photo'} updated and posted successfully`
      });

      return publicUrl;
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to upload ${type === 'profile' ? 'profile picture' : 'cover photo'}`,
        variant: 'destructive'
      });
      throw error;
    } finally {
      setUploading(false);
    }
  };

  return {
    uploadPhoto,
    uploading
  };
};