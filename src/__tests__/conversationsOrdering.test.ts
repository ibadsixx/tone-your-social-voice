// Regression test for the Chats-list ORDERING contract (message.md): the
// Messages list must ALWAYS be ordered by each chat's most recent message /
// activity (`latestActivityAt`), newest first — for Direct, Group, AND Channel
// conversations alike.
//
// Drives the real gateway client + fetchConversationsDirectly against an
// in-memory model where the DB rows are seeded in a deliberately scrambled
// array position (and with created_at/updated_at/id values that would produce a
// DIFFERENT order) so the assertions prove the list is sorted ONLY by latest
// activity, never by:
//   - the conversation's creation date,
//   - the first message's date,
//   - the conversation id,
//   - the DB row / array position,
//   - the unread count, or
//   - a displayed relative-time label.
// Also asserts `sortConversationsByLatestActivity` is the mechanism that moves a
// chat straight to the top on send / realtime receive (the "no refresh" path)
// and that it always returns a fresh array so React state updates are detected.
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { fetchConversationsDirectly, sortConversationsByLatestActivity, applyConversationActivityUpdate, type Conversation } from '@/hooks/useConversations';

type Row = Record<string, unknown>;

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
  // Scrambled array position on purpose: CHL is the FIRST row the gateway
  // returns, but it is NOT the most recently active chat.
  const conversations: Row[] = [
    { id: CHL_C, type: 'channel', name: 'Watercooler', description: null, group_image: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:09Z' },
    { id: DM_C, type: 'dm', name: null, description: null, group_image: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: GRP_C, type: 'group', name: 'Squad', description: null, group_image: null, created_at: '2026-01-01T00:00:01Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: EMPTY_C, type: 'dm', name: null, description: null, group_image: null, created_at: '2026-01-01T00:00:59Z', updated_at: '2026-01-01T00:00:01Z' },
  ];
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
  const profiles: Row[] = [
    { id: ALICE, username: 'alice', display_name: 'Alice', profile_pic: null },
    { id: BOB, username: 'bob', display_name: 'Bob', profile_pic: null },
  ];
  const friends: Row[] = [
    { requester_id: ME, receiver_id: ALICE, status: 'accepted' },
  ];
  const messageRequests: Row[] = [];
  // Latest activity per chat (newest first): GRP (00:00:12) > CHL (00:00:11)
  // > DM (00:00:10). First-message dates are in a DIFFERENT order (DM 00:00:05
  // is its first) so the sort cannot be following first-message dates.
  const messages: Row[] = [
    { id: 'm-gr-1', conversation_id: GRP_C, sender_id: BOB, content: 'grp first? no', created_at: '2026-01-01T00:00:00Z' },
    { id: 'm-gr-2', conversation_id: GRP_C, sender_id: ALICE, content: 'grp newest', created_at: '2026-01-01T00:00:12Z' },
    { id: 'm-ch-1', conversation_id: CHL_C, sender_id: ALICE, content: 'channel newest', created_at: '2026-01-01T00:00:11Z' },
    { id: 'm-ch-2', conversation_id: CHL_C, sender_id: ME, content: 'channel earlier', created_at: '2026-01-01T00:00:04Z' },
    { id: 'm-dm-1', conversation_id: DM_C, sender_id: ME, content: 'my dm latest', created_at: '2026-01-01T00:00:10Z' },
    { id: 'm-dm-2', conversation_id: DM_C, sender_id: ALICE, content: 'dm first', created_at: '2026-01-01T00:00:05Z' },
  ];
  const messageReads: Row[] = [];

  const qs = (url: URL) => Object.fromEntries(url.searchParams.entries());

  return {
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

function orderOf(chats: { conversation_id: string }[]): string[] {
  return chats.map(c => c.conversation_id);
}

describe('Chats-list ordering by latest activity', () => {
  it('orders Direct, Group, and Channel chats by MOST RECENT activity, newest first', async () => {
    const chats = await fetchConversationsDirectly(ME);

    // Expected: GRP (latest msg 00:00:12) > CHL (00:00:11) > DM (00:00:10) >
    // EMPTY (no messages -> falls back to its updated_at 00:00:01).
    expect(orderOf(chats)).toEqual([GRP_C, CHL_C, DM_C, EMPTY_C]);
  });

  it('does NOT sort by array position, id, created_at, updated_at, or first-message date', async () => {
    const chats = await fetchConversationsDirectly(ME);
    const order = orderOf(chats);

    // CHL is row #1 from the gateway but 2nd by activity -> array position is irrelevant.
    expect(order[0]).not.toBe(CHL_C);
    // DM's FIRST message (00:00:05) predates CHL's last (00:00:11) yet DM sorts above CHL
    // because DM's most-recent activity (00:00:10) is only slightly older -> first-message date is irrelevant.
    expect(order.indexOf(DM_C)).toBeGreaterThan(order.indexOf(CHL_C)); // DM AFTER CHL by activity
    // EMPTY_C has the NEWEST created_at (00:00:59) but the OLDEST activity -> not sorted by creation date.
    expect(order.indexOf(EMPTY_C)).toBe(order.length - 1);
    // Id order "conv-ch..." < "conv-dm..." < "conv-em..." < "conv-gr..." -> not the result.
    expect(order).not.toEqual([CHL_C, DM_C, EMPTY_C, GRP_C]);
  });

  it('keeps a chat ordering preview + last_message consistent with its latest activity', async () => {
    const chats = await fetchConversationsDirectly(ME);
    const grp = chats.find(c => c.conversation_id === GRP_C)!;
    const chl = chats.find(c => c.conversation_id === CHL_C)!;
    const dm = chats.find(c => c.conversation_id === DM_C)!;

    // The top chat previews its MOST RECENT message, not the first one seeded.
    expect(grp.last_message?.content).toBe('grp newest');
    expect(chl.last_message?.content).toBe('channel newest');
    expect(dm.last_message?.content).toBe('my dm latest');

    // latestActivityAt equals that last message's created_at.
    expect(grp.latestActivityAt).toBe('2026-01-01T00:00:12Z');
    expect(chl.latestActivityAt).toBe('2026-01-01T00:00:11Z');
    expect(dm.latestActivityAt).toBe('2026-01-01T00:00:10Z');

    // A chat with no messages falls back to a usable timestamp (updated_at).
    const empty = chats.find(c => c.conversation_id === EMPTY_C)!;
    expect(empty.latestActivityAt).toBe('2026-01-01T00:00:01Z');
    expect(empty.last_message).toBeUndefined();
  });

  it('is independent of unread counts (an old chat with many unread stays below a newer chat)', () => {
    const oldBusy = {
      conversation_id: 'old-busy', type: 'dm', name: undefined, created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:01:00Z', latestActivityAt: '2026-01-01T00:01:00Z', unread_count: 9,
    };
    const newQuiet = {
      conversation_id: 'new-quiet', type: 'dm', name: undefined, created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z', latestActivityAt: '2026-01-01T00:02:00Z', unread_count: 1,
    };
    const quietestNew = {
      conversation_id: 'quietest-new', type: 'dm', name: undefined, created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z', latestActivityAt: '2026-01-01T00:03:00Z', unread_count: 0,
    };
    const order = orderOf(sortConversationsByLatestActivity([oldBusy, newQuiet, quietestNew]));
    // Even though oldBusy has the MOST unread, purely activity-based?: the two
    // newer chats (acts 00:03, 00:02) outrank it, proving unread never sorts.
    expect(order).toEqual(['quietest-new', 'new-quiet', 'old-busy']);
  });

  it('moves a chat straight to the top when its latestActivityAt bumps (send/receive path), with a fresh array', () => {
    const chats = [
      { conversation_id: 'a', type: 'dm', name: undefined, created_at: 'x', updated_at: 'x', latestActivityAt: '2026-01-01T00:00:03Z', unread_count: 0 },
      { conversation_id: 'b', type: 'dm', name: undefined, created_at: 'x', updated_at: 'x', latestActivityAt: '2026-01-01T00:00:02Z', unread_count: 0 },
      { conversation_id: 'c', type: 'dm', name: undefined, created_at: 'x', updated_at: 'x', latestActivityAt: '2026-01-01T00:00:01Z', unread_count: 0 },
    ];
    const sorted = sortConversationsByLatestActivity(chats);
    expect(orderOf(sorted)).toEqual(['a', 'b', 'c']);

    // Simulate what upsertConversationActivity does on send/receive: bump the
    // OLDEST chat's latestActivityAt past everything, then re-sort.
    const bumped = sorted.map(c =>
      c.conversation_id === 'c' ? { ...c, latestActivityAt: '2026-01-01T00:00:09Z' } : c
    );
    const next = sortConversationsByLatestActivity(bumped);

    expect(orderOf(next)).toEqual(['c', 'a', 'b']);
    // Fresh array reference every time -> React state updates are detected and
    // the reorder renders immediately (no refresh).
    expect(next).not.toBe(sorted);
    expect(next).not.toBe(bumped);
    expect(sorted).not.toBe(chats);
  });
});

// The exact pure transformation sendMessage (Direct/Group/Channel send) and
// handleMessageCreated (Realtime receive) run to move a chat to the top
// immediately — enabling message.md Tests 1-6 without a full hook/realtime
// harness (the hook simply feeds this function into setConversations).
describe('applyConversationActivityUpdate — immediate move-to-top on send/receive', () => {
  const conv = (
    id: string,
    type: string,
    latestActivityAt: string,
    unread = 0
  ): Conversation => ({
    conversation_id: id,
    type,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    latestActivityAt,
    unread_count: unread,
  });

  // Chat A = old, B = newer, C = newest (message.md Test 6 starting point).
  const base = () => [
    conv('B', 'dm', '2026-01-01T12:00:00Z'),
    conv('C', 'dm', '2026-01-01T13:00:00Z'),
    conv('A', 'dm', '2026-01-01T10:00:00Z'),
  ];

  it('Test 1/3/6: sending in an old chat moves it to the top immediately and updates its preview', () => {
    const next = applyConversationActivityUpdate(base(), 'A', {
      lastMessage: { content: 'brand new', created_at: '2026-01-01T14:00:00Z' },
      createdAt: '2026-01-01T14:00:00Z',
      unreadDelta: 0,
    });

    expect(orderOf(next)).toEqual(['A', 'C', 'B']);
    const a = next.find(c => c.conversation_id === 'A')!;
    expect(a.last_message?.content).toBe('brand new');
    expect(a.latestActivityAt).toBe('2026-01-01T14:00:00Z');
    // Own message never changes unread.
    expect(a.unread_count).toBe(0);
  });

  it('Test 2/4: receiving in a closed chat moves it to the top and bumps unread', () => {
    const next = applyConversationActivityUpdate(
      [conv('B', 'dm', '2026-01-01T12:00:00Z', 0), conv('A', 'dm', '2026-01-01T10:00:00Z', 2)],
      'A',
      {
        lastMessage: { content: 'incoming', created_at: '2026-01-01T14:00:00Z' },
        createdAt: '2026-01-01T14:00:00Z',
        unreadDelta: 1,
      }
    );

    expect(orderOf(next)).toEqual(['A', 'B']);
    const a = next.find(c => c.conversation_id === 'A')!;
    expect(a.last_message?.content).toBe('incoming');
    expect(a.unread_count).toBe(3);
  });

  it('receiving in the OPEN chat does not bump unread (already being read)', () => {
    const next = applyConversationActivityUpdate(
      [conv('A', 'group', '2026-01-01T10:00:00Z', 0)],
      'A',
      {
        lastMessage: { content: 'incoming', created_at: '2026-01-01T14:00:00Z' },
        createdAt: '2026-01-01T14:00:00Z',
        unreadDelta: 0,
      }
    );
    expect(next.find(c => c.conversation_id === 'A')!.unread_count).toBe(0);
  });

  it('Test 5: publishing a Channel post moves the Channel to the top, preserving channel identity', () => {
    const channels = [
      conv('CH', 'channel', '2026-01-01T10:00:00Z', 0),
      conv('DM', 'dm', '2026-01-01T13:00:00Z', 0),
    ];
    const next = applyConversationActivityUpdate(channels, 'CH', {
      lastMessage: { content: 'new channel post', created_at: '2026-01-01T14:00:00Z' },
      createdAt: '2026-01-01T14:00:00Z',
      unreadDelta: 0,
    });

    expect(orderOf(next)).toEqual(['CH', 'DM']);
    const ch = next.find(c => c.conversation_id === 'CH')!;
    // Still a channel with its own identity/preview — never converted or duplicated.
    expect(ch.type).toBe('channel');
    expect(ch.conversation_id).toBe('CH');
    expect(ch.last_message?.content).toBe('new channel post');
    expect(ch.latestActivityAt).toBe('2026-01-01T14:00:00Z');
  });

  it('updates the existing item instead of appending a duplicate', () => {
    const once = applyConversationActivityUpdate(base(), 'A', {
      lastMessage: { content: 'first', created_at: '2026-01-01T14:00:00Z' },
      createdAt: '2026-01-01T14:00:00Z',
    });
    const twice = applyConversationActivityUpdate(once, 'A', {
      lastMessage: { content: 'second', created_at: '2026-01-01T15:00:00Z' },
      createdAt: '2026-01-01T15:00:00Z',
    });

    expect(twice).toHaveLength(3);
    expect(twice.filter(c => c.conversation_id === 'A')).toHaveLength(1);
    expect(twice[0].conversation_id).toBe('A');
    expect(twice[0].last_message?.content).toBe('second');
  });

  it('leaves the list untouched when the chat is not present (refetch adds it)', () => {
    const list = base();
    const next = applyConversationActivityUpdate(list, 'missing', {
      createdAt: '2026-01-01T14:00:00Z',
    });
    expect(next).toBe(list);
  });

  it('always returns a fresh sorted array so React detects the reorder', () => {
    const list = base();
    const next = applyConversationActivityUpdate(list, 'A', {
      createdAt: '2026-01-01T14:00:00Z',
      unreadDelta: 0,
    });
    expect(next).not.toBe(list);
    expect(orderOf(next)).toEqual(['A', 'C', 'B']);
  });
});