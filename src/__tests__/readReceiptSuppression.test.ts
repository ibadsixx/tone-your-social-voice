// Regression test for the read-receipt / pending message-request bug (see
// messages.md).
//
// Scenario: A (sender) messages non-friend B and does NOT get accepted. While
// the request is pending, B must be able to open the conversation READ-ONLY to
// preview the message, and the sender must NOT learn the message was read
// (i.e. no ✓✓ / "Seen"). The suppression is centralized in
// isReadOnlyPendingConversation, which the hook's markMessagesAsRead now
// consults as the single authoritative gate for BOTH the message_reads DB write
// and the realtime message.read ping.
//
// This exercises isReadOnlyPendingConversation against an in-memory model of
// conversations + conversation_participants + message_requests to confirm the
// detection is correctly direction-sensitive and type-scoped:
//   - B (recipient of the pending request) is READ-ONLY,
//   - A (sender) is NOT read-only,
//   - after the request is accepted, neither side is read-only anymore.
//   - a GROUP conversation is never read-only, even when a stale pending DM
//     request exists from the member that happens to be participants[0] (the
//     pending-request concept is direct-message-only).
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

import { isReadOnlyPendingConversation } from '@/hooks/useConversations';

const SENDER = 'sender-uuid-0001';
const RECEIVER = 'receiver-uuid-0002';
const THIRD = 'third-uuid-0003';
const CONVERSATION = 'conversation-uuid-0001';
const GROUP_CONVERSATION = 'conversation-uuid-0002';


function makeDb({ requestStatus, dmType = 'dm' }: { requestStatus: string | null; dmType?: string }) {
  const conversations: Array<{ id: string; type: string }> = [
    { id: CONVERSATION, type: dmType },
    { id: GROUP_CONVERSATION, type: 'group' },
  ];
  const participants: any[] = [
    { conversation_id: CONVERSATION, user_id: SENDER },
    { conversation_id: CONVERSATION, user_id: RECEIVER },
    { conversation_id: GROUP_CONVERSATION, user_id: SENDER },
    { conversation_id: GROUP_CONVERSATION, user_id: RECEIVER },
    { conversation_id: GROUP_CONVERSATION, user_id: THIRD },
  ];
  const messageRequests: any[] =
    requestStatus === null
      ? []
      : [
          {
            id: 'req-1',
            sender_id: SENDER,
            receiver_id: RECEIVER,
            conversation_id: CONVERSATION,
            status: requestStatus,
          },
        ];

  return {
    handle(req: { url: string; method?: string; single?: boolean }) {
      const table = postgrestTable(req.url);
      const method = req.method || 'GET';

      if (table === 'conversations') {
        let rows = conversations.slice();
      rows = applyPostgrestOrder(applyPostgrestFilters(rows, req.url), req.url);
        return { status: 200, json: shapePostgrestRows(rows, req.single) };
      }

      if (table === 'conversation_participants') {
        let rows = participants.slice();
      rows = applyPostgrestOrder(applyPostgrestFilters(rows, req.url), req.url);
        return { status: 200, json: rows };
      }

      if (table === 'message_requests') {
        let rows = messageRequests.slice();
      rows = applyPostgrestOrder(applyPostgrestFilters(rows, req.url), req.url);
        return { status: 200, json: rows };
      }

      return { status: 404, json: { error: `no mock route for ${table}` } };
    },
  };
}

beforeEach(() => {
  setCurrentAccessToken('test-token');
});

function install(db: ReturnType<typeof makeDb>) {
  (globalThis as any).fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (isInfraRegistryRequest(input)) return infraRegistryResponse();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const resp = db.handle({ url, method: 'GET', single: prefersObjectResponse(init) });
    return jsonResponse(resp.status, resp.json);
  });
}

afterEach(() => {
  clearCurrentAccessToken();
});

describe('isReadOnlyPendingConversation (read-receipt suppression gate)', () => {
  it('is TRUE for the recipient of a still-pending request (preview is read-only)', async () => {
    install(makeDb({ requestStatus: 'pending' }));
    const ro = await isReadOnlyPendingConversation(CONVERSATION, RECEIVER);
    expect(ro).toBe(true);
  });

  it('is FALSE for the sender while the request is pending (they may send + see receipts)', async () => {
    install(makeDb({ requestStatus: 'pending' }));
    const ro = await isReadOnlyPendingConversation(CONVERSATION, SENDER);
    expect(ro).toBe(false);
  });

  it('is FALSE for the recipient once the request is accepted (receipts resume)', async () => {
    install(makeDb({ requestStatus: 'accepted' }));
    const ro = await isReadOnlyPendingConversation(CONVERSATION, RECEIVER);
    expect(ro).toBe(false);
  });

  it('is FALSE when no request exists at all', async () => {
    install(makeDb({ requestStatus: null }));
    const ro = await isReadOnlyPendingConversation(CONVERSATION, RECEIVER);
    expect(ro).toBe(false);
  });

  it('is FALSE for a GROUP conversation even when a pending DM request exists from its participants[0] member', async () => {
    install(makeDb({ requestStatus: 'pending' }));
    const ro = await isReadOnlyPendingConversation(GROUP_CONVERSATION, RECEIVER);
    expect(ro).toBe(false);
  });
});
