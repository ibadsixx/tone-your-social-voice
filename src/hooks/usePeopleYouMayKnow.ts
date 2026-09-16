import { useState, useEffect, useCallback } from 'react';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { FRIEND_REQUEST_SENT_EVENT } from '@/hooks/useFriendship';

export interface SuggestedPerson {
  id: string;
  username: string;
  display_name: string;
  profile_pic: string | null;
  mutual_friends_count: number;
  mutual_groups_count: number;
  mutual_followers_count: number;
  same_college?: boolean;
  same_company?: boolean;
  same_high_school?: boolean;
  same_city?: boolean;
  score?: number;
}

interface UsePeopleYouMayKnowReturn {
  suggestions: SuggestedPerson[];
  loading: boolean;
  error: string | null;
  removeSuggestion: (id: string) => void;
  sendFriendRequest: (personId: string) => Promise<boolean>;
  refetch: () => Promise<void>;
}

interface RpcSuggestionRow {
  id: string;
  username: string | null;
  display_name: string | null;
  profile_pic: string | null;
  mutual_friends_count: number;
  mutual_groups_count: number;
  mutual_followers_count: number;
  same_college?: boolean;
  same_company?: boolean;
  same_high_school?: boolean;
  same_city?: boolean;
  score?: number;
}

export const usePeopleYouMayKnow = (limit: number = 10): UsePeopleYouMayKnowReturn => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [suggestions, setSuggestions] = useState<SuggestedPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    if (!user?.id) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Recommendations are computed server-side by the gateway
      // (features/peopleYouMayKnow.ts): mutual accepted friends, shared groups,
      // follow relationships, privacy/block/opt-out filtering, scoring,
      // diversity and the limit are all decided there — the browser never
      // fetches a full user/profile table.
      const { data, error: rpcError } = await gateway.rpc('get_people_you_may_know', {
        p_user_id: user.id,
        p_limit: limit,
      });

      if (rpcError) throw new Error(rpcError.message);

      const rows = (data ?? []) as RpcSuggestionRow[];
      const list: SuggestedPerson[] = rows.map((r) => ({
        id: r.id,
        username: r.username || '',
        display_name: r.display_name || r.username || 'Tone User',
        profile_pic: r.profile_pic || null,
        mutual_friends_count: Number(r.mutual_friends_count ?? 0),
        mutual_groups_count: Number(r.mutual_groups_count ?? 0),
        mutual_followers_count: Number(r.mutual_followers_count ?? 0),
        same_college: !!r.same_college,
        same_company: !!r.same_company,
        same_high_school: !!r.same_high_school,
        same_city: !!r.same_city,
        score: typeof r.score === 'number' ? r.score : undefined,
      }));

      setSuggestions(list);
    } catch (err) {
      const message = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Failed to fetch suggestions';
      console.error('[usePeopleYouMayKnow] Unexpected error:', err);
      setError(message);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, limit]);

  // Remove a suggestion from the list (optimistic UI update)
  const removeSuggestion = useCallback((id: string) => {
    setSuggestions((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Send a friend request and remove from suggestions (reuses the existing
  // friendship system — an insert into `friends` plus the auto-follow pattern).
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
        // Duplicate key error (request already exists). The gateway client
        // reports `error.code` as the HTTP status, so 409 (and 23505 if ever
        // surfaced directly) both mean "already sent" — not a failure.
        if (friendshipError.code === '409' || friendshipError.code === '23505') {
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

      // Ignore duplicate key errors for followers (409 = HTTP-mapped 23505)
      if (followError && followError.code !== '409' && followError.code !== '23505') {
        console.warn('[usePeopleYouMayKnow] Follow error:', followError);
      }

      toast({
        title: 'Friend request sent',
        description: 'Your friend request has been sent successfully.',
      });

      window.dispatchEvent(new CustomEvent(FRIEND_REQUEST_SENT_EVENT));

      return true;
    } catch (err) {
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