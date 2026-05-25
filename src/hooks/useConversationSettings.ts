import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ConversationSettings {
  id: string;
  conversation_id: string;
  user_id: string;
  is_muted: boolean;
  vanishing_messages_enabled: boolean;
  vanishing_messages_duration: number;
  read_receipts_enabled: boolean;
  chat_theme?: string;
  quick_emoji?: string;
  messaging_controls?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export const useConversationSettings = (conversationId?: string) => {
  const [settings, setSettings] = useState<ConversationSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchSettings = useCallback(async () => {
    if (!conversationId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_or_create_conversation_settings', {
        p_conversation_id: conversationId
      });

      if (error) throw error;
      setSettings(data as ConversationSettings);
    } catch (error: any) {
      console.error('Error fetching conversation settings:', error);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const toggleMute = async () => {
    if (!conversationId || !settings) return;

    try {
      const { data, error } = await supabase.rpc('update_conversation_settings', {
        p_conversation_id: conversationId,
        p_is_muted: !settings.is_muted
      });

      if (error) throw error;
      setSettings(data as ConversationSettings);
      
      toast({
        title: data.is_muted ? "Alerts silenced" : "Alerts enabled",
        description: data.is_muted 
          ? "You won't receive notifications for this chat" 
          : "You'll receive notifications for this chat"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to update notification settings",
        variant: "destructive"
      });
    }
  };

  const toggleVanishingMessages = async () => {
    if (!conversationId || !settings) return;

    try {
      const { data, error } = await supabase.rpc('update_conversation_settings', {
        p_conversation_id: conversationId,
        p_vanishing_messages_enabled: !settings.vanishing_messages_enabled
      });

      if (error) throw error;
      setSettings(data as ConversationSettings);
      
      toast({
        title: data.vanishing_messages_enabled ? "Vanishing messages enabled" : "Vanishing messages disabled",
        description: data.vanishing_messages_enabled 
          ? "Messages will disappear after 24 hours" 
          : "Messages will be kept permanently"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to update vanishing messages settings",
        variant: "destructive"
      });
    }
  };

  const toggleReadReceipts = async () => {
    if (!conversationId || !settings) return;

    try {
      const { data, error } = await supabase.rpc('update_conversation_settings', {
        p_conversation_id: conversationId,
        p_read_receipts_enabled: !settings.read_receipts_enabled
      });

      if (error) throw error;
      setSettings(data as ConversationSettings);
      
      toast({
        title: data.read_receipts_enabled ? "Seen status enabled" : "Seen status disabled",
        description: data.read_receipts_enabled 
          ? "Others can see when you've read messages" 
          : "Others won't see when you've read messages"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to update seen status settings",
        variant: "destructive"
      });
    }
  };

  const updateChatTheme = async (themeId: string) => {
    if (!conversationId) {
      console.error('updateChatTheme: No conversation ID provided');
      return;
    }

    try {
      console.log('updateChatTheme: Updating theme to', themeId, 'for conversation', conversationId);
      
      // Use the shared conversation theme RPC
      const { data, error } = await supabase.rpc('update_conversation_theme', {
        p_conversation_id: conversationId,
        p_chat_theme: themeId,
      });

      console.log('updateChatTheme result:', { data, error });

      if (error) throw error;
      
      // Update local settings to reflect the change
      if (settings) {
        setSettings({ ...settings, chat_theme: themeId });
      }
      
      toast({
        title: 'Theme updated',
        description: 'Chat theme has been changed for all participants',
      });
    } catch (error: any) {
      console.error('updateChatTheme error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update chat theme',
        variant: 'destructive',
      });
    }
  };

  const updateQuickEmoji = async (emoji: string) => {
    if (!conversationId) {
      console.error('updateQuickEmoji: No conversation ID provided');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('update_conversation_settings', {
        p_conversation_id: conversationId,
        p_quick_emoji: emoji
      });

      if (error) throw error;
      setSettings(data as ConversationSettings);
      
      toast({
        title: 'Quick reaction updated',
        description: `Quick reaction set to ${emoji}`,
      });
    } catch (error: any) {
      console.error('updateQuickEmoji error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update quick emoji',
        variant: 'destructive',
      });
    }
  };

  return {
    settings,
    loading,
    toggleMute,
    toggleVanishingMessages,
    toggleReadReceipts,
    updateChatTheme,
    updateQuickEmoji,
    refetch: fetchSettings
  } as const;
};

// Hook for reporting conversations
export const useConversationReport = () => {
  const { toast } = useToast();

  const reportConversation = async (
    conversationId: string,
    reportedUserId: string,
    reason: string,
    details?: string
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Delete any existing report first to allow re-reporting with new reason
      await supabase
        .from('conversation_reports')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('reporter_id', user.id);

      const { error } = await supabase
        .from('conversation_reports')
        .insert({
          conversation_id: conversationId,
          reporter_id: user.id,
          reported_user_id: reportedUserId,
          reason,
          details
        });

      if (error) {
        throw error;
      }

      toast({
        title: "Report submitted",
        description: "Thank you for your feedback. We'll review this conversation."
      });
      return true;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit report",
        variant: "destructive"
      });
      return false;
    }
  };

  return { reportConversation };
};
