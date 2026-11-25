// People-You-May-Know hook + dataClient contract (social "People You May Know.md",
// Final-verification scenarios 9, 10, 11):
//   - The hook loads suggestions from the dataClient's get_people_you_may_know RPC
//     (server-side computation) and maps the dataClient response shape.
//   - Scenario 9: "Add Friend" reuses the EXISTING friendship system — an insert
//     into the `friends` table (no dedicated suggestion-accept RPC).
//   - Scenario 10: the browser never fetches every profile/user — the only data
//     reads are the RPC call and the existing friend/follower writes.
//   - Duplicate-key responses are treated as success.
import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { clearCurrentAccessToken, setCurrentAccessToken } from '@/lib/supabase/sessionTokenProvider';
import {
  infraRegistryResponse,
  isInfraRegistryRequest,
  jsonResponse,
  MOCK_ORIGIN,
  postgrestTable,
} from './infraFixtures';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'alice-uuid' }, loading: false }),
}));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { usePeopleYouMayKnow } from '@/hooks/usePeopleYouMayKnow';

const RPC_URL = `${MOCK_ORIGIN}/rest/v1/rpc/get_people_you_may_know`;
const FRIENDS_URL = `${MOCK_ORIGIN}/rest/v1/friends`;
const FOLLOWERS_URL = `${MOCK_ORIGIN}/rest/v1/followers`;

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

let friendsInsertStatus: number;
let fetchMock: ReturnType<typeof vi.fn>;
let seenUrls: string[];

beforeEach(() => {
  setCurrentAccessToken('test-token');
  friendsInsertStatus = 201;
  seenUrls = [];

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (isInfraRegistryRequest(input)) return infraRegistryResponse();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    seenUrls.push(url);
    const method = init?.method || 'GET';
    if (url.startsWith(RPC_URL) && method === 'POST') {
      return jsonResponse(200, [SUGGESTION]);
    }
    if (url.startsWith(FRIENDS_URL) && method === 'POST') {
      return friendsInsertStatus >= 400
        ? jsonResponse(friendsInsertStatus, { code: '23505', message: 'duplicate friend request' })
        : jsonResponse(201, {});
    }
    if (url.startsWith(FOLLOWERS_URL) && method === 'POST') {
      return jsonResponse(201, {});
    }
    throw new Error(`no mock route for ${method} ${url}`);
  });
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  clearCurrentAccessToken();
  vi.restoreAllMocks();
});

describe('usePeopleYouMayKnow via the dataClient RPC', () => {
  it('loads suggestions from get_people_you_may_know and maps the dataClient response', async () => {
    const { result } = renderHook(() => usePeopleYouMayKnow(10));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.suggestions).toHaveLength(1);
    const person = result.current.suggestions[0];
    expect(person.id).toBe('dave-uuid');
    expect(person.mutual_friends_count).toBe(2);
    expect(person.mutual_groups_count).toBe(1);
    expect(person.mutual_followers_count).toBe(1);

    // The RPC lives on the friends project as a real PostgREST endpoint.
    expect(seenUrls.some((u) => u.startsWith(RPC_URL))).toBe(true);
    // The browser must NOT fetch every profile/user (scenario 11).
    expect(seenUrls.some((u) => ['profiles', 'users'].includes(postgrestTable(u)))).toBe(false);
  });

  it('Add Friend reuses the existing friends table (scenario 9)', async () => {
    const { result } = renderHook(() => usePeopleYouMayKnow(10));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let ok = false;
    await act(async () => {
      ok = await result.current.sendFriendRequest('dave-uuid');
    });
    expect(ok).toBe(true);

    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    const friendPost = posts.find(([url]) => String(url).startsWith(FRIENDS_URL));
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
    expect(seenUrls.filter((u) => u.startsWith(RPC_URL)).length).toBeGreaterThanOrEqual(2);
  });
});
