// People-You-May-Know hook + gateway contract (social "People You May Know.md",
// Final-verification scenarios 9, 10, 11):
//   - The hook loads suggestions from the gateway's get_people_you_may_know RPC
//     (server-side computation) and maps the gateway response shape.
//   - Scenarios 9: "Add Friend" reuses the EXISTING friendship system — a POST
//     to /api/friends (no dedicated suggestion-accept RPC).
//   - Scenario 10: the browser never fetches every profile/user — the only data
//     reads are the RPC call and the existing friend/follower writes.
//   - Gateways that report duplicate-key as HTTP 409 are treated as success.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'alice-uuid' }, loading: false }),
}));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { usePeopleYouMayKnow } from '@/hooks/usePeopleYouMayKnow';

const RPC_URL = 'http://mock.test/api/rpc/get_people_you_may_know';

const SUGGESTION = {
  id: 'dave-uuid',
  username: 'dave',
  display_name: 'Dave',
  profile_pic: null,
  mutual_friends_count: 2,
  mutual_groups_count: 1,
  mutual_followers_count: 1,
  same_college: false,
  same_city: false,
  score: 25,
  created_at: '2026-01-01T00:00:00Z',
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  } as Response;
}

let friendsInsertStatus: number;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('tone-auth-token', JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh' }));
  friendsInsertStatus = 201;

  const seenUrls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    seenUrls.push(url);
    const method = init?.method || 'GET';
    if (url === RPC_URL && method === 'POST') {
      return jsonResponse(200, [SUGGESTION]);
    }
    if (url === 'http://mock.test/api/friends' && method === 'POST') {
      return jsonResponse(friendsInsertStatus, {});
    }
    if (url === 'http://mock.test/api/followers' && method === 'POST') {
      return jsonResponse(201, {});
    }
    throw new Error(`no mock route for ${method} ${url}`);
  });
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock;
  (globalThis as unknown as { __seenUrls: string[] }).__seenUrls = seenUrls;
  (globalThis as unknown as { __fetchMock: typeof fetchMock }).__fetchMock = fetchMock;
});

describe('usePeopleYouMayKnow via the gateway RPC', () => {
  it('loads suggestions from get_people_you_may_know and maps the gateway response', async () => {
    const { result } = renderHook(() => usePeopleYouMayKnow(10));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.suggestions).toHaveLength(1);
    const person = result.current.suggestions[0];
    expect(person.id).toBe('dave-uuid');
    expect(person.mutual_friends_count).toBe(2);
    expect(person.mutual_groups_count).toBe(1);
    expect(person.mutual_followers_count).toBe(1);

    const seen = (globalThis as unknown as { __seenUrls: string[] }).__seenUrls;
    expect(seen).toContain(RPC_URL);
    // The browser must NOT fetch every profile/user (scenario 11).
    expect(seen.some((u) => u.includes('/api/profiles') || u.includes('/api/users'))).toBe(false);
  });

  it('Add Friend reuses the existing friends table (scenario 9)', async () => {
    const { result } = renderHook(() => usePeopleYouMayKnow(10));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let ok = false;
    await act(async () => {
      ok = await result.current.sendFriendRequest('dave-uuid');
    });
    expect(ok).toBe(true);

    const fetchMock = (globalThis as unknown as { __fetchMock: ReturnType<typeof vi.fn> }).__fetchMock;
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    const friendPost = posts.find(([url]) => String(url).endsWith('/api/friends'));
    expect(friendPost).toBeTruthy();
    const body = JSON.parse(friendPost![1].body as string);
    expect(body).toEqual({ requester_id: 'alice-uuid', receiver_id: 'dave-uuid', status: 'pending' });

    // Optimistic removal: the request is gone from the UI immediately.
    await waitFor(() => expect(result.current.suggestions.find((p) => p.id === 'dave-uuid')).toBeUndefined());
  });

  it('duplicate-key (409) friend request is treated as success', async () => {
    const { result } = renderHook(() => usePeopleYouMayKnow(10));
    await waitFor(() => expect(result.current.loading).toBe(false));

    friendsInsertStatus = 409;
    let ok = false;
    await act(async () => {
      ok = await result.current.sendFriendRequest('dave-uuid');
    });
    expect(ok).toBe(true);
    await waitFor(() => expect(result.current.suggestions.find((p) => p.id === 'dave-uuid')).toBeUndefined());
  });

  it('refetch re-queries the RPC endpoint', async () => {
    const { result } = renderHook(() => usePeopleYouMayKnow(10));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.refetch();
    });
    const seen = (globalThis as unknown as { __seenUrls: string[] }).__seenUrls;
    expect(seen.filter((u) => u === RPC_URL).length).toBeGreaterThanOrEqual(2);
  });
});