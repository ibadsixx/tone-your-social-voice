import { useState } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';

interface UploadResponse {
  publicUrl: string;
  fileName: string;
}

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
    const defaultText = type === 'profile' 
      ? 'changed their profile picture' 
      : 'updated their cover photo';
    
    const content = customText 
      ? `${customText}\n\n${defaultText}` 
      : defaultText;

    const { error } = await gateway
      .from('posts')
      .insert({
        user_id: userId,
        content,
        media_url: imageUrl,
        type: 'normal_post'
      });

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
      
      // Create post
      await createPost(userId, publicUrl, type, customText);
      
      toast({
        title: 'Success',
        description: `${type === 'profile' ? 'Profile picture' : 'Cover photo'} updated and posted successfully`
      });

      return publicUrl;
    } catch (error: any) {
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