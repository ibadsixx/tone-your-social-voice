// Regression: the Friends API used to emit a malformed PostgREST logic tree.
//
// `gateway.from('friends').or('requester_id=eq.<id>,receiver_id=eq.<id>')` is
// forwarded verbatim by the Gateway to Supabase's `.or()`. PostgREST only
// accepts `column.operator.value` (dot) conditions inside `or=(...)` — see
// https://docs.postgrest.org/en/stable/references/api/tables_views.html#logical-operators
// — so the tree failed to parse, the Gateway swallowed the 400 and answered
// `[]`, and the "Invite friends to this group" dialog showed no friends.
//
// This test speaks to a mock server that parses the logic tree the way
// PostgREST does, so an `=eq.` regression fails here instead of silently
// rendering an empty dialog.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
  localStorage.clear();
  localStorage.setItem('tone-auth-token', JSON.stringify({ access_token: 'tok', refresh_token: 'ref' }));

  (globalThis as any).fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    requestedUrls.push(url);

    const filters = new URL(url).searchParams.getAll('filter');
    // PostgREST logic trees use `column.operator.value`; a `column=operator.`
    // clause inside `or=` is unparseable and the request 400s.
    const malformed = filters.some((f) => /^or=/.test(f) && /[A-Za-z0-9_]+=[a-z]+\./.test(f));
    if (malformed) {
      return {
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ message: 'failed to parse logic tree' }),
      } as Response;
    }

    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => FRIENDS,
    } as Response;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Friends API `or=` filter is a valid PostgREST logic tree', () => {
  it("uses dot notation so the Gateway/PostgREST returns the viewer's friendships", async () => {
    const { data, error } = await usersApi.getFriendsByUser(VIEWER);

    const orFilter = requestedUrls
      .flatMap((u) => new URL(u).searchParams.getAll('filter'))
      .find((f) => f.startsWith('or='));

    expect(orFilter).toBe(`or=(requester_id.eq.${VIEWER},receiver_id.eq.${VIEWER})`);
    expect(orFilter).not.toContain('=eq.');

    // The malformed tree would have produced `{ data: null, error }`.
    expect(error).toBeNull();
    expect(data?.map((f) => f.id)).toEqual(['fr-1']);
  });
});
