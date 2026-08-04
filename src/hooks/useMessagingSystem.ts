import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';
import { getOrCreateDM } from '@/api/conversations';

export type MessageSystemError = {
  code: string;
  message: string;
  details?: string;
};

export const useMessagingSystem = (currentUserId?: string) => {
  const { toast } = useToast();

  // Check if two users are friends
  const checkFriendship = async (userId1: string, userId2: string): Promise<boolean> => {
    try {
      const { data, error } = await gateway
        .from('friends')
        .select('id')
        .or(`and(requester_id.eq.${userId1},receiver_id.eq.${userId2}),and(requester_id.eq.${userId2},receiver_id.eq.${userId1})`)
        .eq('status', 'accepted')
        .maybeSingle();

      if (error) throw error;
      return !!data;
    } catch (error) {
      console.error('Error checking friendship:', error);
      return false;
    }
  };

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

      // Check if friends
      const areFriends = await checkFriendship(currentUserId, receiverId);

      if (areFriends) {
        // Send direct message - get or create conversation
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

        return { success: true, conversationId };
      } else {
        // Send message request
        const { data, error } = await gateway
          .from('message_requests')
          .insert({
            sender_id: currentUserId,
            receiver_id: receiverId,
            status: 'pending'
          })
          .select()
          .single();

        if (error) {
          console.error('Supabase message request error:', error);
          
          // Handle duplicate request
          if (error.code === '23505') {
            return {
              success: false,
              error: {
                code: 'DUPLICATE_REQUEST',
                message: 'You have already sent a message request to this user',
                details: 'Wait for them to respond to your previous request'
              }
            };
          }

          return {
            success: false,
            error: {
              code: error.code || 'REQUEST_FAILED',
              message: error.message || 'Failed to send message request',
              details: error.details
            }
          };
        }

        return { success: true };
      }
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

  // Accept message request and create conversation
  const acceptMessageRequest = async (
    requestId: string, 
    senderId: string
  ): Promise<{ success: boolean; error?: MessageSystemError; conversationId?: string }> => {
    if (!currentUserId) {
      return { 
        success: false, 
        error: { code: 'AUTH_REQUIRED', message: 'You must be logged in' }
      };
    }

    try {
      // Update request status
      const { error: updateError } = await gateway
        .from('message_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId);

      if (updateError) throw updateError;

      // Create conversation
      const conversationId = await getOrCreateConversation(currentUserId, senderId);
      if (!conversationId) {
        return {
          success: false,
          error: { code: 'CONVERSATION_FAILED', message: 'Failed to create conversation' }
        };
      }

      return { success: true, conversationId };
    } catch (error: any) {
      console.error('Error accepting message request:', error);
      return {
        success: false,
        error: {
          code: error.code || 'ACCEPT_FAILED',
          message: error.message || 'Failed to accept message request',
          details: error.details
        }
      };
    }
  };

  // Decline message request
  const declineMessageRequest = async (
    requestId: string
  ): Promise<{ success: boolean; error?: MessageSystemError }> => {
    try {
      const { error } = await gateway
        .from('message_requests')
        .update({ status: 'declined' })
        .eq('id', requestId);

      if (error) throw error;
      return { success: true };
    } catch (error: any) {
      console.error('Error declining message request:', error);
      return {
        success: false,
        error: {
          code: error.code || 'DECLINE_FAILED',
          message: error.message || 'Failed to decline message request',
          details: error.details
        }
      };
    }
  };

  // Block user and decline request
  const blockUserAndDeclineRequest = async (
    requestId: string,
    senderId: string
  ): Promise<{ success: boolean; error?: MessageSystemError }> => {
    if (!currentUserId) {
      return { 
        success: false, 
        error: { code: 'AUTH_REQUIRED', message: 'You must be logged in' }
      };
    }

    try {
      // Update request to blocked
      const { error: requestError } = await gateway
        .from('message_requests')
        .update({ status: 'blocked' })
        .eq('id', requestId);

      if (requestError) throw requestError;

      // Block via RPC (uses blocks table)
      const { error: blockError } = await gateway.rpc('block_user', {
        p_blocker: currentUserId,
        p_blocked: senderId,
        p_block_type: 'full'
      });

      if (blockError) throw blockError;

      return { success: true };
    } catch (error: any) {
      console.error('Error blocking user:', error);
      return {
        success: false,
        error: {
          code: error.code || 'BLOCK_FAILED',
          message: error.message || 'Failed to block user',
          details: error.details
        }
      };
    }
  };

  // Send GIF message
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

      // Check if friends
      const areFriends = await checkFriendship(currentUserId, receiverId);

      if (areFriends) {
        // Send GIF message - get or create conversation
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

        return { success: true, conversationId };
      } else {
        // For now, don't allow GIF requests to non-friends
        return {
          success: false,
          error: {
            code: 'NOT_FRIENDS',
            message: 'You can only send GIFs to friends',
            details: 'Send a text message request first'
          }
        };
      }
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
      acceptMessageRequest,
      declineMessageRequest,
      blockUserAndDeclineRequest,
      checkFriendship,
      checkIfBlocked,
      getOrCreateConversation
    };
};