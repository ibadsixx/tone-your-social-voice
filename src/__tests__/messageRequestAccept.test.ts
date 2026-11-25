// Regression test for the final Message Request acceptance behavior (messages.md).
//
// When the recipient accepts a Message Request the system:
//   - keeps the EXACT SAME conversation (no new conversation, no duplicate)
//   - flips the existing request status pending -> accepted
//   - removes it from the recipient's Pending list
//   - immediately surfaces the SAME conversation in the recipient's Chats list
//   - retains messages / participants / history
//   - restores the normal chat UI (no more read-only pending preview)
//   - leaves the sender's existing conversation unchanged (not duplicated)
//
// This drives the real dataClient client + the real conversation API / hook
// helpers against an in-memory model of the relevant tables, and asserts every
// acceptance invariant above — including that resolveSharedDmConversation is
// find-only (accepting can never mint a new DM).
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
import { resolveSharedDmConversation } from '@/api/conversations';
import { ensureMessageRequest } from '@/lib/messageRequests';
import {
  fetchVisibleDmUserIds,
  filterRequestConversations,
  fetchConversationsDirectly,
  isReadOnlyPendingConversation,
  assertCanSendMessage,
} from '@/hooks/useConversations';

export const __notifications: unknown[] = [];

vi.mock('@/hooks/useNotifications', () => ({
  createNotification: (n: unknown) => (__notifications as unknown[]).push(n),
}));


const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; // sender (initiated the DM)
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'; // non-friend recipient
const C = 'cccccccc-cccc-cccc-cccc-cccccccccccc'; // the ONE shared conversation

function makeInMemoryDb(opts?: { bSent?: boolean }) {
  const messageRequests: any[] = [
    {
      id: 'req-1',
      sender_id: A,
      receiver_id: B,
      status: 'pending',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];
  const friends: any[] = []; // A and B are NOT friends
  const participants: any[] = [
    { conversation_id: C, user_id: A },
    { conversation_id: C, user_id: B },
  ];
  const conversations: any[] = [
    { id: C, type: 'dm', description: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ];
  const profiles: any[] = [
    { id: A, username: 'a', display_name: 'A', profile_pic: null, last_seen_at: null },
    { id: B, username: 'b', display_name: 'B', profile_pic: null, last_seen_at: null },
  ];
  // By default B has already replied (m3) — that alone surfaces C in B's Chats
  // via the "sent a message" path. For the pending-block regression test we
  // model the pristine case (recipient has sent nothing) so visibility is
  // decided purely by request state.
  const messages: any[] = [
    { id: 'm1', conversation_id: C, sender_id: A, receiver_id: B, content: '1st', created_at: '2026-01-01T00:00:01Z' },
    { id: 'm2', conversation_id: C, sender_id: A, receiver_id: B, content: '2nd', created_at: '2026-01-01T00:00:02Z' },
    ...(opts?.bSent === false ? [] : [{ id: 'm3', conversation_id: C, sender_id: B, receiver_id: A, content: '3rd', created_at: '2026-01-01T00:00:03Z' }]),
  ];


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

      // PostgREST updates are PATCH with `?id=eq.<id>`, not Gateway PUTs.
      if (method === 'PATCH' && table === 'message_requests') {
        const id = new URL(req.url).searchParams.get('id')?.replace(/^eq\./, '');
        const row = messageRequests.find(r => r.id === id);
        if (!row) return { status: 404, json: { error: 'not found' } };
        Object.assign(row, req.body as object, { updated_at: '2026-01-01T00:00:01Z' });
        return { status: 200, json: row };
      }

      if (table === 'conversation_participants') {
        return { status: 200, json: apply(participants.slice()) };
      }

      if (table === 'conversations') {
        return { status: 200, json: apply(conversations.slice()) };
      }

      if (table === 'profiles') {
        return { status: 200, json: apply(profiles.slice()) };
      }

      if (table === 'messages') {
        if (method === 'POST') {
          const row = {
            id: 'm' + (messages.length + 1),
            ...(req.body as object),
            created_at: '2026-01-02T00:00:' + String(messages.length + 1).padStart(2, '0') + 'Z',
          } as any;
          messages.push(row);
          return { status: 201, json: row };
        }
        return { status: 200, json: apply(messages.slice()) };
      }

      if (table === 'friends') {
        return { status: 200, json: apply(friends.slice()) };
      }

      return { status: 404, json: { error: `no mock route for ${method} ${table}` } };
    },
    conversations,
    messageRequests,
  };
}

