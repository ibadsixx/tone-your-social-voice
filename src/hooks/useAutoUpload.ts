import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

const BUCKET = 'media_backups';

export function useAutoUpload() {
  const { user } = useAuth();
  const { toast } = useToast();

  const upload = useCallback(async (files: File[]) => {
    if (!user?.id) return;
    const uploaded: string[] = [];

    for (const file of files) {
      const ext = file.name.split('.').pop() || 'bin';
      const filePath = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, file, { contentType: file.type });

      if (uploadError) {
        console.error('Auto-upload failed:', uploadError);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(filePath);

      if (!urlData?.publicUrl) continue;

      await supabase.from('media_library').insert({
        user_id: user.id,
        file_url: urlData.publicUrl,
        file_type: file.type,
        file_size: file.size,
        file_name: file.name,
      });

      uploaded.push(urlData.publicUrl);
    }

    if (uploaded.length > 0) {
      toast({ title: 'Auto-upload complete', description: `${uploaded.length} file(s) backed up to your media library.` });
    }

    return uploaded;
  }, [user?.id, toast]);

  return { upload };
}
