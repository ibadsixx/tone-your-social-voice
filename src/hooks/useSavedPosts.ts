import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export const useSavedPosts = (postId: string) => {
  const [isSaved, setIsSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;
    
    checkIfSaved();
  }, [postId, user]);

  const checkIfSaved = async () => {
    if (!user) return;

    try {
      const { data, error } = await gateway
        .from('saved_posts')
        .select('id')
        .eq('user_id', user.id)
        .eq('post_id', postId)
        .maybeSingle();

      if (error) throw error;
      setIsSaved(!!data);
    } catch (error) {
      console.error('Error checking saved status:', error);
    }
  };

  const toggleSave = async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to save posts",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      if (isSaved) {
        const { error } = await gateway
          .from('saved_posts')
          .delete()
          .eq('user_id', user.id)
          .eq('post_id', postId);

        if (error) throw error;

        setIsSaved(false);
        toast({
          title: "Post unsaved",
          description: "Post removed from your saved items"
        });
      } else {
        const { error } = await gateway
          .from('saved_posts')
          .insert({
            user_id: user.id,
            post_id: postId
          });

        if (error) throw error;

        setIsSaved(true);
        toast({
          title: "Post saved",
          description: "Post added to your saved items"
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save post",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return { isSaved, isLoading, toggleSave };
};
