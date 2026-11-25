// Regression: the Friends API used to emit a malformed PostgREST logic tree.
//
// `dataClient.from('friends').or('requester_id=eq.<id>,receiver_id=eq.<id>')`
// produces an invalid PostgREST logic tree: PostgREST only accepts
// `column.operator.value` (dot) conditions inside `or=(...)` — see
// https://docs.postgrest.org/en/stable/references/api/tables_views.html#logical-operators
// — so the request 400s and the caller sees no friends.
//
// This test speaks to a mock server that parses the logic tree the way
// PostgREST does, so an `=eq.` regression fails here instead of silently
// rendering an empty dialog.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearCurrentAccessToken, setCurrentAccessToken } from '@/lib/supabase/sessionTokenProvider';
import {
  applyPostgrestFilters,
  infraRegistryResponse,
  isInfraRegistryRequest,
  jsonResponse,
  postgrestTable,
} from './infraFixtures';

import { usersApi } from '@/api';

const VIEWER = 'viewer-1';
const FRIEND = 'friend-ada';

const FRIENDS = [
  { id: 'fr-1', requester_id: VIEWER, receiver_id: FRIEND, status: 'accepted', created_at: '2026-01-02T00:00:00Z' },
  { id: 'fr-2', requester_id: 'pending-pat', receiver_id: VIEWER, status: 'pending', created_at: '2026-01-01T00:00:00Z' },
];

let requestedUrls: string[] = [];

beforeEach(() => {
  requestedUrls = [];
  setCurrentAccessToken('tok');

  (globalThis as any).fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (isInfraRegistryRequest(input)) return infraRegistryResponse();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    requestedUrls.push(url);

    // PostgREST logic trees use `column.operator.value`; a `column=operator.`
    // clause inside the `or` parameter is unparseable and the request 400s.
    const orTree = new URL(url).searchParams.get('or');
    if (orTree && /[A-Za-z0-9_]+=[a-z]+\./.test(orTree)) {
      return jsonResponse(400, { message: 'failed to parse logic tree' });
    }

    // Direct Supabase applies filters server-side; mirror that so the mock
    // represents a real PostgREST response rather than the old Gateway's
    // whole-table reply that the client used to filter locally.
    if (postgrestTable(url) !== 'friends') return jsonResponse(404, { error: `no mock route for ${new URL(url).pathname}` });
    return jsonResponse(200, applyPostgrestFilters(FRIENDS, url));
  });
});

afterEach(() => {
  clearCurrentAccessToken();
  vi.restoreAllMocks();
});

describe('Friends API `or=` filter is a valid PostgREST logic tree', () => {
  it("uses dot notation so PostgREST returns the viewer's friendships", async () => {
    const { data, error } = await usersApi.getFriendsByUser(VIEWER);

    const orFilter = requestedUrls
      .flatMap((u) => {
        const tree = new URL(u).searchParams.get('or');
        return tree ? [`or=${tree}`] : [];
      })
      .find((f) => f.startsWith('or='));

    expect(orFilter).toBe(`or=(requester_id.eq.${VIEWER},receiver_id.eq.${VIEWER})`);
    expect(orFilter).not.toContain('=eq.');

    // The malformed tree would have produced `{ data: null, error }`.
    expect(error).toBeNull();
    expect(data?.map((f) => f.id)).toEqual(['fr-1']);
  });
});
