import { useState, useEffect, useCallback } from 'react';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export interface SuggestedPerson {
  id: string;
  username: string;
  display_name: string;
  profile_pic: string | null;
  mutual_friends_count: number;
}

interface UsePeopleYouMayKnowReturn {
  suggestions: SuggestedPerson[];
  loading: boolean;
  error: string | null;
  removeSuggestion: (id: string) => void;
  sendFriendRequest: (personId: string) => Promise<boolean>;
  refetch: () => Promise<void>;
}

export const usePeopleYouMayKnow = (limit: number = 10): UsePeopleYouMayKnowReturn => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [suggestions, setSuggestions] = useState<SuggestedPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await gateway.rpc('get_people_you_may_know', {
        p_user_id: user.id,
        p_limit: limit
      });

      if (fetchError) {
        console.error('[usePeopleYouMayKnow] Error fetching suggestions:', fetchError);
        setError(fetchError.message);
        return;
      }

      setSuggestions(data || []);
    } catch (err: any) {
      console.error('[usePeopleYouMayKnow] Unexpected error:', err);
      setError(err.message || 'Failed to fetch suggestions');
    } finally {
      setLoading(false);
    }
  }, [user?.id, limit]);

  // Remove a suggestion from the list (optimistic UI update)
  const removeSuggestion = useCallback((id: string) => {
    setSuggestions((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Send a friend request and remove from suggestions
  const sendFriendRequest = useCallback(async (personId: string): Promise<boolean> => {
    if (!user?.id) return false;

    // Optimistically remove from UI
    removeSuggestion(personId);

    try {
      // Insert friendship request
      const { error: friendshipError } = await gateway
        .from('friends')
        .insert({
          requester_id: user.id,
          receiver_id: personId,
          status: 'pending'
        });

      if (friendshipError) {
        // Check if it's a duplicate key error (request already exists)
        if (friendshipError.code === '23505') {
          toast({
            title: 'Request already sent',
            description: 'You already have a pending friend request with this user.',
          });
          return true;
        }
        throw friendshipError;
      }

      // Also add to followers
      const { error: followError } = await gateway
        .from('followers')
        .insert({
          follower_id: user.id,
          following_id: personId
        });

      // Ignore duplicate key errors for followers
      if (followError && followError.code !== '23505') {
        console.warn('[usePeopleYouMayKnow] Follow error:', followError);
      }

      toast({
        title: 'Friend request sent',
        description: 'Your friend request has been sent successfully.',
      });

      return true;
    } catch (err: any) {
      console.error('[usePeopleYouMayKnow] Error sending friend request:', err);
      
      // Revert the optimistic update by refetching
      fetchSuggestions();
      
      toast({
        title: 'Error',
        description: 'Failed to send friend request. Please try again.',
        variant: 'destructive',
      });
      
      return false;
    }
  }, [user?.id, removeSuggestion, fetchSuggestions, toast]);

  // Fetch suggestions on mount (only once)
  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  return {
    suggestions,
    loading,
    error,
    removeSuggestion,
    sendFriendRequest,
    refetch: fetchSuggestions,
  };
};
