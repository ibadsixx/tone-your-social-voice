// Regression test for the voice-message send fix (do.md): the Chats-list
// preview of a voice message must read "🎤 Voice message" (the same convention
// PinnedMessagesBanner uses) instead of an empty string, and a chat whose
// LATEST message is a voice message must still sort to the top by that voice
// message's activity timestamp.
//
// Drives the real gateway client + fetchConversationsDirectly against an
// in-memory model (same seam as conversationsOrdering.test.ts).
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { fetchConversationsDirectly } from '@/hooks/useConversations';

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
const DM_C = 'conv-dm-uuid';

function makeVoiceDb(messages: Row[]) {
  const conversations: Row[] = [
    { id: DM_C, type: 'dm', name: null, description: null, group_image: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ];
  const participants: Row[] = [
    { conversation_id: DM_C, user_id: ME },
    { conversation_id: DM_C, user_id: ALICE },
  ];
  const profiles: Row[] = [
    { id: ALICE, username: 'alice', display_name: 'Alice', profile_pic: null },
  ];
  const friends: Row[] = [
    { requester_id: ME, receiver_id: ALICE, status: 'accepted' },
  ];
  const messageRequests: Row[] = [];
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

let db: ReturnType<typeof makeVoiceDb>;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    'tone-auth-token',
    JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh' })
  );

  db = makeVoiceDb([]);
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

describe('Voice message preview in the Chats list', () => {
  it("previews the newest voice message as '🎤 Voice message' and sorts by it", async () => {
    db = makeVoiceDb([
      { id: 'm-v1', conversation_id: DM_C, sender_id: ALICE, content: null, audio_path: 'message_audios/conv-dm-uuid/abc.webm', created_at: '2026-01-01T00:00:20Z' },
    ]);

    const chats = await fetchConversationsDirectly(ME);

    expect(chats).toHaveLength(1);
    expect(chats[0].last_message?.content).toBe('🎤 Voice message');
    expect(chats[0].latestActivityAt).toBe('2026-01-01T00:00:20Z');
  });

  it('previews a later text message instead when it arrived after the voice message', async () => {
    db = makeVoiceDb([
      { id: 'm-v1', conversation_id: DM_C, sender_id: ALICE, content: null, audio_path: 'message_audios/conv-dm-uuid/abc.webm', created_at: '2026-01-01T00:00:20Z' },
      { id: 'm-t1', conversation_id: DM_C, sender_id: ALICE, content: 'got it, thanks!', audio_path: null, created_at: '2026-01-01T00:00:21Z' },
    ]);

    const chats = await fetchConversationsDirectly(ME);

    expect(chats[0].last_message?.content).toBe('got it, thanks!');
    expect(chats[0].latestActivityAt).toBe('2026-01-01T00:00:21Z');
  });

  it('previews the voice message when it is the only message with no text content', async () => {
    db = makeVoiceDb([
      { id: 'm-v1', conversation_id: DM_C, sender_id: ALICE, content: '', audio_path: 'message_audios/conv-dm-uuid/abc.webm', created_at: '2026-01-01T00:00:20Z' },
    ]);

    const chats = await fetchConversationsDirectly(ME);

    expect(chats[0].last_message?.content).toBe('🎤 Voice message');
  });
});