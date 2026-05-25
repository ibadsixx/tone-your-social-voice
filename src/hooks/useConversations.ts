import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type Conversation = {
  conversation_id: string;
  type: string;
  created_at: string;
  updated_at: string;
  other_user: {
    id: string;
    username: string;
    display_name: string;
    profile_pic?: string;
    last_seen_at?: string;
  };
  last_message?: {
    content?: string;
    created_at: string;
  };
  unread_count: number;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content?: string;
  attachment_url?: string;
  image_url?: string;
  media_url?: string;
  is_image?: boolean;
  is_gif?: boolean;
  gif_url?: string;
  is_sticker?: boolean;
  sticker_url?: string;
  sticker_id?: string;
  sticker_set?: string;
  audio_url?: string;
  audio_duration?: number;
  audio_mime?: string;
  audio_size?: number;
  audio_path?: string;
  message_type?: 'text' | 'image' | 'gif' | 'sticker' | 'audio' | 'video' | 'file';
  is_system?: boolean;
  read?: boolean;
  created_at: string;
  expires_at?: string | null;
  vanish_on_read?: boolean;
  reply_to_id?: string;
  reply_to?: {
    id: string;
    content?: string;
    image_url?: string | null;
    media_url?: string | null;
    attachment_url?: string | null;
    is_image?: boolean | null;
    sender_profile?: {
      display_name: string;
    };
  } | null;
  sender_profile?: {
    username: string;
    display_name: string;
    profile_pic?: string;
  };
};

