import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export const usePostNotifications = (postId: string) => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;
    
    checkNotificationStatus();
  }, [postId, user]);

  const checkNotificationStatus = async () => {
    if (!user) return;

    try {
      const { data, error } = await gateway
        .from('post_notifications')
        .select('is_enabled')
        .eq('user_id', user.id)
        .eq('post_id', postId)
        .maybeSingle();

      if (error) throw error;
      setIsEnabled(data?.is_enabled ?? false);
    } catch (error) {
      console.error('Error checking notification status:', error);
    }
  };

  const toggleNotifications = async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to manage notifications",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data: existing } = await gateway
        .from('post_notifications')
        .select('id')
        .eq('user_id', user.id)
        .eq('post_id', postId)
        .maybeSingle();

      if (existing) {
        const { error } = await gateway
          .from('post_notifications')
          .update({ is_enabled: !isEnabled })
          .eq('user_id', user.id)
          .eq('post_id', postId);

        if (error) throw error;
      } else {
        const { error } = await gateway
          .from('post_notifications')
          .insert({
            user_id: user.id,
            post_id: postId,
            is_enabled: true
          });

        if (error) throw error;
      }

      setIsEnabled(!isEnabled);
      toast({
        title: isEnabled ? "Notifications disabled" : "Notifications enabled",
        description: isEnabled 
          ? "You won't receive notifications for this post" 
          : "You'll receive notifications for this post"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update notification settings",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return { isEnabled, isLoading, toggleNotifications };
};
