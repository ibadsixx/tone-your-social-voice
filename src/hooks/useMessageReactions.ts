import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';
import type { ReactionKey } from '@/lib/reactions';

type MessageReaction = {
  id: string;
  message_id: string;
  user_id: string;
  reaction: string;
  created_at: string;
};

export const useMessageReactions = (conversationId?: string) => {
  const [reactions, setReactions] = useState<Record<string, MessageReaction[]>>({});
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Fetch reactions for all messages in a conversation
  const fetchReactions = async (messageIds: string[]) => {
    if (!messageIds.length) return;

    try {
      const { data, error } = await gateway
        .from('message_reactions')
        .select('*')
        .in('message_id', messageIds);

      if (error) throw error;

      // Group reactions by message_id
      const grouped: Record<string, MessageReaction[]> = {};
      data?.forEach((reaction) => {
        if (!grouped[reaction.message_id]) {
          grouped[reaction.message_id] = [];
        }
        grouped[reaction.message_id].push(reaction);
      });

      setReactions(grouped);
    } catch (error: any) {
      console.error('Error fetching message reactions:', error);
    }
  };

  // Toggle a reaction on a message
  const toggleReaction = async (messageId: string, reactionKey: ReactionKey, userId: string) => {
    try {
      // Check if user already has a reaction on this message
      const { data: existingReaction, error: fetchError } = await gateway
        .from('message_reactions')
        .select('*')
        .eq('message_id', messageId)
        .eq('user_id', userId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existingReaction) {
        if (existingReaction.reaction === reactionKey) {
          // Same reaction - remove it
          const { error: deleteError } = await gateway
            .from('message_reactions')
            .delete()
            .eq('id', existingReaction.id);

          if (deleteError) throw deleteError;

          // Update local state
          setReactions(prev => ({
            ...prev,
            [messageId]: (prev[messageId] || []).filter(r => r.id !== existingReaction.id)
          }));
        } else {
          // Different reaction - update it
          const { data: updatedReaction, error: updateError } = await gateway
            .from('message_reactions')
            .update({ reaction: reactionKey })
            .eq('id', existingReaction.id)
            .select()
            .single();

          if (updateError) throw updateError;

          // Update local state
          setReactions(prev => ({
            ...prev,
            [messageId]: (prev[messageId] || []).map(r => 
              r.id === existingReaction.id ? updatedReaction : r
            )
          }));
        }
      } else {
        // No existing reaction - create new one
        const { data: newReaction, error: insertError } = await gateway
          .from('message_reactions')
          .insert({
            message_id: messageId,
            user_id: userId,
            reaction: reactionKey
          })
          .select()
          .single();

        if (insertError) throw insertError;

        // Update local state
        setReactions(prev => ({
          ...prev,
          [messageId]: [...(prev[messageId] || []), newReaction]
        }));
      }
    } catch (error: any) {
      console.error('[toggleReaction] Error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to add reaction',
        variant: 'destructive',
      });
    }
  };

  // Get reactions for a specific message
  const getMessageReactions = (messageId: string) => {
    return reactions[messageId] || [];
  };

  // Set up real-time subscription for reactions
  useEffect(() => {
    if (!conversationId) return;

    const channel = gateway
      .channel(`message-reactions-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newReaction = payload.new as MessageReaction;
            setReactions(prev => ({
              ...prev,
              [newReaction.message_id]: [...(prev[newReaction.message_id] || []), newReaction]
            }));
          } else if (payload.eventType === 'UPDATE') {
            const updatedReaction = payload.new as MessageReaction;
            setReactions(prev => ({
              ...prev,
              [updatedReaction.message_id]: (prev[updatedReaction.message_id] || []).map(r =>
                r.id === updatedReaction.id ? updatedReaction : r
              )
            }));
          } else if (payload.eventType === 'DELETE') {
            const deletedReaction = payload.old as MessageReaction;
            setReactions(prev => ({
              ...prev,
              [deletedReaction.message_id]: (prev[deletedReaction.message_id] || []).filter(r =>
                r.id !== deletedReaction.id
              )
            }));
          }
        }
      )
      .subscribe();

    return () => {
      gateway.removeChannel(channel);
    };
  }, [conversationId]);

  return {
    reactions,
    loading,
    fetchReactions,
    toggleReaction,
    getMessageReactions,
  };
};
