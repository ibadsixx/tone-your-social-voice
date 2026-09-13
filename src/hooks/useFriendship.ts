import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { blockingApi } from '@/api';
import { useToast } from '@/hooks/use-toast';
import { createNotification } from '@/hooks/useNotifications';

export const FRIEND_REQUEST_SENT_EVENT = 'tone:friend-request-sent';

// Guards against concurrent sends for the same pair: without it, a rapid second
// click on "Add Friend" races the first insert and hits the UNIQUE(requester_id,
// receiver_id) constraint, surfacing a confusing "Failed to send friend request"
// toast even though the request was created.
const inFlightFriendRequestSends = new Set<string>();

// The gateway client reports `error.code` as the HTTP status (String(res.status)),
// never the Postgres code, so a duplicate unique-violation on the friends pair
// surfaces as 409 (or 23505 if it is ever surfaced directly). A duplicate means
// the request already exists — treated as success, never as failure.
const isDuplicateFriendRequestError = (error: { code?: string; message?: string }) =>
  error.code === '409' ||
  error.code === '23505' ||
  /duplicate|already exists/i.test(error.message ?? '');

interface FriendshipStatus {
  id: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | null;
  isSender: boolean;
  loading: boolean;
}

// Ensure the sender follows the target. Best-effort: returns the error (if
// any) instead of throwing, so a duplicate follow (or any follow problem)
// can't fail the friend-request action that triggered it.
const ensureFollowing = async (
  followerId: string,
  followingId: string
): Promise<{ message?: string; code?: string } | null> => {
  try {
    const { error } = await gateway.from('followers').insert({
      follower_id: followerId,
      following_id: followingId,
    });

    if (!error || error.code === '409' || error.code === '23505') {
      return null;
    }
    return error;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown follow error';
    return { message };
  }
};

