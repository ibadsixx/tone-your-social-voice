import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export const useMutedUsers = (targetUserId: string) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;
    
    checkIfMuted();
  }, [targetUserId, user]);

  const checkIfMuted = async () => {
    if (!user) return;

    try {
      const { data, error } = await gateway
        .from('muted_users')
        .select('id')
        .eq('user_id', user.id)
        .eq('muted_user_id', targetUserId)
        .maybeSingle();

      if (error) throw error;
      setIsMuted(!!data);
    } catch (error) {
      console.error('Error checking muted status:', error);
    }
  };

  const toggleMute = async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to mute users",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      if (isMuted) {
        const { error } = await gateway
          .from('muted_users')
          .delete()
          .eq('user_id', user.id)
          .eq('muted_user_id', targetUserId);

        if (error) throw error;

        setIsMuted(false);
        toast({
          title: "User unmuted",
          description: "You'll now see posts from this user"
        });
      } else {
        const { error } = await gateway
          .from('muted_users')
          .insert({
            user_id: user.id,
            muted_user_id: targetUserId
          });

        if (error) throw error;

        setIsMuted(true);
        toast({
          title: "User muted",
          description: "You won't see posts from this user anymore"
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to mute user",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return { isMuted, isLoading, toggleMute };
};
