import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export interface StoryPoll {
  id: string;
  story_id: string;
  question: string;
  options: string[];
  created_at: string;
  votes?: PollVote[];
}

export interface PollVote {
  id: string;
  poll_id: string;
  user_id: string;
  option_index: number;
  created_at: string;
}

export const useStoryPolls = (storyId?: string) => {
  const [poll, setPoll] = useState<StoryPoll | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchPoll = async () => {
    if (!storyId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await gateway
        .from('story_polls')
        .select(`
          *,
          votes:story_poll_votes(*)
        `)
        .eq('story_id', storyId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      if (data) {
        setPoll({
          ...data,
          options: typeof data.options === 'string' ? JSON.parse(data.options) : data.options
        });
      }
    } catch (error: any) {
      console.error('Error fetching poll:', error);
    } finally {
      setLoading(false);
    }
  };

  const createPoll = async (question: string, options: string[]) => {
    if (!storyId || !user) return null;

    try {
      const { data, error } = await gateway
        .from('story_polls')
        .insert({
          story_id: storyId,
          question,
          options: JSON.stringify(options)
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Poll created'
      });

      fetchPoll();
      return data;
    } catch (error: any) {
      console.error('Error creating poll:', error);
      toast({
        title: 'Error',
        description: 'Failed to create poll',
        variant: 'destructive'
      });
      return null;
    }
  };

  const vote = async (pollId: string, optionIndex: number) => {
    if (!user) return;

    try {
      const { error } = await gateway
        .from('story_poll_votes')
        .upsert({
          poll_id: pollId,
          user_id: user.id,
          option_index: optionIndex
        });

      if (error) throw error;

      fetchPoll();
    } catch (error: any) {
      console.error('Error voting:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit vote',
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    fetchPoll();
  }, [storyId]);

  return {
    poll,
    loading,
    createPoll,
    vote,
    refetch: fetchPoll
  };
};
