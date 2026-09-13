import { useState, useEffect, useCallback } from 'react';
import { gateway } from '@/lib/gateway';
import { blockingApi } from '@/api';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { FRIEND_REQUEST_SENT_EVENT } from '@/hooks/useFriendship';

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
      // Also read auth.users: many accounts predate profile auto-creation and
      // have no `profiles` row, so without this they would never be suggested.
      // Every profile is suggested (friends/followed are included too); only
      // the current user and blocked users are skipped.
      const [profilesRes, usersRes, friendsRes] = await Promise.all([
        gateway.from('profiles').select('*').order('created_at', { ascending: false }),
        gateway.from('users').select('id, email, raw_user_meta_data, created_at'),
        gateway.from('friends').select('*'),
      ]);

      if (profilesRes.error) throw new Error(profilesRes.error.message);
      if (friendsRes.error) throw new Error(friendsRes.error.message);
      if (usersRes.error) {
        console.warn('[usePeopleYouMayKnow] Auth users fetch failed:', usersRes.error.message);
      }

      const profiles = (profilesRes.data || []) as ProfileRow[];
      const authUsers = (usersRes.data || []) as Array<{
        id: string;
        email?: string | null;
        raw_user_meta_data?: Record<string, unknown> | null;
        created_at?: string;
      }>;
      const friendships = (friendsRes.data || []) as FriendRow[];

      // Accepted friend graph (undirected) for mutual-friend counting.
      const friendGraph = new Map<string, Set<string>>();
      for (const f of friendships) {
        if (f.status !== 'accepted') continue;
        if (!friendGraph.has(f.requester_id)) friendGraph.set(f.requester_id, new Set());
        if (!friendGraph.has(f.receiver_id)) friendGraph.set(f.receiver_id, new Set());
        friendGraph.get(f.requester_id)!.add(f.receiver_id);
        friendGraph.get(f.receiver_id)!.add(f.requester_id);
      }

      const myFriends = friendGraph.get(user.id) ?? new Set<string>();

      // Blocked users (both directions) are excluded.
      const blockedIds = new Set<string>();
      const { data: userBlockedIds } = await blockingApi.getBlockedUserIds(user.id);
      for (const id of userBlockedIds || []) blockedIds.add(id);

      // Merge profiles rows with auth.users. Accounts missing a profile row are
      // reconstructed from their sign-up metadata so the widget lists everyone.
      const sanitizeUsername = (value: string) =>
        value
          .toLowerCase()
          .replace(/[^a-z0-9_.]/g, '_')
          .replace(/^[_.]+|[_.]+$/g, '')
          .slice(0, 30);

      const profileById = new Map<string, ProfileRow>();
      for (const p of profiles) profileById.set(p.id, p);
      const authById = new Map<string, (typeof authUsers)[number]>();
      for (const u of authUsers) authById.set(u.id, u);

      const candidateIds = new Set<string>([...profileById.keys(), ...authById.keys()]);

      const personById = new Map<string, Omit<SuggestedPerson, 'mutual_friends_count'>>();
      const createdById = new Map<string, string>();

      for (const id of candidateIds) {
        const p = profileById.get(id);
        const u = authById.get(id);
        const meta = (u?.raw_user_meta_data ?? {}) as Record<string, unknown>;
        const metaUsername = typeof meta.username === 'string' ? meta.username.trim() : '';
        const metaDisplayName = typeof meta.display_name === 'string' ? meta.display_name.trim() : '';
        const emailPrefix = sanitizeUsername(u?.email?.split('@')[0] ?? '');

        personById.set(id, {
          id,
          username: p?.username || metaUsername || emailPrefix || `user_${id.slice(0, 8)}`,
          display_name: p?.display_name || metaDisplayName || metaUsername || emailPrefix || 'Tone User',
          profile_pic: p?.profile_pic ?? null,
        });
        createdById.set(id, p?.created_at || u?.created_at || '');
      }

      const result: SuggestedPerson[] = [];
      for (const id of candidateIds) {
        if (id === user.id) continue;
        if (blockedIds.has(id)) continue;

        const candidateFriends = friendGraph.get(id);
        let mutual = 0;
        if (candidateFriends) {
          for (const fid of candidateFriends) {
            if (myFriends.has(fid)) mutual++;
          }
        }

        result.push({ ...personById.get(id)!, mutual_friends_count: mutual });
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
