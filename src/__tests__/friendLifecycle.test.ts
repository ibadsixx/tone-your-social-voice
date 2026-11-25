// End-to-end dataClient client integration for the friend-request lifecycle.
// Simulates the dataClient (server ignores filters; client does local filtering /
// join resolution) to verify that after the receiver accepts:
//   - the accept UPDATE persists,
//   - the sender's status query (or=(and(...),and(...))) returns 'accepted',
//   - the sender's friends-list join query returns the friend.
import { afterEach, describe, expect, beforeEach, it, vi } from 'vitest';
import { clearCurrentAccessToken, setCurrentAccessToken } from '@/lib/supabase/sessionTokenProvider';
import {
  applyPostgrestFilters,
  infraRegistryResponse,
  isInfraRegistryRequest,
  jsonResponse,
  postgrestTable,
  prefersObjectResponse,
  shapePostgrestRows,
} from './infraFixtures';

import { dataClient } from '@/lib/supabase/dataClient';

const SENDER = 'sender-uuid-0001';
const RECEIVER = 'receiver-uuid-0002';
const ROW_ID = 'friendship-row-0001';

const senderProfile = { id: SENDER, username: 'sender', display_name: 'Sender', profile_pic: null };
const receiverProfile = { id: RECEIVER, username: 'receiver', display_name: 'Receiver', profile_pic: null };

function makeInMemoryDb() {
  const friends = [
    { id: 'friendship-row-0001', requester_id: SENDER, receiver_id: RECEIVER, status: 'pending', created_at: '2026-01-01T00:00:00Z' },
  ];
  return {
    friends,
    handle(req: { url: string; method?: string; body?: unknown; single?: boolean }) {
      const table = postgrestTable(req.url);
      const method = req.method || 'GET';
      const apply = (rows: any[]) => shapePostgrestRows(applyPostgrestFilters(rows, req.url), req.single);
      const profiles = [senderProfile, receiverProfile];

      if (table === 'friends') {
        if (method === 'GET') {
          const rows = applyPostgrestFilters(friends, req.url) as any[];
          // PostgREST performs the embed server-side; model it here so the
          // client is exercised against the same row shape it receives live.
          const select = new URL(req.url).searchParams.get('select') ?? '';
          const embedded = select.includes('requester_profile')
            ? rows.map((row) => ({
                ...row,
                requester_profile: profiles.find((p) => p.id === row.requester_id) ?? null,
                receiver_profile: profiles.find((p) => p.id === row.receiver_id) ?? null,
              }))
            : rows;
          return { status: 200, json: shapePostgrestRows(embedded, req.single) };
        }
        if (method === 'POST') {
          const row = { id: 'new-' + friends.length, ...(req.body as object), created_at: '2026-01-01T00:00:00Z' };
          friends.push(row as any);
          return { status: 201, json: shapePostgrestRows([row], req.single) };
        }
        if (method === 'PATCH') {
          const id = new URL(req.url).searchParams.get('id')?.replace(/^eq\./, '');
          const row = friends.find((f) => f.id === id);
          if (!row) return { status: 404, json: { error: 'not found' } };
          Object.assign(row, req.body);
          return { status: 200, json: shapePostgrestRows([row], req.single) };
        }
      }

      if (table === 'profiles') return { status: 200, json: apply(profiles) };
      if (table === 'followers') return { status: 200, json: shapePostgrestRows([], req.single) };

      return { status: 404, json: { error: `no mock route for ${method} ${table}` } };
    },
  };
}

beforeEach(() => {
  setCurrentAccessToken('test-token');

  const db = makeInMemoryDb();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method || 'GET';
    let body: unknown = undefined;
    if (init?.body) body = JSON.parse(init.body as string);
    if (isInfraRegistryRequest(input)) return infraRegistryResponse();
    const resp = db.handle({ url, method, body, single: prefersObjectResponse(init) });
    return jsonResponse(resp.status, resp.json);
  });
  (globalThis as any).fetch = fetchMock;
});