let db: ReturnType<typeof makeInMemoryDb>;

beforeEach(() => {
  localStorage.clear();
  setCurrentAccessToken('test-token');

  db = makeInMemoryDb();
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

describe('final Message Request acceptance behavior', () => {
  it('keeps the SAME conversation, flips status, clears Pending, surfaces Chats, retains history, no duplicates', async () => {
    // 1) Accept flips the request status to accepted (the hook's own update).
    await dataClient.from('message_requests').update({ status: 'accepted' }).eq('id', 'req-1');

    // 2) NO new conversation is created — the conversations table still holds
    //    exactly the one DM the sender created, with the SAME id.
    const allReqs = (await dataClient.from('message_requests').select('*')).data || [];
    expect(allReqs).toHaveLength(1);
    expect(allReqs[0]).toMatchObject({ id: 'req-1', sender_id: A, receiver_id: B, status: 'accepted' });

    expect(db.conversations).toHaveLength(1);
    expect(db.conversations[0].id).toBe(C);

    // 3) Accept resolves to the EXACT SAME conversation (find-only, no create).
    const { data: conversationId } = await resolveSharedDmConversation(B, A);
    expect(conversationId).toBe(C);
    expect(db.conversations).toHaveLength(1); // resolve never mints a new DM

    // 4) The request is removed from the recipient's Pending list.
    const pending = (await dataClient.from('message_requests').select('*').eq('status', 'pending')).data || [];
    expect(pending).toHaveLength(0);

    // 5) The SAME conversation now appears in the recipient's Chats, with the
    //    sender as the peer and the full history retained (3 messages kept).
    const chatsB = await fetchConversationsDirectly(B);
    expect(chatsB.length).toBe(1);
    expect(chatsB[0].conversation_id).toBe(C);
    expect(chatsB[0].other_user?.id).toBe(A);
    expect(chatsB[0].last_message?.content).toBe('3rd'); // newest of the 3 retained

    // 6) The sender's existing conversation is unchanged — not duplicated,
    //    still the SAME id.
    const chatsA = await fetchConversationsDirectly(A);
    expect(chatsA.length).toBe(1);
    expect(chatsA[0].conversation_id).toBe(C);

    // 7) Normal chat UI is restored: the conversation is no longer treated as a
    //    read-only pending preview (no read-receipt suppression, full composer).
    expect(await isReadOnlyPendingConversation(C, B)).toBe(false);
  });

  it('surfaces an accepted request sender in the recipient Chats filter (pending-made-visible)', async () => {
    await dataClient.from('message_requests').update({ status: 'accepted' }).eq('id', 'req-1');

    const { visibleUserIds, visitedConversationIds } = await fetchVisibleDmUserIds(B);
    expect(visibleUserIds.has(A)).toBe(true);

    const firstOtherPerConv = new Map<string, string>([[C, A]]);
    const filtered = filterRequestConversations(
      [{ id: C, type: 'dm' }],
      firstOtherPerConv,
      visibleUserIds,
      visitedConversationIds
    );
    expect(filtered.map(c => c.id)).toContain(C);
  });

  it('still holds the request OUT of the recipient Chats while PENDING', async () => {
    // Before acceptance the same conversation must NOT surface in B's Chats
    // (only in Pending) — the acceptance flow turns that on.
    const { visibleUserIds } = await fetchVisibleDmUserIds(B);
    expect(visibleUserIds.has(A)).toBe(false);
  });

  it('does not create a duplicate Message Request or a new conversation when chatting continues after accept', async () => {
    // Spec acceptance test: after B accepts, A and B keep chatting (A sends a
    // 4th message). ensureMessageRequest must respect the ACCEPTED request row
    // (it is not status=pending anymore) and stop — no second insert, no
    // duplicate notification, and the conversation stays the SAME one.
    await dataClient.from('message_requests').update({ status: 'accepted' }).eq('id', 'req-1');
    __notifications.length = 0;

    await dataClient.from('messages').insert({
      conversation_id: C,
      sender_id: A,
      receiver_id: B,
      content: '4th',
    });
    await ensureMessageRequest({ senderId: A, receiverId: B, conversationId: C });

    const allRequests = (await dataClient.from('message_requests').select('*')).data || [];
    expect(allRequests).toHaveLength(1);
    expect(allRequests[0]).toMatchObject({ id: 'req-1', status: 'accepted' });
    expect(__notifications).toHaveLength(0); // no "sent you a message" for the accepted pair

    // Neither party's Chats should ever show a DIFFERENT conversation.
    const convs = await dataClient.from('conversations').select('id');
    expect(convs.data?.length).toBe(1);
    expect(convs.data?.[0].id).toBe(C);
    const chatsB = await fetchConversationsDirectly(B);
    expect(chatsB.length).toBe(1);
    expect(chatsB[0].conversation_id).toBe(C);
    expect(chatsB[0].last_message?.content).toBe('4th');
  });

  it('blocks a reply send from the recipient while the request is still PENDING (no implicit acceptance)', async () => {
    // Regression for the auto-accept / auto-move observation. Model the pristine
    // case: the RECIPIENT (B) has NOT sent anything yet — the conversation's
    // visibility depends purely on the request state. While A's request is
    // still PENDING:
    //   - B's data-layer send guard must refuse (sendMessage calls
    //     assertCanSendMessage before any write) — no implicit acceptance,
    //   - B can neither write a reply nor surface the conversation in Chats,
    //   - the sender (A) keeps the normal composer.
    // Only an explicit accept opens B's composer AND surfaces the chat.
    const pendingOnly = makeInMemoryDb({ bSent: false });
    const fetchMock2 = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (isInfraRegistryRequest(input)) return infraRegistryResponse();
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || 'GET';
      let body: unknown = undefined;
      if (init?.body) body = JSON.parse(init.body as string);
      const resp = pendingOnly.handle({ url, method, body, single: prefersObjectResponse(init) });
      return jsonResponse(resp.status, resp.json);
    });
    (globalThis as any).fetch = fetchMock2;

    const before = ((await dataClient.from('messages').select('*')).data || []).length;

    // The RECIPIENT is refused...
    expect(await assertCanSendMessage(C, B)).toBe(false);
    // ...the SENDER keeps the normal composer...
    expect(await assertCanSendMessage(C, A)).toBe(true);

    // The read-only treatment is still active, and NOTHING was written by the
    // guard itself (no message insert), and the request is STILL pending.
    expect(await isReadOnlyPendingConversation(C, B)).toBe(true);
    const after = ((await dataClient.from('messages').select('*')).data || []).length;
    expect(after).toBe(before); // no reply leaked into the shared conversation
    expect(pendingOnly.messageRequests).toHaveLength(1);
    expect(pendingOnly.messageRequests[0].status).toBe('pending'); // status must NOT flip

    // Pending: conversation holds OUT of the recipient's Chats (nothing sent by
    // B, request not accepted), while the sender sees it.
    const chatsB = await fetchConversationsDirectly(B);
    expect(chatsB.length).toBe(0);
    const chatsA = await fetchConversationsDirectly(A);
    expect(chatsA.length).toBe(1);

    // Once the recipient EXPLICITLY accepts, the guard opens up and the SAME
    // conversation surfaces in the recipient's Chats.
    await dataClient.from('message_requests').update({ status: 'accepted' }).eq('id', 'req-1');
    expect(await assertCanSendMessage(C, B)).toBe(true);
    expect(await isReadOnlyPendingConversation(C, B)).toBe(false);
    const chatsBAfter = await fetchConversationsDirectly(B);
    expect(chatsBAfter.length).toBe(1);
    expect(chatsBAfter[0].conversation_id).toBe(C);
  });
});