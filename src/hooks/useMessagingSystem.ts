import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';
import { getOrCreateDM } from '@/api/conversations';
import { ensureMessageRequest, hasAcceptedFriendship } from '@/lib/messageRequests';

export type MessageSystemError = {
  code: string;
  message: string;
  details?: string;
};

export const useMessagingSystem = (currentUserId?: string) => {
  const { toast } = useToast();

  // Check if two users are friends (shared data-layer helper — "existing friends
  // -> normal chat, NO message request")
  const checkFriendship = (userId1: string, userId2: string): Promise<boolean> =>
    hasAcceptedFriendship(userId1, userId2);

  // Check if user is blocked
  const checkIfBlocked = async (userId1: string, userId2: string): Promise<boolean> => {
    try {
      const { data, error } = await gateway.rpc('is_blocked', {
        user1_id: userId1,
        user2_id: userId2
      });

      if (error) throw error;
      return !!data;
    } catch (error) {
      console.error('Error checking if blocked:', error);
      return false;
    }
  };

  // Send message with proper friend/request logic
  const sendMessage = async (
    receiverId: string, 
    content?: string, 
    mediaUrl?: string
  ): Promise<{ success: boolean; error?: MessageSystemError; conversationId?: string }> => {
    if (!currentUserId) {
      return { 
        success: false, 
        error: { code: 'AUTH_REQUIRED', message: 'You must be logged in to send messages' }
      };
    }

    if (!content?.trim() && !mediaUrl) {
      return { 
        success: false, 
        error: { code: 'EMPTY_MESSAGE', message: 'Message cannot be empty' }
      };
    }

    try {
      // The block check and the friendship check read different tables and neither
      // depends on the other, so they were two round trips in a row before the
      // conversation was even looked up. Run them together; both decisions are
      // still applied in the same order below.
      const [isBlocked, areFriends] = await Promise.all([
        checkIfBlocked(currentUserId, receiverId),
        // (no longer blocks messaging — only decides whether the recipient sees
        // this as a plain DM or as a "message request" they can Accept / Delete /
        // Block)
        checkFriendship(currentUserId, receiverId),
      ]);

      if (isBlocked) {
        return {
          success: false,
          error: { 
            code: 'USER_BLOCKED', 
            message: 'You cannot send messages to this user',
            details: 'Either you have blocked this user or they have blocked you'
          }
        };
      }

      // Always open/create a conversation and send the first message, for friends
      // and non-friends alike. For non-friends a pending message_requests row is
      // also retained so the recipient still gets the Message Request/New Message
      // UX (Accept / Delete / Block) — the request is a state of the first message,
      // not a replacement for creating the conversation.
      const conversationId = await getOrCreateConversation(currentUserId, receiverId);
      if (!conversationId) {
        return {
          success: false,
          error: { code: 'CONVERSATION_FAILED', message: 'Failed to create conversation' }
        };
      }

      const { data, error } = await gateway
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: currentUserId,
          receiver_id: receiverId,
          content: content?.trim() || null,
          attachment_url: mediaUrl || null
        })
        .select()
        .single();

      if (error) {
        console.error('Supabase message error:', error);
        return {
          success: false,
          error: {
            code: error.code || 'SEND_FAILED',
            message: error.message || 'Failed to send message',
            details: error.details
          }
        };
      }

      if (!areFriends) {
        // Retain the message request so the recipient can Accept / Delete / Block.
        // The Maybe-you-know / Spam category is computed client-side via
        // ensureMessageRequest (same semantics as the existing classifier), and
        // duplicates (existing pending/declined) are tolerated — the
        // conversation + message are the primary outcome now.
        await ensureMessageRequest({
          senderId: currentUserId,
          receiverId,
          conversationId
        });
      }

      return { success: true, conversationId };
    } catch (error: any) {
      console.error('Unexpected messaging error:', error);
      return {
        success: false,
        error: {
          code: 'UNEXPECTED_ERROR',
          message: 'An unexpected error occurred',
          details: error.message
        }
      };
    }
  };

  // Get or create conversation between two users
  const getOrCreateConversation = async (userA: string, userB: string): Promise<string | null> => {
    try {
      const { data, error } = await getOrCreateDM(userA, userB);

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting/creating conversation:', error);
      return null;
    }
  };

  // Send gif message
  const sendGifMessage = async (
    receiverId: string,
    gifId: string,
    gifUrl: string
  ): Promise<{ success: boolean; error?: MessageSystemError; conversationId?: string }> => {
    if (!currentUserId) {
      return { 
        success: false, 
        error: { code: 'AUTH_REQUIRED', message: 'You must be logged in to send messages' }
      };
    }

    try {
      // Check if blocked
      const isBlocked = await checkIfBlocked(currentUserId, receiverId);
      if (isBlocked) {
        return {
          success: false,
          error: { 
            code: 'USER_BLOCKED', 
            message: 'You cannot send messages to this user',
            details: 'Either you have blocked this user or they have blocked you'
          }
        };
      }

      // Check if friends (does not block — only whether recipient sees it as a request)
      const areFriends = await checkFriendship(currentUserId, receiverId);

      // Always open/create a conversation and send the GIF, friends or not.
      const conversationId = await getOrCreateConversation(currentUserId, receiverId);
      if (!conversationId) {
        return {
          success: false,
          error: { code: 'CONVERSATION_FAILED', message: 'Failed to create conversation' }
        };
      }

      const { data, error } = await gateway
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: currentUserId,
          receiver_id: receiverId,
          gif_id: gifId,
          gif_url: gifUrl,
          is_gif: true
        })
        .select()
        .single();

      if (error) {
        console.error('Supabase GIF message error:', error);
        return {
          success: false,
          error: {
            code: error.code || 'SEND_FAILED',
            message: error.message || 'Failed to send GIF',
            details: error.details
          }
        };
      }

      if (!areFriends) {
        await ensureMessageRequest({
          senderId: currentUserId,
          receiverId,
          conversationId
        });
      }

      return { success: true, conversationId };
    } catch (error: any) {
      console.error('Unexpected GIF messaging error:', error);
      return {
        success: false,
        error: {
          code: 'UNEXPECTED_ERROR',
          message: 'An unexpected error occurred',
          details: error.message
        }
      };
    }
  };

  return {
      sendMessage,
      sendGifMessage,
      checkFriendship,
      checkIfBlocked,
      getOrCreateConversation
    };
};