// Regression test for the recipient-identity / same-conversation regression
// (see messages.md). A sender messaging a non-friend must have Chats, Pending,
// and the message_request Notification all resolve to the SAME conversation:
//
//   - Sender A's Chats includes the conversation they initiated (it must not be
//     filtered out just because the other participant isn't yet an accepted
//     friend / hasn't accepted the request).
//   - A message_request notification must resolve to the request's
//     conversation_id so a click opens the same conversation in Chat, and never
//     creates a new one.
//
// This exercises the real dataClient-client code paths (ensureMessageRequest insert
// and resolveMessageRequestConversation read) against an in-memory model of
// public.message_requests with the sender/receiver + pending-conversation
// uniqueness guarantees.
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
import { ensureMessageRequest, resolveMessageRequestConversation } from '@/lib/messageRequests';

export const __notifications: unknown[] = [];

vi.mock('@/hooks/useNotifications', () => ({
  createNotification: (n: unknown) => (__notifications as unknown[]).push(n),
}));

const SENDER = 'sender-uuid-0001';
const RECEIVER = 'receiver-uuid-0002';
const CONVERSATION = 'conversation-uuid-0001';

let notificationRows: unknown[] = [];


function makeInMemoryDb() {
  const messageRequests: any[] = [];
  // resolveMessageRequestConversation now derives the DM from the shared
  // participants (message_requests has no conversation_id column live).
  const participants: any[] = [
    { conversation_id: CONVERSATION, user_id: SENDER },
    { conversation_id: CONVERSATION, user_id: RECEIVER },
  ];
  const conversations: any[] = [{ id: CONVERSATION, type: 'dm' }];

  return {
    handle(req: { url: string; method?: string; body?: unknown; single?: boolean }) {
      const table = postgrestTable(req.url);
      const method = req.method || 'GET';

      if (table === 'message_requests') {
        if (method === 'GET') {
          return { status: 200, json: messageRequests };
        }
        if (method === 'POST') {
          const row = {
            id: 'req-' + (messageRequests.length + 1),
            ...(req.body as object),
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          } as any;
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

      return { status: 404, json: { error: `no mock route for ${method} ${table}` } };
    },
    messageRequests,
  };
}

beforeEach(() => {
  localStorage.clear();
  setCurrentAccessToken('test-token');
  notificationRows = [];

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

  notificationRows = __notifications;
  __notifications.length = 0;
});

afterEach(() => {
  clearCurrentAccessToken();
});

describe('message_request -> conversation resolution', () => {
  it('resolves a notification to the SAME conversation_id the request carries', async () => {
    await ensureMessageRequest({
      senderId: SENDER,
      receiverId: RECEIVER,
      conversationId: CONVERSATION,
      category: 'spam',
    });

    const conversationId = await resolveMessageRequestConversation(SENDER, RECEIVER);

    expect(conversationId).toBe(CONVERSATION);
    expect(__notifications).toHaveLength(1);
  });

  it('returns undefined when there is no shared DM (no participants link)', async () => {
    // SENDER and RECEIVER have NO shared conversation (no participants row for
    // the pair), so resolution cannot find a DM to open.
    const onlySender = makeInMemoryDb();
    onlySender.handle = (req: { url: string; method?: string; single?: boolean }) => {
      const table = postgrestTable(req.url);
      if (table === 'conversation_participants') {
        // Only SENDER participates, not RECEIVER -> no shared conversation.
        return {
          status: 200,
          json: shapePostgrestRows(
            applyPostgrestFilters([{ conversation_id: CONVERSATION, user_id: SENDER }], req.url),
            req.single,
          ),
        };
      }
      if (table === 'conversations') {
        return {
          status: 200,
          json: shapePostgrestRows(
            applyPostgrestFilters([{ id: CONVERSATION, type: 'dm' }], req.url),
            req.single,
          ),
        };
      }
      return { status: 404, json: {} };
    };
    (globalThis as any).fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (isInfraRegistryRequest(input)) return infraRegistryResponse();
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || 'GET';
      const resp = onlySender.handle({ url, method, single: prefersObjectResponse(init) });
      return jsonResponse(resp.status, resp.json);
    });
    const conversationId = await resolveMessageRequestConversation(SENDER, RECEIVER);
    expect(conversationId).toBeUndefined();
  });

  it('does not resolve when the actor is the same as the recipient (self)', async () => {
    const conversationId = await resolveMessageRequestConversation(SENDER, SENDER);
    expect(conversationId).toBeUndefined();
  });

  it('still yields ONE pending request across repeated sends (dedup preserved)', async () => {
    for (let i = 0; i < 5; i++) {
      await ensureMessageRequest({
        senderId: SENDER,
        receiverId: RECEIVER,
        conversationId: CONVERSATION,
        category: 'spam',
      });
    }
    const all = (await dataClient.from('message_requests').select('*')).data || [];
    expect(all).toHaveLength(1);
    expect(__notifications).toHaveLength(1);
  });
});