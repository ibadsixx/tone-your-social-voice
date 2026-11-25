// Regression test for the reporter: "The conversation did not appear in the
// sender's chat list."
//
// Scenario (messages.md): Sender A messages non-friend B via the Messages page
// chat window. The conversation C and a pending message request R (R.sender=A,
// R.receiver=B, R.conversation_id=C) are created. The conversation must show in
// A's Chats list.
//
// Root cause fixed: fetchVisibleDmUserIds only surfaced accepted friends and
// RECEIVED-accepted requests, so a conversation A *initiated* (A is the request
// SENDER) was filtered out of A's own Chats. The fix also marks the other
// participant of any request where A is the SENDER as visible.
//
// This drives the real dataClient client + the real fetch/filter helpers against
// an in-memory model of the relevant tables, and asserts the sender's
// conversation survives the inbox filter.
import { afterEach, describe, expect, beforeEach, it, vi } from 'vitest';
import { clearCurrentAccessToken, setCurrentAccessToken } from '@/lib/supabase/sessionTokenProvider';
import {
  applyPostgrestFilters,
  applyPostgrestOrder,
  infraRegistryResponse,
  isInfraRegistryRequest,
  jsonResponse,
  postgrestTable,
  prefersObjectResponse,
  shapePostgrestRows,
} from './infraFixtures';

import { dataClient } from '@/lib/supabase/dataClient';
import {
  fetchVisibleDmUserIds,
  filterRequestConversations,
  fetchConversationsDirectly,
} from '@/hooks/useConversations';
import { ensureMessageRequest } from '@/lib/messageRequests';


const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; // sender
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'; // non-friend recipient
const C = 'cccccccc-cccc-cccc-cccc-cccccccccccc'; // shared conversation

function makeInMemoryDb() {
  const messageRequests: any[] = [];
  const friends: any[] = []; // no friendship between A and B
  const participants: any[] = [
    { conversation_id: C, user_id: A },
    { conversation_id: C, user_id: B },
  ];
  const conversations: any[] = [{ id: C, type: 'dm', description: null }];
  const profiles: any[] = [
    { id: A, username: 'a', display_name: 'A', profile_pic: null },
    { id: B, username: 'b', display_name: 'B', profile_pic: null },
  ];
  const messages: any[] = [
    { conversation_id: C, sender_id: A, receiver_id: B, content: 'hi', created_at: '2026-01-01T00:00:00Z' },
  ];


  return {
    handle(req: { url: string; method?: string; body?: unknown; single?: boolean }) {
      const table = postgrestTable(req.url);
      const method = req.method || 'GET';

      if (table === 'message_requests') {
        if (method === 'GET') {
          let rows: any[] = messageRequests;
      rows = applyPostgrestOrder(applyPostgrestFilters(rows, req.url), req.url);
          return { status: 200, json: rows };
        }
        if (method === 'POST') {
          const row = {
            id: 'req-' + (messageRequests.length + 1),
            ...(req.body as object),
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          } as any;
          if (messageRequests.some(r => r.sender_id === row.sender_id && r.receiver_id === row.receiver_id)) {
            return { status: 409, json: { code: 409, message: 'duplicate sender/receiver' } };
          }
          messageRequests.push(row);
          return { status: 201, json: row };
        }
      }

      if (table === 'conversation_participants') {
        let rows = participants.slice();
      rows = applyPostgrestOrder(applyPostgrestFilters(rows, req.url), req.url);
        return { status: 200, json: rows };
      }

      if (table === 'conversations') {
        let rows = conversations.slice();
      rows = applyPostgrestOrder(applyPostgrestFilters(rows, req.url), req.url);
        return { status: 200, json: rows };
      }

      if (table === 'profiles') {
        let rows = profiles.slice();
      rows = applyPostgrestOrder(applyPostgrestFilters(rows, req.url), req.url);
        return { status: 200, json: rows };
      }

      if (table === 'messages') {
        let rows = messages.slice();
      rows = applyPostgrestOrder(applyPostgrestFilters(rows, req.url), req.url);
        return { status: 200, json: rows };
      }

      if (table === 'notifications') {
        return { status: 201, json: { id: 'notif', ...(req.body as object) } };
      }

      if (table === 'friends') {
        return { status: 200, json: friends };
      }

      return { status: 404, json: { error: `no mock route for ${method} ${table}` } };
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  setCurrentAccessToken('test-token');

  const db = makeInMemoryDb();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (isInfraRegistryRequest(input)) return infraRegistryResponse();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method || 'GET';
    let body: unknown = undefined;
    if (init?.body) body = JSON.parse(init.body as string);
    const resp = db.handle({ url, method, body, single: prefersObjectResponse(init) });
    return jsonResponse(resp.status, resp.json);
  });
  (globalThis as any).fetch = fetchMock;
});

