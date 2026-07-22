import { useState } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';

export const useFileUpload = () => {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const uploadFile = async (file: File, bucket: string = 'avatars'): Promise<string | null> => {
    if (!file) {
      console.error('[useFileUpload] ❌ No file provided');
      return null;
    }

    console.log('[useFileUpload] 📁 FILE DETAILS:', {
      name: file.name,
      size: file.size,
      type: file.type,
      bucket,
    });

    // Check if user is authenticated
    const { data: { user }, error: authError } = await gateway.auth.getUser();
    
    if (authError) {
      console.error('[useFileUpload] ❌ Auth error:', authError);
      toast({
        title: "Authentication Error",
        description: authError.message,
        variant: "destructive"
      });
      return null;
    }
    
    if (!user) {
      console.error('[useFileUpload] ❌ No authenticated user');
      toast({
        title: "Authentication Required",
        description: "Please sign in to upload files",
        variant: "destructive"
      });
      return null;
    }

    console.log('[useFileUpload] ✅ User authenticated:', user.id);

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      console.log('[useFileUpload] 📤 UPLOAD PARAMS:', {
        bucket,
        path: filePath,
        contentType: file.type,
        fileSize: file.size,
      });

      const { error: uploadError, data: uploadData } = await gateway.storage
        .from(bucket)
        .upload(filePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        console.error('[useFileUpload] ❌ UPLOAD ERROR:', {
          message: uploadError.message,
          name: uploadError.name,
          details: uploadError,
        });
        throw uploadError;
      }

      console.log('[useFileUpload] ✅ UPLOAD SUCCESS:', uploadData);

      const { data } = gateway.storage
        .from(bucket)
        .getPublicUrl(filePath);

      console.log('[useFileUpload] ✅ PUBLIC URL:', data.publicUrl);

      return data.publicUrl;
    } catch (error: any) {
      console.error('[useFileUpload] ❌ UPLOAD FAILED:', error);
      toast({
        title: "Upload Error",
        description: error.message || "Failed to upload file",
        variant: "destructive"
      });
      return null;
    } finally {
      setUploading(false);
    }
  };

  return { uploadFile, uploading };
};