export const useConversations = (currentUserId?: string) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch conversations using the new RPC
  const fetchConversations = async () => {
    if (!currentUserId) return;

    try {
      const { data, error } = await supabase.rpc('get_conversations_with_info', {
        p_user_id: currentUserId
      });

      if (error) throw error;

      const formattedConversations: Conversation[] = data?.map((conv: any) => ({
        conversation_id: conv.conversation_id,
        type: conv.type,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        other_user: {
          id: conv.other_user_id,
          username: conv.other_user_username,
          display_name: conv.other_user_display_name,
          profile_pic: conv.other_user_profile_pic,
          last_seen_at: undefined,
        },
        last_message: conv.last_message_content ? {
          content: conv.last_message_content,
          created_at: conv.last_message_created_at,
        } : undefined,
        unread_count: Number(conv.unread_count || 0),
      })) || [];

      // Batch-fetch last_seen_at for all conversation partners
      const otherUserIds = formattedConversations.map(c => c.other_user.id);
      if (otherUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, last_seen_at')
          .in('id', otherUserIds);
        if (profiles) {
          const lastSeenMap = new Map(profiles.map(p => [p.id, p.last_seen_at]));
          formattedConversations.forEach(conv => {
            conv.other_user.last_seen_at = lastSeenMap.get(conv.other_user.id) || undefined;
          });
        }
      }

      setConversations(formattedConversations);
    } catch (error: any) {
      console.error('Error fetching conversations:', error);
      toast({
        title: "Error",
        description: "Failed to fetch conversations",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch messages for a specific conversation
  const fetchMessages = async (conversationId: string, page = 0, limit = 50) => {
    if (!currentUserId) {
      console.log('[useConversations] fetchMessages: No currentUserId');
      return;
    }

    console.log('[useConversations] fetchMessages called:', { conversationId, page, limit, currentUserId });

    try {
      // Fetch messages with sender profile using explicit foreign key hint
      const { data, error } = await supabase
        .from('messages')
        .select(`
          id,
          conversation_id,
          sender_id,
          content,
          attachment_url,
          image_url,
          media_url,
          is_image,
          is_gif,
          gif_url,
          is_sticker,
          sticker_url,
          sticker_id,
          sticker_set,
          audio_url,
          audio_duration,
          audio_mime,
          audio_size,
          audio_path,
          reply_to_id,
          created_at,
          expires_at,
          vanish_on_read,
          read,
          message_type,
          is_system,
          sender_profile:profiles!messages_sender_id_fkey(username, display_name, profile_pic)
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);

      console.log('[useConversations] Messages query result:', { 
        dataLength: data?.length || 0, 
        error: error?.message,
        conversationId 
      });

      if (error) {
        console.error('[useConversations] Supabase messages error:', error);
        throw error;
      }

      // Format messages (reverse to show oldest first)
      const formattedMessages: Message[] = (data?.reverse() || []).map((msg: any) => ({
        ...msg,
        reply_to: null // Will be populated separately if needed
      }));

      // Fetch reply_to messages separately if any messages have reply_to_id
      const replyIds = formattedMessages
        .filter(m => m.reply_to_id)
        .map(m => m.reply_to_id);

      if (replyIds.length > 0) {
        const { data: replyData, error: replyError } = await supabase
          .from('messages')
          .select('id, content, image_url, media_url, attachment_url, is_image, sender_profile:profiles!messages_sender_id_fkey(display_name)')
          .in('id', replyIds);

        if (!replyError && replyData) {
          const replyMap = new Map(replyData.map(r => [r.id, r]));
          formattedMessages.forEach(msg => {
            if (msg.reply_to_id && replyMap.has(msg.reply_to_id)) {
              msg.reply_to = replyMap.get(msg.reply_to_id) || null;
            }
          });
        }
      }

      // Filter out expired vanishing messages
      const now = new Date().toISOString();
      const filteredMessages = formattedMessages.filter(
        m => !m.expires_at || m.expires_at > now
      );

      if (filteredMessages.length < formattedMessages.length) {
        console.log(`[useConversations] Filtered out ${formattedMessages.length - filteredMessages.length} expired messages`);
      }

      if (page === 0) {
        setMessages(filteredMessages);
      } else {
        setMessages(prev => [...filteredMessages, ...prev]);
      }

      // Mark messages as read
      await markMessagesAsRead(conversationId);
      console.log('[useConversations] Messages loaded successfully:', filteredMessages.length);
    } catch (error: any) {
      console.error('[useConversations] Error fetching messages:', error);
      toast({
        title: "Error",
        description: error?.message || "Failed to fetch messages",
        variant: "destructive"
      });
    }
  };

  // Send a new message
  const sendMessage = async (conversationId: string, content?: string, attachmentUrl?: string, replyToId?: string) => {
    if (!currentUserId || (!content && !attachmentUrl)) return false;

    // Determine if the attachment is an image or video by file extension only
    const urlPath = attachmentUrl ? attachmentUrl.split('?')[0] : '';
    const isVideo = attachmentUrl && /\.(mp4|webm|ogg|mov|avi|mkv|m4v)$/i.test(urlPath);
    const isImage = !isVideo && attachmentUrl && /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|svg)$/i.test(urlPath);

    try {
      console.log('[useConversations] Sending message:', { conversationId, content, attachmentUrl, replyToId, isImage, isVideo });
      
      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: currentUserId,
          content: (isImage || isVideo) ? (content || null) : content,
          attachment_url: attachmentUrl,
          image_url: isImage ? attachmentUrl : null,
          media_url: isVideo ? attachmentUrl : null,
          is_image: Boolean(isImage),
          message_type: isVideo ? 'video' : isImage ? 'image' : 'text',
          reply_to_id: replyToId || null
        } as any)
        .select(`
          id,
          conversation_id,
          sender_id,
          content,
          attachment_url,
          image_url,
          media_url,
          is_image,
          message_type,
          reply_to_id,
          created_at,
          expires_at,
          vanish_on_read,
          sender_profile:profiles!messages_sender_id_fkey(username, display_name, profile_pic)
        `)
        .single();

      if (error) {
        console.error('[useConversations] Supabase message insert error:', error);
        
        const errorMessage = error.message?.includes('RLS') 
          ? 'You do not have permission to send messages to this conversation'
          : error.message?.includes('blocked')
          ? 'You cannot send messages to this user'
          : error.message || 'Failed to send message';
          
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive"
        });
        return false;
      }

      console.log('[useConversations] Message sent successfully:', data?.id);

      // If reply_to_id exists, fetch the reply_to message data and add to messages state immediately
      if (data && replyToId) {
        const { data: replyData } = await supabase
          .from('messages')
          .select('id, content, image_url, media_url, attachment_url, is_image, sender_profile:profiles!messages_sender_id_fkey(display_name)')
          .eq('id', replyToId)
          .single();

        const newMessage: Message = {
          ...data,
          reply_to: replyData || null
        };

        setMessages(prev => [...prev, newMessage]);
      } else if (data) {
        // Add message without reply data
        const newMessage: Message = {
          ...data,
          reply_to: null
        };
        setMessages(prev => [...prev, newMessage]);
      }

      return true;
    } catch (error: any) {
      console.error('[useConversations] Error sending message:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive"
      });
      return false;
    }
  };

  // Mark messages as read using RPC
  const markMessagesAsRead = async (conversationId: string) => {
    if (!currentUserId) return;

    try {
      await supabase.rpc('mark_messages_read', {
        p_conversation_id: conversationId
      });
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  // Get or create DM conversation
  const getOrCreateDM = async (otherUserId: string) => {
    if (!currentUserId) return null;

    try {
      const { data, error } = await supabase.rpc('get_or_create_dm', {
        p_user_a: currentUserId,
        p_user_b: otherUserId
      });

      if (error) throw error;

      return data;
    } catch (error: any) {
      console.error('Error creating/getting conversation:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create conversation",
        variant: "destructive"
      });
      return null;
    }
  };

  // Keep a ref to conversation IDs so the realtime callback isn't stale
  const conversationIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    conversationIdsRef.current = new Set(conversations.map(c => c.conversation_id));
  }, [conversations]);

  // Debounced version of fetchConversations to avoid rapid refetches
  const debouncedFetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedFetchConversations = () => {
    if (debouncedFetchRef.current) clearTimeout(debouncedFetchRef.current);
    debouncedFetchRef.current = setTimeout(() => {
      fetchConversations();
    }, 500);
  };

  // Set up real-time subscriptions
  useEffect(() => {
    if (!currentUserId) return;

    const messagesChannel = supabase
      .channel('messages-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const msgConvId = payload.new.conversation_id as string;
          
          // Skip if this message isn't in one of our conversations
          if (!conversationIdsRef.current.has(msgConvId)) {
            return;
          }

          // Refresh conversations to update last message and unread counts
          debouncedFetchConversations();
          
          // If it's for the active conversation, handle the new message
          if (activeConversationId && msgConvId === activeConversationId) {
            const newMsg = payload.new as any;
            
            // Skip if message was sent by current user (already added optimistically)
            if (newMsg.sender_id === currentUserId) {
              return;
            }
            
            // For messages from other users, fetch with full profile data
            const { data: msgData } = await supabase
              .from('messages')
              .select(`
                id, conversation_id, sender_id, content, attachment_url, image_url, media_url, is_image,
                is_gif, gif_url, is_sticker, sticker_url, sticker_id, sticker_set,
                audio_url, audio_duration, audio_mime, audio_size, audio_path,
                reply_to_id, created_at, expires_at, vanish_on_read, read, message_type, is_system,
                sender_profile:profiles!messages_sender_id_fkey(username, display_name, profile_pic)
              `)
              .eq('id', newMsg.id)
              .single();
            
            if (msgData) {
              // Skip if message is already expired
              if (msgData.expires_at && msgData.expires_at < new Date().toISOString()) {
                return;
              }

              let replyData = null;
              if (msgData.reply_to_id) {
                const { data: replyResult } = await supabase
                  .from('messages')
                  .select('id, content, image_url, media_url, attachment_url, is_image, sender_profile:profiles!messages_sender_id_fkey(display_name)')
                  .eq('id', msgData.reply_to_id)
                  .single();
                replyData = replyResult;
              }
              
              const fullMessage: Message = {
                ...msgData,
                reply_to: replyData
              };
              
              setMessages(prev => {
                if (prev.some(m => m.id === fullMessage.id)) {
                  return prev;
                }
                return [...prev, fullMessage];
              });
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversations',
        },
        () => {
          debouncedFetchConversations();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const deletedId = payload.old.id as string;
          setMessages(prev => prev.filter(m => m.id !== deletedId));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      if (debouncedFetchRef.current) clearTimeout(debouncedFetchRef.current);
    };
  }, [currentUserId, activeConversationId]);

  // Initial fetch
  useEffect(() => {
    if (currentUserId) {
      fetchConversations();
    }
  }, [currentUserId]);

  return {
    conversations,
    messages,
    loading,
    activeConversationId,
    setActiveConversationId,
    fetchMessages,
    sendMessage,
    markMessagesAsRead,
    getOrCreateDM,
    refetchConversations: fetchConversations
  };
};