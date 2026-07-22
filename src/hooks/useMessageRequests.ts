import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';

type MessageRequest = {
  id: string;
  sender_id: string;
  receiver_id: string;
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
  const fetchRequests = async () => {
    if (!currentUserId) return;

    try {
      const { data, error } = await gateway
        .from('message_requests')
        .select(`
          *,
          sender_profile:profiles!message_requests_sender_id_fkey(username, display_name, profile_pic)
        `)
        .eq('receiver_id', currentUserId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setRequests(data || []);
    } catch (error: any) {
      console.error('Error fetching message requests:', error);
      toast({
        title: "Error",
        description: "Failed to fetch message requests",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchMutualFriendsCount = async (otherUserId: string) => {
    if (!currentUserId) return 0;
    try {
      const { data } = await gateway.rpc('get_mutual_friends_count', {
        user_a: currentUserId,
        user_b: otherUserId
      });
      return data || 0;
    } catch {
      return 0;
    }
  };

  // Accept a message request
  const acceptRequest = async (requestId: string, senderId: string) => {
    if (!currentUserId) return false;

    try {
      // Update request status to accepted
      const { error: updateError } = await gateway
        .from('message_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId);

      if (updateError) throw updateError;

      // Create or get DM conversation
      const conversationId = await gateway.rpc('get_or_create_dm', {
        p_user_a: currentUserId,
        p_user_b: senderId
      });

      if (!conversationId) throw new Error('Failed to create conversation');

      // Remove the request from local state
      setRequests(prev => prev.filter(req => req.id !== requestId));

      toast({
        title: "Request accepted",
        description: "You can now message each other",
      });

      return true;
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
      const { error } = await gateway
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
      const { error } = await gateway
        .from('message_requests')
        .insert({
          sender_id: currentUserId,
          receiver_id: receiverId,
          status: 'pending'
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

    const channel = gateway
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
      gateway.removeChannel(channel);
    };
  }, [currentUserId]);

  // Initial fetch
  useEffect(() => {
    if (currentUserId) {
      fetchRequests();
    }
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