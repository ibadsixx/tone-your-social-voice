import { useState } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';

export const useMessageActions = (conversationId?: string, currentUserId?: string) => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Delete a message
  const deleteMessage = async (messageId: string): Promise<boolean> => {
    if (!currentUserId) {
      toast({
        title: "Error",
        description: "You must be logged in to delete messages",
        variant: "destructive"
      });
      return false;
    }

    setLoading(true);
    try {
      const { error } = await gateway
        .from('messages')
        .delete()
        .eq('id', messageId)
        .eq('sender_id', currentUserId); // Only delete own messages

      if (error) throw error;

      toast({
        title: "Message removed",
        description: "The message has been deleted"
      });
      return true;
    } catch (error: any) {
      console.error('Error deleting message:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete message",
        variant: "destructive"
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Pin a message
  const pinMessage = async (messageId: string): Promise<boolean> => {
    if (!conversationId || !currentUserId) {
      toast({
        title: "Error",
        description: "Unable to pin message",
        variant: "destructive"
      });
      return false;
    }

    setLoading(true);
    try {
      // Check if already pinned
      const { data: existing } = await gateway
        .from('pinned_messages')
        .select('id')
        .eq('message_id', messageId)
        .eq('conversation_id', conversationId)
        .maybeSingle();

      if (existing) {
        // Unpin
        const { error } = await gateway
          .from('pinned_messages')
          .delete()
          .eq('id', existing.id);

        if (error) throw error;

        toast({
          title: "Message unpinned",
          description: "The message has been unpinned"
        });
      } else {
        // Pin
        const { error } = await gateway
          .from('pinned_messages')
          .insert({
            message_id: messageId,
            conversation_id: conversationId,
            pinned_by: currentUserId
          });

        if (error) throw error;

        toast({
          title: "Message pinned",
          description: "The message has been pinned to this conversation"
        });
      }
      return true;
    } catch (error: any) {
      console.error('Error pinning message:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to pin message",
        variant: "destructive"
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Report a message
  const reportMessage = async (messageId: string, reason: string, details?: string): Promise<boolean> => {
    if (!conversationId || !currentUserId) {
      toast({
        title: "Error",
        description: "Unable to report message",
        variant: "destructive"
      });
      return false;
    }

    setLoading(true);
    try {
      const { error } = await gateway
        .from('message_reports')
        .insert({
          message_id: messageId,
          conversation_id: conversationId,
          reporter_id: currentUserId,
          reason,
          details
        });

      if (error) throw error;

      toast({
        title: "Message reported",
        description: "Thank you for your report. We will review it shortly."
      });
      return true;
    } catch (error: any) {
      console.error('Error reporting message:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to report message",
        variant: "destructive"
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Get pinned messages for a conversation
  const getPinnedMessages = async (): Promise<string[]> => {
    if (!conversationId) return [];

    try {
      const { data, error } = await gateway
        .from('pinned_messages')
        .select('message_id')
        .eq('conversation_id', conversationId);

      if (error) throw error;

      return data?.map(p => p.message_id) || [];
    } catch (error) {
      console.error('Error fetching pinned messages:', error);
      return [];
    }
  };

  return {
    loading,
    deleteMessage,
    pinMessage,
    reportMessage,
    getPinnedMessages
  };
};
