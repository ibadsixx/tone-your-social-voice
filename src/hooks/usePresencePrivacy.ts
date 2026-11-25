import { useCallback, useEffect, useRef, useState } from 'react';
import { dataClient } from '@/lib/supabase/dataClient';

// Presence privacy for non-friend PENDING message requests (see messages.md).
//
// While two users are NOT friends and have a PENDING message request between
// them (in EITHER direction), neither may see the other's online / last-seen /
// presence state — the sender must not learn the recipient is active. This is
// the client-side display gate; the dataClient ALSO redacts `last_seen_at` /
// `manual_status` from `/api/profiles` so presence is genuinely unavailable, not
// merely hidden. Once the request is accepted (or the two become friends),
// presence resumes under the normal friendship/privacy rules.
//
// Reuses the existing `friends` and `message_requests` tables — no second
// privacy system.

export type RelationshipRow = {
  requester_id?: string | null;
  receiver_id?: string | null;
  sender_id?: string | null;
  status?: string | null;
};

export type PresencePrivacySets = {
  friends: Set<string>;
  pending: Set<string>;
};

// Pure, testable computation: reduces the `friends` + `message_requests` rows
// touching `currentUserId` into the sets needed to decide presence hiding.
export function computePresencePrivacy(
  currentUserId: string,
  friendRows: RelationshipRow[],
  requestRows: RelationshipRow[]
): PresencePrivacySets {
  const friends = new Set<string>();
  const pending = new Set<string>();

  for (const f of friendRows) {
    if (f?.status === 'accepted') {
      friends.add(f.requester_id === currentUserId ? f.receiver_id! : f.requester_id!);
    }
  }
  for (const r of requestRows) {
    const isSender = r?.sender_id === currentUserId;
    const isReceiver = r?.receiver_id === currentUserId;
    // Only requests that involve the current user matter.
    if (!isSender && !isReceiver) continue;
    const other = isSender ? r?.receiver_id : r?.sender_id;
    if (other === currentUserId) continue;
    if (r?.status === 'accepted') {
      friends.add(other!);
    } else if (r?.status === 'pending') {
      pending.add(other!);
    }
  }

  return { friends, pending };
}

export function isPresenceHiddenFor(
  sets: PresencePrivacySets,
  otherUserId: string | undefined | null,
  currentUserId: string | undefined | null
): boolean {
  if (!otherUserId || !currentUserId || otherUserId === currentUserId) return false;
  // Not a friend AND has a pending request in either direction.
  return !sets.friends.has(otherUserId) && sets.pending.has(otherUserId);
}

type LoadedState = PresencePrivacySets;

const cache = new Map<string, LoadedState>();

export function usePresencePrivacy(currentUserId?: string) {
  const [state, setState] = useState<LoadedState>(
    () => (currentUserId ? cache.get(currentUserId) || { friends: new Set(), pending: new Set() } : { friends: new Set(), pending: new Set() })
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  const refresh = useCallback(async () => {
    if (!currentUserId) return;

    const [{ data: friendRows }, { data: reqRows }] = await Promise.all([
      dataClient
        .from('friends')
        .select('requester_id, receiver_id')
        .or(`requester_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`),
      dataClient
        .from('message_requests')
        .select('sender_id, receiver_id, status')
        .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`),
    ]);

    const next = computePresencePrivacy(
      currentUserId,
      (friendRows || []) as RelationshipRow[],
      (reqRows || []) as RelationshipRow[]
    );
    cache.set(currentUserId, next);
    setState(next);
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    if (cache.has(currentUserId)) {
      setState(cache.get(currentUserId)!);
      return;
    }
    refresh();
  }, [currentUserId, refresh]);

  const isPresenceHidden = useCallback(
    (otherUserId: string | undefined | null): boolean =>
      isPresenceHiddenFor(stateRef.current, otherUserId, currentUserId),
    [currentUserId]
  );

  return { isPresenceHidden, refresh };
}
