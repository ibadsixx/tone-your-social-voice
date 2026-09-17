// Regression test for the Chats-list unread indicator (message.md): DM and
// Group conversations showed no unread_count (always 0), while Channels did.
//
// Fix: the Channel unread calculation — UNREAD = messages sent by OTHERS with
// no `message_reads` row for the current user, reusing the existing read-state
// architecture — now runs for every chat type in fetchConversationsDirectly.
//
// This drives the real gateway client + fetchConversationsDirectly against an
// in-memory model of the tables and asserts:
//   - DM/group/channel conversations all report per-user unread counts,
//   - messages the user SENT never count (even with no read row),
//   - messages the user HAS read don't count,
//   - marking a conversation read drops ITS count to 0 without touching others,
//   - a brand-new empty conversation reports 0 and doesn't error.
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { fetchConversationsDirectly } from '@/hooks/useConversations';

type Row = Record<string, unknown>;

// Applies a single gateway `filter` param (eq/neq/in) to rows, mirroring the
// real gateway server's applySupabaseFilters. The gateway client ALSO re-applies
// filters client-side, so double-filtering is idempotent here.
function applyServerFilter(rows: Row[], filter: string | undefined): Row[] {
  if (!filter) return rows;
  const eq = /^([^=]+)=eq\.(.+)$/.exec(filter);
  if (eq) return rows.filter(r => String(r[eq[1]]) === eq[2]);
  const neq = /^([^=]+)=neq\.(.+)$/.exec(filter);
  if (neq) return rows.filter(r => String(r[neq[1]]) !== neq[2]);
  const inM = /^([^=]+)=in\.\(([^)]*)\)$/.exec(filter);
  if (inM) {
    const vals = new Set(inM[2] ? inM[2].split(',') : []);
    return rows.filter(r => vals.has(String(r[inM[1]])));
  }
  return rows;
}

const ME = 'me-uuid-0000';
const ALICE = 'alice-uuid-0001';
const BOB = 'bob-uuid-0002';
const DM_C = 'conv-dm-uuid';
const GRP_C = 'conv-group-uuid';
const CHL_C = 'conv-channel-uuid';
const EMPTY_C = 'conv-empty-uuid';

function makeInMemoryDb() {
  const participants: Row[] = [
    { conversation_id: DM_C, user_id: ME },
    { conversation_id: DM_C, user_id: ALICE },
    { conversation_id: GRP_C, user_id: ME },
    { conversation_id: GRP_C, user_id: ALICE },
    { conversation_id: GRP_C, user_id: BOB },
    { conversation_id: CHL_C, user_id: ME },
    { conversation_id: CHL_C, user_id: ALICE },
    { conversation_id: EMPTY_C, user_id: ME },
    { conversation_id: EMPTY_C, user_id: ALICE },
  ];
  const conversations: Row[] = [
    { id: DM_C, type: 'dm', name: null, description: null, group_image: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: GRP_C, type: 'group', name: 'Squad', description: null, group_image: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: CHL_C, type: 'channel', name: 'Watercooler', description: null, group_image: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: EMPTY_C, type: 'dm', name: null, description: null, group_image: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ];
  const profiles: Row[] = [
    { id: ALICE, username: 'alice', display_name: 'Alice', profile_pic: null },
    { id: BOB, username: 'bob', display_name: 'Bob', profile_pic: null },
  ];
  const friends: Row[] = [
    { requester_id: ME, receiver_id: ALICE, status: 'accepted' },
  ];
  const messageRequests: Row[] = [];
  const messages: Row[] = [
    { id: 'm-dm-1', conversation_id: DM_C, sender_id: ALICE, content: 'dm unread', created_at: '2026-01-01T00:00:10Z' },
    { id: 'm-dm-2', conversation_id: DM_C, sender_id: ME, content: 'my dm latest', created_at: '2026-01-01T00:00:13Z' },
    { id: 'm-dm-3', conversation_id: DM_C, sender_id: ALICE, content: 'dm read', created_at: '2026-01-01T00:00:09Z' },
    { id: 'm-gr-1', conversation_id: GRP_C, sender_id: BOB, content: 'grp unread', created_at: '2026-01-01T00:00:12Z' },
    { id: 'm-gr-2', conversation_id: GRP_C, sender_id: ALICE, content: 'grp too', created_at: '2026-01-01T00:00:08Z' },
    { id: 'm-gr-3', conversation_id: GRP_C, sender_id: ME, content: 'my grp latest', created_at: '2026-01-01T00:00:15Z' },
    { id: 'm-ch-1', conversation_id: CHL_C, sender_id: ALICE, content: 'channel msg', created_at: '2026-01-01T00:00:11Z' },
    { id: 'm-ch-2', conversation_id: CHL_C, sender_id: ME, content: 'my channel msg', created_at: '2026-01-01T00:00:14Z' },
  ];
  const messageReads: Row[] = [
    { message_id: 'm-dm-3', user_id: ME },
  ];

  const qs = (url: URL) => Object.fromEntries(url.searchParams.entries());

  return {
    messages,
    messageReads,
    handle(req: { url: string; method?: string }): { status: number; json: Row[] } {
      const url = new URL(req.url, 'http://mock.test');
      const path = url.pathname;
      const params = qs(url);

      if (path === '/api/conversation_participants') {
        let rows = participants.slice();
        if (params['filter']) rows = applyServerFilter(rows, params['filter']);
        return { status: 200, json: rows };
      }
      if (path === '/api/conversations') {
        let rows = conversations.slice();
        if (params['filter']) rows = applyServerFilter(rows, params['filter']);
        return { status: 200, json: rows };
      }
      if (path === '/api/profiles') {
        let rows = profiles.slice();
        if (params['filter']) rows = applyServerFilter(rows, params['filter']);
        return { status: 200, json: rows };
      }
      if (path === '/api/friends') {
        let rows = friends.slice();
        if (params['filter']) rows = applyServerFilter(rows, params['filter']);
        return { status: 200, json: rows };
      }
      if (path === '/api/message_requests') {
        let rows = messageRequests.slice();
        if (params['filter']) rows = applyServerFilter(rows, params['filter']);
        return { status: 200, json: rows };
      }
      if (path === '/api/messages') {
        let rows = messages.slice();
        if (params['filter']) rows = applyServerFilter(rows, params['filter']);
        return { status: 200, json: rows };
      }
      if (path === '/api/message_reads') {
        let rows = messageReads.slice();
        if (params['filter']) rows = applyServerFilter(rows, params['filter']);
        return { status: 200, json: rows };
      }
      return { status: 404, json: [{ error: `no mock route for ${path}` }] };
    },
  };
}

let db: ReturnType<typeof makeInMemoryDb>;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    'tone-auth-token',
    JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh' })
  );

  db = makeInMemoryDb();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method || 'GET';
    const resp = db.handle({ url, method });
    return {
      ok: resp.status < 400,
      status: resp.status,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => resp.json,
    } as Response;
  });
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock;
});

