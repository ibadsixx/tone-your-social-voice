// Regression test for the voice-message send fix (do.md): the Chats-list
// preview of a voice message must read "🎤 Voice message" (the same convention
// PinnedMessagesBanner uses) instead of an empty string, and a chat whose
// LATEST message is a voice message must still sort to the top by that voice
// message's activity timestamp.
//
// Drives the real dataClient client + fetchConversationsDirectly against an
// in-memory model (same seam as conversationsOrdering.test.ts).
import { afterEach, describe, expect, beforeEach, it, vi } from 'vitest';
import { clearCurrentAccessToken, setCurrentAccessToken } from '@/lib/supabase/sessionTokenProvider';
import {
  applyPostgrestFilters,
  applyPostgrestOrder,
  infraRegistryResponse,
  isInfraRegistryRequest,
  jsonResponse,
  postgrestTable,
} from './infraFixtures';

import { fetchConversationsDirectly } from '@/hooks/useConversations';

type Row = Record<string, unknown>;


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

  return {
    handle(req: { url: string; method?: string }): { status: number; json: Row[] } {
      const table = postgrestTable(req.url);

      if (table === 'conversation_participants') return { status: 200, json: applyPostgrestOrder(applyPostgrestFilters(participants, req.url), req.url) };
      if (table === 'conversations') return { status: 200, json: applyPostgrestOrder(applyPostgrestFilters(conversations, req.url), req.url) };
      if (table === 'profiles') return { status: 200, json: applyPostgrestOrder(applyPostgrestFilters(profiles, req.url), req.url) };
      if (table === 'friends') return { status: 200, json: applyPostgrestOrder(applyPostgrestFilters(friends, req.url), req.url) };
      if (table === 'message_requests') return { status: 200, json: applyPostgrestOrder(applyPostgrestFilters(messageRequests, req.url), req.url) };
      if (table === 'messages') return { status: 200, json: applyPostgrestOrder(applyPostgrestFilters(messages, req.url), req.url) };
      if (table === 'message_reads') return { status: 200, json: applyPostgrestOrder(applyPostgrestFilters(messageReads, req.url), req.url) };
      return { status: 404, json: [{ error: `no mock route for ${table}` }] };
    },
  };
}

let db: ReturnType<typeof makeVoiceDb>;

beforeEach(() => {
  setCurrentAccessToken('test-token');

  db = makeVoiceDb([]);
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (isInfraRegistryRequest(input)) return infraRegistryResponse();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method || 'GET';
    const resp = db.handle({ url, method });
    return jsonResponse(resp.status, resp.json);
  });
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock;
});

afterEach(() => {
  clearCurrentAccessToken();
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