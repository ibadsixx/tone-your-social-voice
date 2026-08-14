import { useState, useEffect, useCallback } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';

export interface ConversationSettings {
  id: string;
  conversation_id: string;
  user_id: string;
  is_muted: boolean;
  vanishing_messages_enabled: boolean;
  vanishing_messages_duration: number | null;
  read_receipts_enabled: boolean;
  chat_theme?: string;
  quick_emoji?: string | null;
  messaging_controls?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

const getCurrentUserId = async (): Promise<string | null> => {
  try {
    const { data } = await gateway.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
};

export const useConversationSettings = (conversationId?: string) => {
  const [settings, setSettings] = useState<ConversationSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchSettings = useCallback(async () => {
    if (!conversationId) return;

    setLoading(true);
    try {
      const userId = await getCurrentUserId();
      if (!userId) throw new Error('Not authenticated');

      const { data, error } = await gateway
        .from('conversation_settings')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings(data as ConversationSettings);
        return;
      }

      const { data: created, error: createError } = await gateway
        .from('conversation_settings')
        .insert({ conversation_id: conversationId, user_id: userId })
        .maybeSingle();

      if (createError) throw createError;
      setSettings((created || { conversation_id: conversationId, user_id: userId }) as ConversationSettings);
    } catch (error: any) {
      console.error('Error fetching conversation settings:', error);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const persistSettings = async (patch: Partial<ConversationSettings>): Promise<ConversationSettings | null> => {
    if (!conversationId || !settings) return null;

    try {
      const { data, error } = await gateway
        .from('conversation_settings')
        .update(patch)
        .eq('id', settings.id)
        .maybeSingle();

      if (error) throw error;

      const next = (data || { ...settings, ...patch }) as ConversationSettings;
      setSettings(next);
      return next;
    } catch (error: any) {
      console.error('Error updating conversation settings:', error);
      return null;
    }
  };

  const toggleMute = async () => {
    if (!conversationId || !settings) return;

    const next = await persistSettings({ is_muted: !settings.is_muted });
    if (!next) {
      toast({
        title: "Error",
        description: "Failed to update notification settings",
        variant: "destructive"
      });
      return;
    }

    toast({
      title: next.is_muted ? "Alerts silenced" : "Alerts enabled",
      description: next.is_muted
        ? "You won't receive notifications for this chat"
        : "You'll receive notifications for this chat"
    });
  };

  const toggleVanishingMessages = async () => {
    if (!conversationId || !settings) return;

    const next = await persistSettings({ vanishing_messages_enabled: !settings.vanishing_messages_enabled });
    if (!next) {
      toast({
        title: "Error",
        description: "Failed to update vanishing messages settings",
        variant: "destructive"
      });
      return;
    }

    toast({
      title: next.vanishing_messages_enabled ? "Vanishing messages enabled" : "Vanishing messages disabled",
      description: next.vanishing_messages_enabled
        ? "Messages disappear after being read"
        : "Messages will be kept permanently"
    });
  };

  const toggleReadReceipts = async () => {
    if (!conversationId || !settings) return;

    const next = await persistSettings({ read_receipts_enabled: !settings.read_receipts_enabled });
    if (!next) {
      toast({
        title: "Error",
        description: "Failed to update seen status settings",
        variant: "destructive"
      });
      return;
    }

    toast({
      title: next.read_receipts_enabled ? "Seen status enabled" : "Seen status disabled",
      description: next.read_receipts_enabled
        ? "Others can see when you've read messages"
        : "Others won't see when you've read messages"
    });
  };

  const updateChatTheme = async (themeId: string) => {
    if (!conversationId) {
      console.error('updateChatTheme: No conversation ID provided');
      return;
    }

    try {
      const { error } = await gateway
        .from('conversations')
        .update({ chat_theme: themeId })
        .eq('id', conversationId);

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

    const next = await persistSettings({ quick_emoji: emoji });
    if (!next) {
      toast({
        title: 'Error',
        description: 'Failed to update quick emoji',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Quick reaction updated',
      description: `Quick reaction set to ${emoji}`,
    });
  };

  const updateMessagingControls = async (controls: { who_can_reply?: string; allow_message_sharing?: boolean }) => {
    if (!conversationId || !settings) return null;

    const current = (settings.messaging_controls as Record<string, unknown> | null) || {};
    const nextControls: Record<string, unknown> = { ...current };
    if (controls.who_can_reply !== undefined) nextControls.who_can_reply = controls.who_can_reply;
    if (controls.allow_message_sharing !== undefined) nextControls.allow_message_sharing = controls.allow_message_sharing;

    return persistSettings({ messaging_controls: nextControls });
  };

  return {
    settings,
    loading,
    toggleMute,
    toggleVanishingMessages,
    toggleReadReceipts,
    updateChatTheme,
    updateQuickEmoji,
    updateMessagingControls,
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
      const { data: { user } } = await gateway.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Delete any existing report first to allow re-reporting with new reason
      await gateway
        .from('conversation_reports')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('reporter_id', user.id);

      const { error } = await gateway
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