export const useFriendship = (profileId: string, currentUserId?: string) => {
  const [friendship, setFriendship] = useState<FriendshipStatus>({
    id: null,
    status: null,
    isSender: false,
    loading: true,
  });
  const { toast } = useToast();

  const fetchFriendship = async (silent = false) => {
    if (!currentUserId || !profileId || currentUserId === profileId) {
      setFriendship(prev => ({ ...prev, loading: false }));
      return;
    }

    try {
      // Check if users are blocked first
      const { isBlocked, isBlockedBy } = await blockingApi.getBlockStatus(currentUserId, profileId);

      if (isBlocked || isBlockedBy) {
        // Users are blocked, don't show friendship options
        setFriendship({
          id: null,
          status: null,
          isSender: false,
          loading: false,
        });
        return;
      }

      const { data, error } = await gateway
        .from('friends')
        .select('*')
        .or(`and(requester_id.eq.${currentUserId},receiver_id.eq.${profileId}),and(requester_id.eq.${profileId},receiver_id.eq.${currentUserId})`)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setFriendship({
          id: data.id,
          status: data.status.toUpperCase() as 'PENDING' | 'ACCEPTED' | 'REJECTED',
          isSender: data.requester_id === currentUserId,
          loading: false,
        });
      } else {
        setFriendship({
          id: null,
          status: null,
          isSender: false,
          loading: false,
        });
      }
    } catch (error: any) {
      console.error('Error fetching friendship:', error);
      setFriendship(prev => ({ ...prev, loading: false }));
    }
  };

  const sendRequest = async () => {
    if (!currentUserId || !profileId) return;

    const sendKey = `${currentUserId}:${profileId}`;
    if (inFlightFriendRequestSends.has(sendKey)) return;
    inFlightFriendRequestSends.add(sendKey);

    try {
      // A declined request keeps its row at status='rejected', occupying the
      // UNIQUE(requester_id, receiver_id) pair. A plain insert would then
      // violate that constraint, so reuse the existing row when present.
      const { data: existing, error: existingError } = await gateway
        .from('friends')
        .select('id, status')
        .eq('requester_id', currentUserId)
        .eq('receiver_id', profileId)
        .maybeSingle();

      if (existingError) throw existingError;

      let friendshipData: { id: string } | undefined;
      if (existing && existing.status !== 'accepted') {
        // Re-send: flip the previously rejected request back to pending.
        const { data, error } = await gateway
          .from('friends')
          .update({ status: 'pending' })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        friendshipData = data;

        // Also follow when re-sending a previously declined request. Creating
        // the follow is secondary to sending the request, so a duplicate or
        // other follow error must not fail the request.
        const followError = await ensureFollowing(currentUserId, profileId);
        if (followError) {
          console.warn('Friend request sent, but follow creation failed:', followError.message);
        }

        await createNotification({
          userId: profileId,
          actorId: currentUserId,
          type: 'follow',
          message: 'started following you'
        });
      } else if (!existing) {
        // Fresh request: insert a new row.
        const { data, error } = await gateway
          .from('friends')
          .insert({
            requester_id: currentUserId,
            receiver_id: profileId,
            status: 'pending'
          })
          .select()
          .single();

        if (error) {
          if (!isDuplicateFriendRequestError(error)) throw error;
          // A duplicate insert means the request was created by a concurrent
          // send (double-click or another in-flight caller). Idempotence:
          // resolve the existing row and continue instead of failing.
          const { data: dup } = await gateway
            .from('friends')
            .select('id')
            .eq('requester_id', currentUserId)
            .eq('receiver_id', profileId)
            .maybeSingle();
          friendshipData = dup ?? undefined;
        } else {
          friendshipData = data;
        }

        // Insert follow relationship. This is secondary to sending the
        // request and must not fail it: the user may already be following, in
        // which case the DB raises a unique violation (surfaced as an HTTP
        // status, not the Postgres code, so it can't be matched by code).
        const followError = await ensureFollowing(currentUserId, profileId);
        if (followError) {
          console.warn('Friend request sent, but follow creation failed:', followError.message);
        }

        await createNotification({
          userId: profileId,
          actorId: currentUserId,
          type: 'follow',
          message: 'started following you'
        });
      } else {
        // Already accepted — nothing to do, reflect current state.
        setFriendship(prev => ({ ...prev, status: 'ACCEPTED', loading: false }));
        return;
      }

      setFriendship({
        id: friendshipData?.id ?? null,
        status: 'PENDING',
        isSender: true,
        loading: false,
      });

      toast({
        title: 'Friend request sent',
        description: 'Your friend request has been sent successfully.',
      });

      window.dispatchEvent(new CustomEvent(FRIEND_REQUEST_SENT_EVENT));
    } catch (error: any) {
      console.error('Friend request failed:', error?.message, error?.code, error?.details);
      toast({
        title: 'Error',
        description: 'Failed to send friend request.',
        variant: 'destructive',
      });
    } finally {
      inFlightFriendRequestSends.delete(sendKey);
    }
  };

  const cancelRequest = async () => {
    if (!friendship.id) return;

    try {
      const { error } = await gateway.from('friends').delete().eq('id', friendship.id);

      if (error) throw error;

      setFriendship({
        id: null,
        status: null,
        isSender: false,
        loading: false,
      });

      toast({
        title: 'Friend request cancelled',
        description: 'Your friend request has been cancelled.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to cancel friend request.',
        variant: 'destructive',
      });
    }
  };

  const acceptRequest = async () => {
    if (!friendship.id) return;

    try {
      const { data, error } = await gateway
        .from('friends')
        .update({ status: 'accepted' })
        .eq('id', friendship.id)
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error('Request could not be accepted');

      setFriendship(prev => ({
        ...prev,
        status: 'ACCEPTED',
      }));

      toast({
        title: 'Friend request accepted',
        description: 'You are now friends!',
      });
    } catch (error: any) {
      console.error('[accept] failed:', error?.message, error?.code, error?.details);
      toast({
        title: 'Error',
        description: 'Failed to accept friend request.',
        variant: 'destructive',
      });
    }
  };

  const rejectRequest = async () => {
    if (!friendship.id) return;

    try {
      const { data, error } = await gateway
        .from('friends')
        .update({ status: 'rejected' })
        .eq('id', friendship.id)
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error('Request could not be rejected');

      setFriendship(prev => ({
        ...prev,
        status: 'REJECTED',
      }));

      toast({
        title: 'Friend request rejected',
        description: 'Friend request has been rejected.',
      });
    } catch (error: any) {
      console.error('[reject] failed:', error?.message, error?.code, error?.details);
      toast({
        title: 'Error',
        description: 'Failed to reject friend request.',
        variant: 'destructive',
      });
    }
  };

  const unfriend = async () => {
    if (!friendship.id) return;

    try {
      const { error } = await gateway.from('friends').delete().eq('id', friendship.id);

      if (error) throw error;

      setFriendship({
        id: null,
        status: null,
        isSender: false,
        loading: false,
      });

      toast({
        title: 'Friendship ended',
        description: 'You are no longer friends.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to unfriend.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    fetchFriendship();
  }, [currentUserId, profileId]);

  // Auto-refresh so friendship state reflects changes made elsewhere (e.g. the
  // receiver accepting/rejecting in another tab) without a manual reload.
  useEffect(() => {
    if (!currentUserId || !profileId || currentUserId === profileId) return;

    const refresh = () => {
      if (document.visibilityState === 'visible') fetchFriendship(true);
    };
    refresh();
    const interval = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [currentUserId, profileId]);

  return {
    friendship,
    sendRequest,
    cancelRequest,
    acceptRequest,
    rejectRequest,
    unfriend,
    refetch: fetchFriendship,
  };
};