afterEach(() => {
  clearCurrentAccessToken();
});

describe('friend request lifecycle via dataClient', () => {
  it('receiver accept persists and sender sees ACCEPTED status', async () => {
    // Receiver accepts the pending request.
    const { data: updated, error } = await dataClient
      .from('friends')
      .update({ status: 'accepted' })
      .eq('id', ROW_ID)
      .select()
      .single();

    expect(error).toBeNull();
    expect(updated?.status).toBe('accepted');

    // Sender's status query should now return that friendship as accepted.
    const { data: friendship, error: fErr } = await dataClient
      .from('friends')
      .select('*')
      .or(`and(requester_id.eq.${SENDER},receiver_id.eq.${RECEIVER}),and(requester_id.eq.${RECEIVER},receiver_id.eq.${SENDER})`)
      .maybeSingle();

    expect(fErr).toBeNull();
    expect(friendship?.id).toBe(ROW_ID);
    expect(friendship?.status).toBe('accepted');
  });

  it('sender friends-list join query returns the friend after accept', async () => {
    await dataClient.from('friends').update({ status: 'accepted' }).eq('id', ROW_ID).select().single();

    const { data, error } = await dataClient
      .from('friends')
      .select(`
        *,
        requester_profile:profiles!friends_requester_id_fkey(id, username, display_name, profile_pic),
        receiver_profile:profiles!friends_receiver_id_fkey(id, username, display_name, profile_pic)
      `)
      .or(`requester_id.eq.${SENDER},receiver_id.eq.${SENDER}`)
      .eq('status', 'accepted');

    expect(error).toBeNull();
    expect(data?.length).toBe(1);

    const row = data![0] as any;
    const isRequester = row.requester_id === SENDER;
    const friendProfile = isRequester ? row.receiver_profile : row.requester_profile;
    expect(friendProfile?.id).toBe(RECEIVER);
    expect(friendProfile?.username).toBe('receiver');
  });

  it('receiver viewing sender page sees ACCEPTED, not Add Friend', async () => {
    await dataClient.from('friends').update({ status: 'accepted' }).eq('id', ROW_ID).select().single();

    // Receiver (current user) visits the SENDER's profile page.
    const { data: friendship, error } = await dataClient
      .from('friends')
      .select('*')
      .or(`and(requester_id.eq.${RECEIVER},receiver_id.eq.${SENDER}),and(requester_id.eq.${SENDER},receiver_id.eq.${RECEIVER})`)
      .maybeSingle();

    expect(error).toBeNull();
    expect(friendship?.id).toBe(ROW_ID);
    expect(friendship?.status).toBe('accepted');
    // isSender=false for the receiver (requester is the sender).
    expect(friendship?.requester_id).toBe(SENDER);
  });

  it('receiver friends tab (fetchFriends logic) returns the sender as a friend', async () => {
    await dataClient.from('friends').update({ status: 'accepted' }).eq('id', ROW_ID).select().single();

    const profileId = RECEIVER;
    const { data: friendsData } = await dataClient
      .from('friends')
      .select('created_at, requester_id, receiver_id')
      .or(`requester_id.eq.${profileId},receiver_id.eq.${profileId}`)
      .eq('status', 'accepted');

    expect(friendsData?.length).toBe(1);
    const friendship = friendsData![0] as any;
    // receiver is the receiver, so the friend is the requester (sender).
    const friendId = friendship.requester_id === profileId ? friendship.receiver_id : friendship.requester_id;
    expect(friendId).toBe(SENDER);

    const { data: profilesData } = await dataClient
      .from('profiles')
      .select('id, username, display_name, profile_pic')
      .in('id', [friendId]);

    const sender = profilesData?.find((p: any) => p.id === SENDER);
    expect(sender?.username).toBe('sender');
  });
});
