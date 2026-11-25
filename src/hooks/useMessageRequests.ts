import { useState, useEffect } from 'react';
import { dataClient } from '@/lib/supabase/dataClient';
import { useToast } from '@/hooks/use-toast';
import { createNotification } from '@/hooks/useNotifications';
import { resolveSharedDmConversation } from '@/api/conversations';
import { determineMessageRequestCategory } from '@/lib/messageRequests';

type MessageRequest = {
  id: string;
  sender_id: string;
  receiver_id: string;
  conversation_id?: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  category: 'you_may_know' | 'spam';
  created_at: string;
  updated_at: string;
  sender_profile: {
    username: string;
    display_name: string;
    profile_pic?: string;
  };
  mutual_friends_count?: number;
};

export const useMessageRequests = (currentUserId?: string) => {
  const [requests, setRequests] = useState<MessageRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Fetch incoming message requests
  const fetchRequests = async (silent = false) => {
    if (!currentUserId) return;

    try {
      const { data, error } = await dataClient
        .from('message_requests')
        .select(`
          *,
          sender_profile:profiles!message_requests_sender_id_fkey(username, display_name, profile_pic)
        `)
        .eq('receiver_id', currentUserId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // TRACE: recipient Pending read (point 6)
      console.debug('[trace:recipient-pending]', {
        viewer_user_id: currentUserId,
        returned_request_count: (data || []).length,
        returned_request_ids: (data || []).map(r => r.id),
        returned_senders: (data || []).map(r => r.sender_id),
        returned_conversation_ids: (data || []).map(r => r.conversation_id ?? null),
        returned_statuses: (data || []).map(r => r.status),
      });

      setRequests(data || []);
    } catch (error: any) {
      console.error('Error fetching message requests:', error);
      if (!silent) {
        toast({
          title: "Error",
          description: "Failed to fetch message requests",
          variant: "destructive"
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchMutualFriendsCount = async (otherUserId: string) => {
    if (!currentUserId) return 0;
    try {
      const { data } = await dataClient.rpc('get_mutual_friends_count', {
        user_a: currentUserId,
        user_b: otherUserId
      });
      return data || 0;
    } catch {
      return 0;
    }
  };

  // Accept a message request. The conversation ALREADY exists (it was created
  // when the sender pressed Message), so accepting MUST NOT create a new one —
  // it only flips the request status to accepted and resolves the EXISTING DM
  // via the table-based find-only resolver (never a create). Stay on the SAME
  // conversation_id so history/participants/messages are all preserved and the
  // sender's side is never duplicated. Returns the conversationId so the UI can
  // open the chat immediately.
  const acceptRequest = async (requestId: string, senderId: string) => {
    if (!currentUserId) return false;

    try {
      // Update request status to accepted
      const { error: updateError } = await dataClient
        .from('message_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId);

      if (updateError) throw updateError;

      // Resolve the existing DM conversation — find-only, NO create. If the
      // shared DM can't be found something is inconsistent; do not fabricate a
      // new conversation (the sender always created it before the request).
      const { data: conversationId, error: dmError } = await resolveSharedDmConversation(currentUserId, senderId);
      if (dmError) throw dmError;
      if (!conversationId) {
        console.error('[acceptRequest] No shared DM found when accepting request', { requestId, senderId });
        throw new Error('Conversation not found while accepting request');
      }

      // Remove the request from local state
      setRequests(prev => prev.filter(req => req.id !== requestId));

      toast({
        title: "Request accepted",
        description: "You can now message each other",
      });

      return conversationId;
    } catch (error: any) {
      console.error('Error accepting request:', error);
      toast({
        title: "Error",
        description: "Failed to accept message request",
        variant: "destructive"
      });
      return false;
    }
  };

  // Decline a message request
  const declineRequest = async (requestId: string) => {
    try {
      const { error } = await dataClient
        .from('message_requests')
        .update({ status: 'declined' })
        .eq('id', requestId);

      if (error) {
        console.error('Supabase decline error:', error);
        throw error;
      }

      setRequests(prev => prev.filter(req => req.id !== requestId));

      toast({
        title: "Request declined",
        description: "The message request has been declined",
      });

      return true;
    } catch (error: any) {
      console.error('Error declining request:', error);
      const errorMessage = error.message?.includes('RLS') 
        ? 'You do not have permission to decline this request'
        : error.message || 'Failed to decline message request';
        
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      return false;
    }
  };

  // Block a user and decline the request
  const blockUser = async (requestId: string, senderId: string) => {
    if (!currentUserId) return false;

    try {
      // Update request status to blocked
      const { error: requestError } = await dataClient
        .from('message_requests')
        .update({ status: 'blocked' })
        .eq('id', requestId);

      if (requestError) throw requestError;

      // Block via RPC (uses blocks table)
      const { error: blockError } = await dataClient.rpc('block_user', {
        p_blocker: currentUserId,
        p_blocked: senderId,
        p_block_type: 'full'
      });

      if (blockError) throw blockError;

      setRequests(prev => prev.filter(req => req.id !== requestId));

      toast({
        title: "User blocked",
        description: "The user has been blocked and cannot send you messages",
      });

      return true;
    } catch (error: any) {
      console.error('Error blocking user:', error);
      toast({
        title: "Error",
        description: "Failed to block user",
        variant: "destructive"
      });
      return false;
    }
  };

  // Send a message request
  const sendRequest = async (receiverId: string) => {
    if (!currentUserId) return false;

    try {
      const category = await determineMessageRequestCategory(currentUserId, receiverId);

      const { error } = await dataClient
        .from('message_requests')
        .insert({
          sender_id: currentUserId,
          receiver_id: receiverId,
          status: 'pending',
          category
        });

      if (error) {
        console.error('Supabase send request error:', error);
        
        if (error.code === '23505') {
          toast({
            title: "Request already sent",
            description: "You have already sent a message request to this user",
            variant: "destructive"
          });
          return false;
        }
        
        throw error;
      }

      toast({
        title: "Request sent",
        description: "Your message request has been sent",
      });

      createNotification({
        userId: receiverId,
        actorId: currentUserId,
        type: 'message_request',
        message: 'sent you a message request'
      });

      return true;
    } catch (error: any) {
      console.error('Error sending request:', error);
      const errorMessage = error.message?.includes('blocked') 
        ? 'You cannot send a message request to this user'
        : error.message?.includes('RLS')
        ? 'You do not have permission to send this request'
        : error.message || 'Failed to send message request';
        
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      return false;
    }
  };

  // Set up real-time subscriptions
  useEffect(() => {
    if (!currentUserId) return;

    const channel = dataClient
      .channel('message-requests-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_requests',
          filter: `receiver_id=eq.${currentUserId}`
        },
        () => {
          fetchRequests();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'message_requests',
          filter: `receiver_id=eq.${currentUserId}`
        },
        () => {
          fetchRequests();
        }
      )
      .subscribe();

    return () => {
      dataClient.removeChannel(channel);
    };
  }, [currentUserId]);

  // Initial fetch
  useEffect(() => {
    if (currentUserId) {
      fetchRequests();
    }
  }, [currentUserId]);

  // Poll fallback: realtime postgres_changes events are unreliable in this
  // stack (see docs findings), so silently refresh so an incoming first
  // message from a non-friend surfaces its Accept / Delete / Block request
  // without a manual reload.
  useEffect(() => {
    if (!currentUserId) return;

    const refresh = () => {
      if (document.visibilityState === 'visible') fetchRequests(true);
    };
    refresh();
    const interval = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [currentUserId]);

  // Filter requests by category
  const youMayKnowRequests = requests.filter(req => req.category === 'you_may_know');
  const spamRequests = requests.filter(req => req.category === 'spam');

  return {
    requests,
    youMayKnowRequests,
    spamRequests,
    loading,
    acceptRequest,
    declineRequest,
    blockUser,
    sendRequest,
    refetchRequests: fetchRequests,
    fetchMutualFriendsCount
  };
};