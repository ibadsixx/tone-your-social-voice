import { useState, useEffect, useCallback } from 'react';
import { gateway } from '@/lib/gateway';
import { blockingApi } from '@/api';
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

interface ProfileRow {
  id: string;
  username: string;
  display_name: string;
  profile_pic: string | null;
  created_at?: string;
}

interface FriendRow {
  requester_id: string;
  receiver_id: string;
  status: string;
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

      // The gateway's /api/rpc proxy is auth-gated and defaults to the users
      // project, so the get_people_you_may_know RPC cannot be called reliably.
      // Reproduce its logic client-side from table queries.
      const [profilesRes, friendsRes, followersRes] = await Promise.all([
        gateway.from('profiles').select('*').order('created_at', { ascending: false }),
        gateway.from('friends').select('*'),
        gateway.from('followers').select('*').eq('follower_id', user.id),
      ]);

      if (profilesRes.error) throw new Error(profilesRes.error.message);
      if (friendsRes.error) throw new Error(friendsRes.error.message);

      const profiles = (profilesRes.data || []) as ProfileRow[];
      const friendships = (friendsRes.data || []) as FriendRow[];

      // Accepted friend graph (undirected) for mutual-friend counting.
      const friendGraph = new Map<string, Set<string>>();
      // Any friendship row (any status) linking the current user to a candidate
      // excludes that candidate (matches the RPC's NOT EXISTS check).
      const relatedUserIds = new Set<string>();
      for (const f of friendships) {
        if (f.requester_id === user.id) relatedUserIds.add(f.receiver_id);
        if (f.receiver_id === user.id) relatedUserIds.add(f.requester_id);
        if (f.status !== 'accepted') continue;
        if (!friendGraph.has(f.requester_id)) friendGraph.set(f.requester_id, new Set());
        if (!friendGraph.has(f.receiver_id)) friendGraph.set(f.receiver_id, new Set());
        friendGraph.get(f.requester_id)!.add(f.receiver_id);
        friendGraph.get(f.receiver_id)!.add(f.requester_id);
      }

      const myFriends = friendGraph.get(user.id) ?? new Set<string>();

      // Users the current user already follows are excluded.
      const followedIds = new Set<string>();
      if (followersRes.error) {
        console.warn('[usePeopleYouMayKnow] Followers fetch failed:', followersRes.error.message);
      } else {
        for (const fl of (followersRes.data || []) as Array<{ following_id: string }>) {
          followedIds.add(fl.following_id);
        }
      }

      // Blocked users (both directions) are excluded.
      const blockedIds = new Set<string>();
      const { data: userBlockedIds } = await blockingApi.getBlockedUserIds(user.id);
      for (const id of userBlockedIds || []) blockedIds.add(id);

      const createdById = new Map<string, string>();
      for (const p of profiles) {
        createdById.set(p.id, p.created_at || '');
      }

      const result: SuggestedPerson[] = [];
      for (const p of profiles) {
        if (p.id === user.id) continue;
        if (relatedUserIds.has(p.id)) continue;
        if (followedIds.has(p.id)) continue;
        if (blockedIds.has(p.id)) continue;

        const candidateFriends = friendGraph.get(p.id);
        let mutual = 0;
        if (candidateFriends) {
          for (const fid of candidateFriends) {
            if (myFriends.has(fid)) mutual++;
          }
        }

        result.push({
          id: p.id,
          username: p.username,
          display_name: p.display_name,
          profile_pic: p.profile_pic ?? null,
          mutual_friends_count: mutual,
        });
      }

      // Match the RPC ordering: mutual friends DESC, then created_at DESC.
      result.sort(
        (a, b) =>
          b.mutual_friends_count - a.mutual_friends_count ||
          (createdById.get(b.id) || '').localeCompare(createdById.get(a.id) || '')
      );

      setSuggestions(result.slice(0, limit));
    } catch (err: any) {
      console.error('[usePeopleYouMayKnow] Unexpected error:', err);
      setError(err.message || 'Failed to fetch suggestions');
      setSuggestions([]);
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
