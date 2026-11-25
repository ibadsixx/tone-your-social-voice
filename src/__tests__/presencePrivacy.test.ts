// Regression test for the presence-privacy rule (see messages.md).
//
// While two users are NOT friends and have a PENDING message request between
// them (in EITHER direction), neither may see the other's online / last-seen /
// presence state. Acceptor status resumes presence. This tests the pure,
// reusable logic that backs both the frontend display gate
// (usePresencePrivacy) and the dataClient redaction.
import { describe, it, expect } from 'vitest';

import {
  computePresencePrivacy,
  isPresenceHiddenFor,
} from '@/hooks/usePresencePrivacy';

const A = 'user-a';
const B = 'user-b';
const C = 'user-c';

describe('presence privacy for non-friend PENDING message requests', () => {
  it('hides presence for a non-friend with a PENDING request (sender does not see recipient)', () => {
    // A sent B a message request (A -> B, pending). Not friends.
    const sets = computePresencePrivacy(A, [], [
      { sender_id: A, receiver_id: B, status: 'pending' },
    ]);
    // Sender A cannot see B's presence.
    expect(isPresenceHiddenFor(sets, B, A)).toBe(true);
    // Recipient B also cannot see A's presence (any pending request, either side).
    const bSets = computePresencePrivacy(B, [], [
      { sender_id: A, receiver_id: B, status: 'pending' },
    ]);
    expect(isPresenceHiddenFor(bSets, A, B)).toBe(true);
  });

  it('does NOT hide presence when there is no request at all', () => {
    const sets = computePresencePrivacy(A, [], []);
    expect(isPresenceHiddenFor(sets, B, A)).toBe(false);
    expect(isPresenceHiddenFor(sets, A, B)).toBe(false);
  });

  it('does NOT hide presence once the request is ACCEPTED', () => {
    const sets = computePresencePrivacy(A, [], [
      { sender_id: A, receiver_id: B, status: 'accepted' },
    ]);
    expect(isPresenceHiddenFor(sets, B, A)).toBe(false);
    expect(isPresenceHiddenFor(sets, A, B)).toBe(false);
  });

  it('does NOT hide presence when the two ARE friends (even if a request is pending)', () => {
    const sets = computePresencePrivacy(A, [
      { requester_id: A, receiver_id: B, status: 'accepted' },
    ], [
      { sender_id: A, receiver_id: B, status: 'pending' },
    ]);
    expect(isPresenceHiddenFor(sets, B, A)).toBe(false);
  });

  it('hides presence when the pending request is INCOMING (recipient viewing sender)', () => {
    // B -> A pending (B sent the request to A). A (viewer of B) is the recipient.
    const sets = computePresencePrivacy(A, [], [
      { sender_id: B, receiver_id: A, status: 'pending' },
    ]);
    expect(isPresenceHiddenFor(sets, B, A)).toBe(true);
  });

  it('never hides presence for your own user id', () => {
    const sets = computePresencePrivacy(A, [], [
      { sender_id: A, receiver_id: B, status: 'pending' },
    ]);
    expect(isPresenceHiddenFor(sets, A, A)).toBe(false);
    expect(isPresenceHiddenFor(sets, undefined as unknown as string, A)).toBe(false);
  });

  it('does not leak unrelated third-party requests', () => {
    const sets = computePresencePrivacy(A, [], [
      { sender_id: B, receiver_id: C, status: 'pending' },
    ]);
    expect(isPresenceHiddenFor(sets, B, A)).toBe(false);
  });

  it('treats declined/blocked requests as not pending (presence not hidden)', () => {
    const sets = computePresencePrivacy(A, [], [
      { sender_id: A, receiver_id: B, status: 'declined' },
    ]);
    expect(isPresenceHiddenFor(sets, B, A)).toBe(false);
  });
});
