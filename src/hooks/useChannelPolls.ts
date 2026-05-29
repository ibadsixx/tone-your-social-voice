import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PollData {
  poll_id: string;
  question: string;
  options: string[];
  total_votes: number;
  vote_counts: Record<string, number>;
  user_vote: number | null;
}

export async function getPoll(messageId: string): Promise<PollData | null> {
  try {
    const { data, error } = await supabase.rpc('get_message_poll', {
      p_message_id: messageId,
    });
    if (error || !data || data.length === 0) return null;
    const row = data[0];
    return {
      poll_id: row.poll_id,
      question: row.question,
      options: row.options as string[],
      total_votes: Number(row.total_votes),
      vote_counts: (row.vote_counts || {}) as Record<string, number>,
      user_vote: row.user_vote ?? null,
    };
  } catch (error) {
    console.error('Error fetching poll:', error);
    return null;
  }
}

export async function vote(pollId: string, optionIndex: number): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('vote_on_poll', {
      p_poll_id: pollId,
      p_option_index: optionIndex,
    });
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error voting:', error);
    return false;
  }
}

export const useChannelPolls = (conversationId?: string) => {
  const [loading, setLoading] = useState(false);
  const creatingRef = useRef(false);

  const createPoll = useCallback(async (
    question: string,
    options: string[],
    senderId: string,
  ): Promise<string | null> => {
    if (!conversationId || creatingRef.current) return null;
    creatingRef.current = true;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('send_poll_message', {
        p_conversation_id: conversationId,
        p_question: question,
        p_options: JSON.stringify(options),
        p_sender_id: senderId,
      });
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating poll:', error);
      return null;
    } finally {
      creatingRef.current = false;
      setLoading(false);
    }
  }, [conversationId]);

  return { createPoll, loading };
};
