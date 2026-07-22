import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface StoryReaction {
  id: string;
  story_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export const useStoryReactions = (storyId: string) => {
  const [reactions, setReactions] = useState<StoryReaction[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!storyId) return;
    fetchReactions();

    const channel = gateway
      .channel(`story-reactions-${storyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'story_reactions',
          filter: `story_id=eq.${storyId}`,
        },
        () => {
          fetchReactions();
        }
      )
      .subscribe();

    return () => {
      gateway.removeChannel(channel);
    };
  }, [storyId]);

  const fetchReactions = async () => {
    try {
      const { data, error } = await gateway
        .from('story_reactions')
        .select('*')
        .eq('story_id', storyId);

      if (error) throw error;
      setReactions(data || []);
    } catch (error) {
      console.error('Error fetching reactions:', error);
    }
  };

  const addReaction = async (emoji: string) => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to react',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await gateway
        .from('story_reactions')
        .insert({
          story_id: storyId,
          user_id: user.id,
          emoji,
        });

      if (error) throw error;

      toast({
        title: 'Reaction added',
        description: 'Your reaction has been added to the story',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add reaction',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const removeReaction = async (emoji: string) => {
    if (!user) return;

    setLoading(true);
    try {
      const { error } = await gateway
        .from('story_reactions')
        .delete()
        .eq('story_id', storyId)
        .eq('user_id', user.id)
        .eq('emoji', emoji);

      if (error) throw error;

      toast({
        title: 'Reaction removed',
        description: 'Your reaction has been removed',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove reaction',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleReaction = async (emoji: string) => {
    const existingReaction = reactions.find(
      (r) => r.user_id === user?.id && r.emoji === emoji
    );

    if (existingReaction) {
      await removeReaction(emoji);
    } else {
      await addReaction(emoji);
    }
  };

  const getUserReactions = () => {
    return reactions.filter((r) => r.user_id === user?.id);
  };

  const getReactionCounts = () => {
    return reactions.reduce((acc, reaction) => {
      acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  };

  return {
    reactions,
    loading,
    addReaction,
    removeReaction,
    toggleReaction,
    getUserReactions,
    getReactionCounts,
  };
};
