import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export interface StoryQuestion {
  id: string;
  story_id: string;
  question: string;
  created_at: string;
  responses?: QuestionResponse[];
}

export interface QuestionResponse {
  id: string;
  question_id: string;
  user_id: string;
  response: string;
  created_at: string;
  profile?: {
    username: string;
    display_name: string;
    profile_pic: string | null;
  };
}

export const useStoryQuestions = (storyId?: string) => {
  const [question, setQuestion] = useState<StoryQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchQuestion = async () => {
    if (!storyId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await gateway
        .from('story_questions')
        .select(`
          *,
          responses:story_question_responses(
            *,
            profile:user_id (
              username,
              display_name,
              profile_pic
            )
          )
        `)
        .eq('story_id', storyId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      setQuestion(data);
    } catch (error: any) {
      console.error('Error fetching question:', error);
    } finally {
      setLoading(false);
    }
  };

  const createQuestion = async (questionText: string) => {
    if (!storyId || !user) return null;

    try {
      const { data, error } = await gateway
        .from('story_questions')
        .insert({
          story_id: storyId,
          question: questionText
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Question added'
      });

      fetchQuestion();
      return data;
    } catch (error: any) {
      console.error('Error creating question:', error);
      toast({
        title: 'Error',
        description: 'Failed to add question',
        variant: 'destructive'
      });
      return null;
    }
  };

  const respond = async (questionId: string, responseText: string) => {
    if (!user) return;

    try {
      const { error } = await gateway
        .from('story_question_responses')
        .insert({
          question_id: questionId,
          user_id: user.id,
          response: responseText
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Response sent'
      });

      fetchQuestion();
    } catch (error: any) {
      console.error('Error responding:', error);
      toast({
        title: 'Error',
        description: 'Failed to send response',
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    fetchQuestion();
  }, [storyId]);

  return {
    question,
    loading,
    createQuestion,
    respond,
    refetch: fetchQuestion
  };
};
