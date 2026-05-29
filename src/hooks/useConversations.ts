import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { initConversationEncryption, decryptContent, isEncryptionReady } from '@/lib/conversationEncryption';
import { loadEcdhPrivateKey } from '@/hooks/useEncryptionKeys';

async function tryDecryptMessage(msg: Message, convId: string): Promise<Message> {
  if (msg.encrypted_content && msg.encryption_iv) {
    const decrypted = await decryptContent(convId, msg.encrypted_content, msg.encryption_iv);
    if (decrypted !== null) {
      return { ...msg, content: decrypted, encrypted_content: undefined, encryption_iv: undefined };
    }
  }
  return msg;
}

type Conversation = {
  conversation_id: string;
  type: string;
  name?: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
  other_user?: {
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
  message_type?: 'text' | 'image' | 'gif' | 'sticker' | 'audio' | 'video' | 'file' | 'poll';
  is_system?: boolean;
  created_at: string;
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
  encrypted_content?: string;
  encryption_iv?: string;
  seen?: boolean;
  delivered?: boolean;
};

type ConversationInfoRow = {
  conversation_id: string;
  type: string;
  conversation_name?: string;
  conversation_description?: string | null;
  created_at: string;
  updated_at: string;
  other_user_id: string;
  other_user_username: string;
  other_user_display_name: string;
  other_user_profile_pic?: string;
  last_message_content?: string;
  last_message_created_at?: string;
  unread_count: number;
};

type NewMessagePayload = {
  id: string;
  conversation_id: string;
  sender_id: string;
};

type MessageRow = {
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
  reply_to_id?: string;
  delivered_at?: string;
  created_at: string;
  message_type?: string;
  is_system?: boolean;
  sender_profile: {
    username: string;
    display_name: string;
    profile_pic?: string;
  } | null;
};

export const useConversations = (currentUserId?: string) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [firstUnreadIndex, setFirstUnreadIndex] = useState<number>(-1);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const { toast } = useToast();

  // Fetch conversations using the new RPC
  const fetchConversations = useCallback(async () => {
    if (!currentUserId) return;

    try {
      const { data, error } = await supabase.rpc('get_conversations_with_info', {
        p_user_id: currentUserId
      });

      if (error) throw error;

      const formattedConversations: Conversation[] = data?.map((conv: ConversationInfoRow) => ({
        conversation_id: conv.conversation_id,
        type: conv.type,
        name: conv.conversation_name || undefined,
        description: conv.conversation_description,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        other_user: conv.type === 'channel' ? undefined : {
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
      const otherUserIds = formattedConversations
        .filter(c => c.other_user?.id)
        .map(c => c.other_user!.id);
      if (otherUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, last_seen_at')
          .in('id', otherUserIds);
        if (profiles) {
          const lastSeenMap = new Map(profiles.map(p => [p.id, p.last_seen_at]));
          formattedConversations.forEach(conv => {
            if (conv.other_user) {
              conv.other_user.last_seen_at = lastSeenMap.get(conv.other_user.id) || undefined;
            }
          });
        }
      }

      setConversations(formattedConversations);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      toast({
        title: "Error",
        description: "Failed to fetch conversations",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [currentUserId, toast]);

  // Initialize E2EE for the active conversation
  const initEncryption = useCallback(async (convId: string) => {
    if (!currentUserId) return;
    try {
      const ecdhPrivKey = await loadEcdhPrivateKey();
      if (!ecdhPrivKey) return;
      await initConversationEncryption(convId, currentUserId, ecdhPrivKey);
    } catch {
      // Encryption not available — messages fall back to plaintext
    }
  }, [currentUserId]);

  useEffect(() => {
    if (activeConversationId && currentUserId) {
      initEncryption(activeConversationId);
    }
  }, [activeConversationId, currentUserId, initEncryption]);

  // Fetch messages for a specific conversation
  const fetchMessages = async (conversationId: string, page = 0, limit = 50) => {
    if (!currentUserId) {
      return;
    }

    try {
      // Fetch messages with sender profile using explicit foreign key hint
      const { data, error } = await supabase
        .from('messages')
        .select(`
          id,
          conversation_id,
          sender_id,
          content,
          encrypted_content,
          encryption_iv,
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
          message_type,
          is_system,
          sender_profile:profiles!messages_sender_id_fkey(username, display_name, profile_pic)
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);

      if (error) {
        console.error('[useConversations] Supabase messages error:', error);
        throw error;
      }

      // Filter out messages cleared by this user (soft-delete)
      let clearedAt: string | null = null;
      if (data && data.length > 0) {
        const { data: clearRecord } = await supabase
          .from('conversation_clears')
          .select('cleared_at')
          .eq('user_id', currentUserId)
          .eq('conversation_id', conversationId)
          .maybeSingle();
        if (clearRecord) {
          clearedAt = clearRecord.cleared_at;
        }
      }

      // Format messages (reverse to show oldest first)
      const formattedMessages: Message[] = await Promise.all(
        (data?.reverse() || [])
          .filter(msg => !clearedAt || msg.created_at >= clearedAt)
          .map(async (msg: MessageRow) => {
          const base = {
            ...msg,
            reply_to: null,
            seen: false,
            delivered: !!msg.delivered_at
          };
          return tryDecryptMessage(base, conversationId);
        })
      );

      // Determine if more messages can be loaded
      const rawCount = data?.length || 0;
      setHasMoreMessages(rawCount >= limit && formattedMessages.length > 0);

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

      if (page === 0) {
        setHasMoreMessages(true);
        setMessages(formattedMessages);

        // Determine which messages have been read by other participants
        const { data: readData } = await supabase
          .rpc('get_message_read_status', { p_conversation_id: conversationId });
        if (readData && readData.length > 0) {
          const seenIds = new Set(readData.map(r => r.message_id));
          setMessages(prev => prev.map(msg => {
            if (msg.sender_id === currentUserId && seenIds.has(msg.id)) {
              return { ...msg, seen: true };
            }
            return msg;
          }));
        }

        // Compute the boundary between already-read and new messages
        const messageIds = formattedMessages.map(m => m.id);
        if (messageIds.length > 0) {
          const { data: myReads } = await supabase
            .rpc('get_my_read_message_ids', { p_message_ids: messageIds });
          if (myReads && myReads.length > 0) {
            const readSet = new Set(myReads.map(r => r.message_id));
            const idx = formattedMessages.findIndex(m => !readSet.has(m.id));
            setFirstUnreadIndex(idx);
          } else {
            setFirstUnreadIndex(0);
          }
        }
      } else {
        setMessages(prev => [...formattedMessages, ...prev]);
      }

      // Mark messages as read
      await markMessagesAsRead(conversationId);
    } catch (error) {
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

    let encryptedContent: string | undefined;
    let encryptionIv: string | undefined;

    const isText = !isImage && !isVideo;
    if (isText && content) {
      const encResult = isEncryptionReady(conversationId)
        ? await import('@/lib/conversationEncryption').then(m => m.encryptContent(conversationId, content))
        : null;
      if (encResult) {
        encryptedContent = encResult.encryptedContent;
        encryptionIv = encResult.iv;
      }
    }

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: currentUserId,
          content: encryptedContent ? null : (isImage || isVideo ? (content || null) : content),
          encrypted_content: encryptedContent || null,
          encryption_iv: encryptionIv || null,
          attachment_url: attachmentUrl,
          image_url: isImage ? attachmentUrl : null,
          media_url: isVideo ? attachmentUrl : null,
          is_image: Boolean(isImage),
          message_type: isVideo ? 'video' : isImage ? 'image' : 'text',
          reply_to_id: replyToId || null
        } as Record<string, unknown>)
        .select(`
          id,
          conversation_id,
          sender_id,
          content,
          encrypted_content,
          encryption_iv,
          attachment_url,
          image_url,
          media_url,
          is_image,
          message_type,
          reply_to_id,
          created_at,
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

      // If reply_to_id exists, fetch the reply_to message data and add to messages state immediately
      if (data && replyToId) {
        const { data: replyData } = await supabase
          .from('messages')
          .select('id, content, image_url, media_url, attachment_url, is_image, sender_profile:profiles!messages_sender_id_fkey(display_name)')
          .eq('id', replyToId)
          .single();

        const newMessage: Message = {
          ...data,
          reply_to: replyData || null,
          seen: false,
          delivered: false
        };

        setMessages(prev => [...prev, newMessage]);
      } else if (data) {
        // Add message without reply data
        const newMessage: Message = {
          ...data,
          reply_to: null,
          seen: false,
          delivered: false
        };
        setMessages(prev => [...prev, newMessage]);
      }

      return true;
    } catch (error) {
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
    } catch (error) {
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

  // Keep a ref to messages so the realtime callback can update seen status
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Keep a ref to conversations so the presence refresh interval isn't stale
  const conversationsDataRef = useRef<Conversation[]>([]);
  useEffect(() => {
    conversationsDataRef.current = conversations;
  }, [conversations]);

  // Debounced version of fetchConversations to avoid rapid refetches
  const debouncedFetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedFetchConversations = useCallback(() => {
    if (debouncedFetchRef.current) clearTimeout(debouncedFetchRef.current);
    debouncedFetchRef.current = setTimeout(() => {
      fetchConversations();
    }, 500);
  }, [fetchConversations]);

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
            const newMsg = payload.new as NewMessagePayload;
            
            // Skip if message was sent by current user (already added optimistically)
            if (newMsg.sender_id === currentUserId) {
              return;
            }
            
            // For messages from other users, fetch with full profile data
            const { data: msgData } = await supabase
              .from('messages')
              .select(`
                id, conversation_id, sender_id, content, encrypted_content, encryption_iv,
                attachment_url, image_url, media_url, is_image,
                is_gif, gif_url, is_sticker, sticker_url, sticker_id, sticker_set,
                audio_url, audio_duration, audio_mime, audio_size, audio_path,
                reply_to_id, created_at, message_type, is_system,
                sender_profile:profiles!messages_sender_id_fkey(username, display_name, profile_pic)
              `)
              .eq('id', newMsg.id)
              .single();
            
            if (msgData) {
              // Acknowledge delivery to the sender
              supabase.rpc('mark_message_delivered', { p_message_id: msgData.id })
                .catch(() => {});
              
              let replyData = null;
              if (msgData.reply_to_id) {
                const { data: replyResult } = await supabase
                  .from('messages')
                  .select('id, content, image_url, media_url, attachment_url, is_image, sender_profile:profiles!messages_sender_id_fkey(display_name)')
                  .eq('id', msgData.reply_to_id)
                  .single();
                replyData = replyResult;
              }
              
              const plainMessage = await tryDecryptMessage(msgData as Message, msgConvId);
              const fullMessage: Message = {
                ...plainMessage,
                reply_to: replyData,
                seen: false,
                delivered: !!msgData.delivered_at
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
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const updated = payload.new as {
            id: string;
            delivered_at?: string;
            sender_id: string;
            conversation_id: string;
          };
          if (
            updated.delivered_at &&
            updated.sender_id === currentUserId &&
            conversationIdsRef.current.has(updated.conversation_id)
          ) {
            setMessages(prev => prev.map(m =>
              m.id === updated.id ? { ...m, delivered: true } : m
            ));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reads',
        },
        (payload) => {
          const { message_id, user_id } = payload.new as { message_id: string; user_id: string };
          if (user_id === currentUserId) return;
          if (messagesRef.current.some(m => m.id === message_id)) {
            setMessages(prev => prev.map(m =>
              m.id === message_id ? { ...m, seen: true } : m
            ));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      if (debouncedFetchRef.current) clearTimeout(debouncedFetchRef.current);
    };
  }, [currentUserId, activeConversationId, debouncedFetchConversations]);

  // Initial fetch
  useEffect(() => {
    if (currentUserId) {
      fetchConversations();
    }
  }, [currentUserId, fetchConversations]);

  // Refresh conversations when user returns to the tab (handles stale unread counts after navigation)
  useEffect(() => {
    if (!currentUserId) return;
    const handleVisibility = () => {
      if (!document.hidden) {
        fetchConversations();
      }
    };
    const handleFocus = () => {
      fetchConversations();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [currentUserId, fetchConversations]);

  // Periodically refresh conversation partners' online presence (matches usePresence 30s interval)
  useEffect(() => {
    if (!currentUserId) return;

    const refreshPresence = async () => {
      const allConvs = conversationsDataRef.current;
      if (allConvs.length === 0) return;

      const userIds = [...new Set(allConvs.map(c => c.other_user?.id).filter(Boolean))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, last_seen_at')
        .in('id', userIds);

      if (profiles) {
        const lastSeenMap = new Map(profiles.map(p => [p.id, p.last_seen_at]));
        setConversations(prev => prev.map(conv => {
          if (!conv.other_user) return conv;
          const newLastSeen = lastSeenMap.get(conv.other_user.id);
          if (!newLastSeen || newLastSeen === conv.other_user.last_seen_at) return conv;
          return {
            ...conv,
            other_user: {
              ...conv.other_user,
              last_seen_at: newLastSeen,
            }
          };
        }));
      }
    };

    const initialRefresh = setTimeout(refreshPresence, 2000);
    const interval = setInterval(refreshPresence, 30000);

    return () => {
      clearTimeout(initialRefresh);
      clearInterval(interval);
    };
  }, [currentUserId]);

  return {
    conversations,
    messages,
    firstUnreadIndex,
    hasMoreMessages,
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