function unreadFor(chats: { conversation_id: string; unread_count: number }[], id: string): number {
  return chats.find(c => c.conversation_id === id)?.unread_count ?? -1;
}

describe('Chats-list unread counts for DM/group/channel', () => {
  it('reports per-user unread counts for DM, group, and channel conversations', async () => {
    const chats = await fetchConversationsDirectly(ME);

    // DM: only m-dm-1 (from Alice, unread) counts. m-dm-3 is read; m-dm-2 is OURS.
    expect(unreadFor(chats, DM_C)).toBe(1);
    // Group: m-gr-1 + m-gr-2 (from others, unread) count. m-gr-3 is OURS.
    expect(unreadFor(chats, GRP_C)).toBe(2);
    // Channel: m-ch-1 (from Alice, unread) counts. m-ch-2 is OURS.
    expect(unreadFor(chats, CHL_C)).toBe(1);
    // Empty conversation: 0, no error.
    expect(unreadFor(chats, EMPTY_C)).toBe(0);
  });

  it('never counts the current user\'s own messages as unread', async () => {
    // m-dm-2 / m-gr-3 / m-ch-2 are OUR messages with NO read row, so a naive
    // "newer than read position" algorithm would over-count. The message_reads
    // based computation must exclude sender===ME.
    const chats = await fetchConversationsDirectly(ME);

    const dm = chats.find(c => c.conversation_id === DM_C);
    expect(dm?.unread_count).toBe(1);
    expect((dm?.last_message as { content: string } | undefined)?.content).toBe('my dm latest');
  });

  it('drops a conversation\'s unread to 0 once its messages are read, without touching others', async () => {
    // Simulate markConversationMessagesRead writing rows for DM_C's others-messages.
    db.messageReads.push({ message_id: 'm-dm-1', user_id: ME });

    const chats = await fetchConversationsDirectly(ME);

    expect(unreadFor(chats, DM_C)).toBe(0);
    expect(unreadFor(chats, GRP_C)).toBe(2);
    expect(unreadFor(chats, CHL_C)).toBe(1);
  });

  it('increments the group unread count when a new message arrives from another member', async () => {
    db.messages.push({
      id: 'm-gr-4',
      conversation_id: GRP_C,
      sender_id: ALICE,
      content: 'new group msg',
      created_at: '2026-01-01T00:00:16Z',
    });

    const chats = await fetchConversationsDirectly(ME);
    expect(unreadFor(chats, GRP_C)).toBe(3);
    // DMs/channels unaffected by the group arrival.
    expect(unreadFor(chats, DM_C)).toBe(1);
    expect(unreadFor(chats, CHL_C)).toBe(1);
  });
});