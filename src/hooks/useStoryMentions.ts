import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';

export interface StoryMention {
  id: string;
  story_id: string;
  mentioned_user_id: string;
  created_by: string;
  position_x: number | null;
  position_y: number | null;
  created_at: string;
  profile?: {
    username: string;
    display_name: string;
    profile_pic: string | null;
  };
}

export const useStoryMentions = (storyId?: string) => {
  const [mentions, setMentions] = useState<StoryMention[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchMentions = async () => {
    if (!storyId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await gateway
        .from('story_mentions')
        .select(`
          *,
          profile:profiles!story_mentions_mentioned_user_id_fkey (
            username,
            display_name,
            profile_pic
          )
        `)
        .eq('story_id', storyId);

      if (error) throw error;
      setMentions(data || []);
    } catch (error: any) {
      console.error('Error fetching mentions:', error);
      toast({
        title: 'Error',
        description: 'Failed to load mentions',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const addMention = async (userId: string, position?: { x: number; y: number }) => {
    if (!storyId) return null;

    try {
      const { data, error } = await gateway
        .from('story_mentions')
        .insert({
          story_id: storyId,
          mentioned_user_id: userId,
          created_by: (await gateway.auth.getUser()).data.user?.id,
          position_x: position?.x || null,
          position_y: position?.y || null
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'User tagged in story'
      });

      fetchMentions();
      return data;
    } catch (error: any) {
      console.error('Error adding mention:', error);
      toast({
        title: 'Error',
        description: 'Failed to tag user',
        variant: 'destructive'
      });
      return null;
    }
  };

  const removeMention = async (mentionId: string) => {
    try {
      const { error } = await gateway
        .from('story_mentions')
        .delete()
        .eq('id', mentionId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Tag removed'
      });

      fetchMentions();
    } catch (error: any) {
      console.error('Error removing mention:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove tag',
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    fetchMentions();
  }, [storyId]);

  return {
    mentions,
    loading,
    addMention,
    removeMention,
    refetch: fetchMentions
  };
};