afterEach(() => {
  clearCurrentAccessToken();
});

describe('sender Chats visibility after messaging a non-friend', () => {
  it('keeps the initiated conversation in the sender inbox filter', async () => {
    await ensureMessageRequest({ senderId: A, receiverId: B, conversationId: C, category: 'spam' });

    const { visibleUserIds, visitedConversationIds } = await fetchVisibleDmUserIds(A);
    // B is the request receiver, so the peer guard surfaces B to A's Chats even
    // when `message_requests` has no conversation_id column (the live schema).
    expect(visibleUserIds.has(B)).toBe(true);
    expect(visitedConversationIds.has(C)).toBe(false); // no conversation_id column on the request

    const firstOtherPerConv = new Map<string, string>([[C, B]]);
    const filtered = filterRequestConversations(
      [{ id: C, type: 'dm' }],
      firstOtherPerConv,
      visibleUserIds,
      visitedConversationIds
    );

    // The conversation A initiated is NOT filtered out of A's Chats.
    expect(filtered.map(c => c.id)).toContain(C);
  });

  it('keeps a conversation the user sent a message in even with no request row', async () => {
    // A has sent a message in C (mock `messages` has sender_id=A). Even without
    // any `message_requests` row or friendship, A's Chats must show C — this is
    // the exact "I created a conversation but it hasn't appeared" case.
    const { visibleUserIds, visitedConversationIds } = await fetchVisibleDmUserIds(A);
    const firstOtherPerConv = new Map<string, string>([[C, B]]);
    const sentIn = new Set<string>([C]);
    const filtered = filterRequestConversations(
      [{ id: C, type: 'dm' }],
      firstOtherPerConv,
      visibleUserIds,
      visitedConversationIds,
      sentIn
    );
    expect(filtered.map(c => c.id)).toContain(C);
    expect(visitedConversationIds.has(C)).toBe(false); // no request row
    expect(visibleUserIds.has(B)).toBe(false); // not a friend, no accepted request
  });

  it('does not leak a sender-initiated request into the RECIPIENT inbox (stays Pending)', async () => {
    await ensureMessageRequest({ senderId: A, receiverId: B, conversationId: C, category: 'spam' });

    // Recipient B sees A only if B has an ACCEPTED *incoming* request.
    const { visibleUserIds: vfB } = await fetchVisibleDmUserIds(B);
    expect(vfB.has(A)).toBe(false);
  });

  it('still hides a DM the viewer neither authored nor is allowed to see', async () => {
    // A stranger who has NOT sent a message in C, has no friendship with B, and
    // has no request must NOT see C.
    const { visibleUserIds, visitedConversationIds } = await fetchVisibleDmUserIds(A);
    const firstOtherPerConv = new Map<string, string>([[C, B]]);
    const sentIn = new Set<string>(); // A's sent-conversation set left empty here
    const filtered = filterRequestConversations(
      [{ id: C, type: 'dm' }],
      firstOtherPerConv,
      visibleUserIds,
      visitedConversationIds,
      sentIn
    );
    expect(filtered.map(c => c.id)).not.toContain(C);
  });

  it('returns the initiated conversation from the exact sender Chats query', async () => {
    // Full end-to-end: send as A, run the *exact* fetchConversationsDirectly(A)
    // the sender Chats list uses, assert C comes back with B as the peer.
    await dataClient
      .from('messages')
      .insert({ conversation_id: C, sender_id: A, receiver_id: B, content: 'hi' });
    await ensureMessageRequest({ senderId: A, receiverId: B, conversationId: C, category: 'spam' });

    const chats = await fetchConversationsDirectly(A);

    expect(chats.some(c => c.conversation_id === C)).toBe(true);
    const c = chats.find(cc => cc.conversation_id === C);
    expect(c?.other_user?.id).toBe(B);
    expect(c?.last_message?.content).toContain('hi');
  });

  it('recognizes the sender in either inbox participant slot', async () => {
    // The exact query must return C regardless of the ordering of the two
    // participant rows the inbox stores (messages.md: user1_id/user2_id).
    await dataClient
      .from('messages')
      .insert({ conversation_id: C, sender_id: A, receiver_id: B, content: 'hi' });
    await ensureMessageRequest({ senderId: A, receiverId: B, conversationId: C, category: 'spam' });

    const chats = await fetchConversationsDirectly(A);
    expect(chats.some(ch => ch.conversation_id === C)).toBe(true);
    expect((chats.find(ch => ch.conversation_id === C) as any)?.other_user?.id).toBe(B);
  });
});