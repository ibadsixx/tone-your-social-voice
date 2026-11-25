// Regression test for the reported delivery bug (messages.md):
//
//   "The Message Request is no longer reaching the recipient at all."
//
// The live conversations host's `message_requests` table has NO
// `conversation_id` column (migration 20260902000000 is applied per host), so
// ensureMessageRequest's first insert — which carries conversation_id — fails.
// The deployed dataClient masks the underlying Postgres 42703 with a generic
// `500 {"error":"Internal server error"}`, so error-text matching cannot detect
// the missing column. ensureMessageRequest must therefore retry ONCE with the
// schema-stable payload (no conversation_id) for any non-duplicate insert error,
// so the request row + recipient notification are created even against a host
// (and dataClient) that do not support the column yet.
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
import { ensureMessageRequest } from '@/lib/messageRequests';

export const __notifications: unknown[] = [];

vi.mock('@/hooks/useNotifications', () => ({
  createNotification: (n: unknown) => (__notifications as unknown[]).push(n),
}));

const SENDER = 'sender-uuid-0001';
const RECEIVER = 'receiver-uuid-0002';
const CONVERSATION = 'conversation-uuid-0001';

let notifications: unknown[] = [];


// In-memory model of the PRE-migration conversations host: the
// `message_requests` table has no `conversation_id` column, and the dataClient
// answers the failed insert with the generic masked 500. Inserts WITHOUT
// `conversation_id` (the retry) succeed. Reads filter client-side like the real
// dataClient.
function makeHostDb() {
  const messageRequests: any[] = [];

  return {
    handle(req: { url: string; method?: string; body?: unknown; single?: boolean }) {
      const table = postgrestTable(req.url);
      const method = req.method || 'GET';
      const apply = (rows: any[]) => shapePostgrestRows(applyPostgrestOrder(applyPostgrestFilters(rows, req.url), req.url), req.single);

      if (table === 'message_requests') {
        if (method === 'GET') {
          return { status: 200, json: apply(messageRequests) };
        }
        if (method === 'POST') {
          const body = req.body as any;
          if ('conversation_id' in body) {
            // The live table (pre-20260902000000) rejects the column; the
            // deployed dataClient masks the real 42703 with a generic 500 — the
            // exact shape the SPA receives today.
            return { status: 500, json: { error: 'Internal server error' } };
          }
          const row = {
            id: 'req-' + (messageRequests.length + 1),
            ...body,
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

      if (table === 'friends') {
        return { status: 200, json: [] };
      }
      if (table === 'restricted_users') {
        return { status: 200, json: [] };
      }

      return { status: 404, json: { error: `no mock route for ${method} ${table}` } };
    },
    messageRequests,
  };
}

beforeEach(() => {
  localStorage.clear();
  setCurrentAccessToken('test-token');
  notifications = [];

  const db = makeHostDb();
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

  notifications = __notifications;
  __notifications.length = 0;
});

afterEach(() => {
  clearCurrentAccessToken();
});

describe('Message Request delivery against the pre-migration conversations host', () => {
  it('first message to a non-friend creates ONE pending request + notification even when the host rejects conversation_id', async () => {
    // Exactly the send orchestration: the first message to a non-friend calls
    // ensureMessageRequest WITH the conversation_id the message went into.
    await ensureMessageRequest({
      senderId: SENDER,
      receiverId: RECEIVER,
      conversationId: CONVERSATION,
      category: 'spam',
    });

    // The request row was created (via the schema-stable retry) and the
    // recipient's notification was registered — delivery is restored.
    const rows = (await dataClient.from('message_requests').select('*')).data || [];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sender_id: SENDER,
      receiver_id: RECEIVER,
      status: 'pending',
      category: 'spam',
    });
    // Schema-stable retry: the row must NOT carry a column the host lacks.
    expect('conversation_id' in rows[0]).toBe(false);

    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      userId: RECEIVER,
      actorId: SENDER,
      type: 'message_request',
    });
  });

  it('subsequent sends reuse the schema-stable request (still exactly ONE request + ONE notification)', async () => {
    for (let i = 0; i < 4; i++) {
      await ensureMessageRequest({
        senderId: SENDER,
        receiverId: RECEIVER,
        conversationId: CONVERSATION,
        category: 'spam',
      });
    }

    const rows = (await dataClient.from('message_requests').select('*')).data || [];
    expect(rows).toHaveLength(1);
    expect(notifications).toHaveLength(1);
  });

  it('a pre-existing request is reused — no duplicate row, no redundant second notification', async () => {
    // A concurrent send already landed a schema-stable request.
    await dataClient.from('message_requests').insert({
      sender_id: SENDER,
      receiver_id: RECEIVER,
      status: 'pending',
      category: 'spam',
    });

    await ensureMessageRequest({
      senderId: SENDER,
      receiverId: RECEIVER,
      conversationId: CONVERSATION,
      category: 'you_may_know',
    });

    // The existing row is left untouched (no duplicate insert, no re-classify —
    // the request already exists, which is exactly the desired outcome).
    const rows = (await dataClient.from('message_requests').select('*')).data || [];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'pending', category: 'spam' });
    // The row's own send path fired the notification, not this reuse.
    expect(notifications).toHaveLength(0);
  });
});