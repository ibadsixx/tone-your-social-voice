import { useState } from 'react';
import { gateway } from '@/lib/gateway';
import { postsApi } from '@/api';
import { useToast } from '@/hooks/use-toast';
import { POST_CREATED_EVENT } from '@/hooks/useHomeFeed';

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

// Shared post-creation for automatic profile/cover-photo-change posts. Uses the
// SAME canonical creation path as the main composer (postsApi.createPost) so the
// announcement post behaves exactly like any other post. Inserted only with the
// user's actual caption (empty when none was entered) and the dedicated post
// type so Post.tsx renders "changed their profile picture" / "changed their
// cover photo" in the header — the phrase is never persisted into the caption.
// Throws on failure so callers can surface the error instead of silently
// losing the post.
export const createPhotoUpdatePost = async (
  userId: string,
  imageUrl: string,
  type: 'profile' | 'cover',
  customText?: string
): Promise<string> => {
  const payload = buildProfileUpdatePost(type, customText);

  const { data, error } = await postsApi.createPost({
    user_id: userId,
    content: payload.content,
    media_url: imageUrl,
    type: payload.type
  });

  if (error) throw new Error(error.message || 'Failed to create the automatic post');
  return data?.id ?? '';
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
      
      // Create post (throws on failure so the error toast below is shown)
      await createPhotoUpdatePost(userId, publicUrl, type, customText);
      // Let mounted feeds refresh with the new announcement post, like the composer.
      window.dispatchEvent(new CustomEvent(POST_CREATED_EVENT));
      
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