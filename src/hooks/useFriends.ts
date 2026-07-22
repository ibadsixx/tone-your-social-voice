import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';

interface Friend {
  id: string;
  display_name: string;
  username: string;
  profile_pic: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
}

export const useFriends = (userId?: string) => {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchFriends = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.debug('[useFriends] Fetching friends for user:', userId);
      
      const { data, error } = await gateway
        .from('friends')
        .select(`
          *,
          requester_profile:profiles!friends_requester_id_fkey(id, username, display_name, profile_pic),
          receiver_profile:profiles!friends_receiver_id_fkey(id, username, display_name, profile_pic)
        `)
        .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
        .eq('status', 'accepted');

      if (error) {
        console.error('[useFriends] Supabase error:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw error;
      }

      console.debug('[useFriends] Raw data received:', data?.length || 0, 'friendships');

      // Transform data to get the friend's profile (not the current user's)
      const friendsList = data?.map((friendship: any) => {
        const isRequester = friendship.requester_id === userId;
        const friendProfile = isRequester ? friendship.receiver_profile : friendship.requester_profile;
        
        // Validate that we have a valid profile
        if (!friendProfile || !friendProfile.id) {
          console.warn('[useFriends] Missing profile data for friendship:', friendship.id);
          return null;
        }
        
        return {
          id: friendProfile.id,
          display_name: friendProfile.display_name || 'Unknown User',
          username: friendProfile.username || 'unknown',
          profile_pic: friendProfile.profile_pic,
          status: friendship.status,
          created_at: friendship.created_at
        };
      }).filter(Boolean) || []; // Remove any null entries

      console.debug('[useFriends] Processed friends:', friendsList.length);
      setFriends(friendsList);
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error occurred';
      const errorDetails = error?.details || error?.hint || '';
      
      console.error('[useFriends] Failed to fetch friends:', {
        error,
        message: errorMessage,
        details: errorDetails
      });
      
      toast({
        title: 'Error',
        description: `Failed to load friends: ${errorMessage}${errorDetails ? ` (${errorDetails})` : ''}`,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFriends();
  }, [userId]);

  return {
    friends,
    loading,
    refetch: fetchFriends
  };
};