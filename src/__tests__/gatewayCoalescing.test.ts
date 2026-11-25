// Global request de-duplication at the direct Supabase data client.
//
// Several components read the same table in the same tick — `Post` calls
// `useProfile()` once per post, and Layout, Stories and NewPost each read the
// viewer's own profile — so one feed page issued a dozen identical reads.
//
// Reads go to the routed project's PostgREST endpoint (`/rest/v1/<table>`)
// with the viewer's central Auth JWT. PostgREST applies select/filters itself;
// there is no in-browser request cache to share. These tests pin the properties
// that still matter: each caller's query stays isolated by viewer and by shape,
// results are never reused after a request settles, and errors are not hidden.
//
// The audience/authorization matrix itself is covered by postVisibility.test.ts
// and by the project RLS policies.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  clearCurrentAccessToken,
  setCurrentAccessToken,
} from '@/lib/supabase/sessionTokenProvider';
import {
  infraRegistryResponse,
  isInfraRegistryRequest,
  postgrestFilters,
  postgrestTable,
} from './infraFixtures';

const TOKEN_A = 'token-viewer-a';
const TOKEN_B = 'token-viewer-b';

type FetchCall = { table: string; token: string | null };

const TABLE_ROWS: Record<string, unknown[]> = {
  profiles: [
    { id: 'u1', username: 'ada', display_name: 'Ada' },
    { id: 'u2', username: 'bob', display_name: 'Bob' },
  ],
  posts: [
    { id: 'p1', user_id: 'u1', content: 'hello' },
    { id: 'p2', user_id: 'u2', content: 'world' },
  ],
};

describe('dataClient: concurrent read isolation', () => {
  const realFetch = globalThis.fetch;
  let calls: FetchCall[];
  let inFlight: number;
  let maxInFlight: number;
  /** How long the mock holds each response open, so overlap is controllable. */
  let responseDelayMs: number;

  beforeEach(() => {
    setCurrentAccessToken(TOKEN_A);
    calls = [];
    inFlight = 0;
    maxInFlight = 0;
    responseDelayMs = 0;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (isInfraRegistryRequest(input)) return infraRegistryResponse();
      const table = postgrestTable(input);
      const headers = new Headers(init?.headers);
      const authorization = headers.get('Authorization');
      const token = authorization ? authorization.replace('Bearer ', '') : null;
      calls.push({ table, token });
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Yield, so overlapping requests are observable as separate.
      await new Promise((resolve) => setTimeout(resolve, responseDelayMs));
      inFlight -= 1;
      const select = new URL(String(input)).searchParams.get('select');
      let rows = TABLE_ROWS[table] ?? [];
      for (const filter of postgrestFilters(input)) {
        const match = filter.match(/^([^=]+)=eq\.(.*)$/);
        if (match) rows = rows.filter((row) => String((row as Record<string, unknown>)[match[1]]) === match[2]);
      }
      // Preserve the old in-memory mock's join behaviour: the caller asking for
      // the profile relation sees it; the plain caller must not inherit it.
      const withJoin = rows.map((row) => {
        const fields = row as Record<string, unknown>;
        return table === 'posts' && select?.includes('profiles!')
          ? { ...fields, profiles: { username: 'ada' } }
          : fields;
      });
      const projected = !select || select === '*' || select.includes('!')
        ? withJoin
        : withJoin.map((row) => Object.fromEntries(
          select.split(',').map((column) => [column.trim(), (row as Record<string, unknown>)[column.trim()]])
        ));
      return new Response(JSON.stringify(projected), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    clearCurrentAccessToken();
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  /** Reads one profile the way `useProfile` does, i.e. a full-table GET. */
  async function readOwnProfile() {
    const { dataClient } = await import('@/lib/supabase/dataClient');
    return dataClient.from('profiles').select('*').eq('id', 'u1').maybeSingle();
  }

  it('keeps ten concurrent profile reads correct and authenticated', async () => {
    // Ten posts on the feed each call useProfile() for the viewer's own profile.
    // The direct client does not cache these in the browser; every call must
    // still reach the routed project with the viewer's JWT and return the row.
    const results = await Promise.all(Array.from({ length: 10 }, () => readOwnProfile()));

    expect(calls).toHaveLength(10);
    expect(calls.every((call) => call.table === 'profiles' && call.token === TOKEN_A)).toBe(true);
    expect(maxInFlight).toBe(10);
    expect(results.every((result) => result.data?.id === 'u1' && result.error === null)).toBe(true);
  });

  it('still issues independent reads for different tables', async () => {
    const { dataClient } = await import('@/lib/supabase/dataClient');
    await Promise.all([
      dataClient.from('profiles').select('*'),
      dataClient.from('posts').select('*'),
      dataClient.from('comments').select('*'),
    ]);

    expect(calls.map((c) => c.table).sort()).toEqual(['comments', 'posts', 'profiles']);
  });

  it('never shares a read between two different viewers', async () => {
    // Hold the response open so the first read is provably still in flight when
    // the second viewer starts, and wait a macrotask first so the first read has
    // already captured viewer A's token. Otherwise the token flip below would
    // race the client's own token read and prove nothing.
    responseDelayMs = 25;

    const asA = readOwnProfile();
    await new Promise((resolve) => setTimeout(resolve, 0));

    setCurrentAccessToken(TOKEN_B);
    const asB = readOwnProfile();

    const [a, b] = await Promise.all([asA, asB]);

    // Two viewers, same table, same tick: two separate reads, never one shared.
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.token).sort()).toEqual([TOKEN_A, TOKEN_B]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    // And the two really were concurrent, so the separation is what caused the
    // second request rather than the first having finished.
    expect(maxInFlight).toBe(2);
  });

  it('does not serve a stale read after the first one settles', async () => {
    // A read issued after the previous one finished must hit the network again,
    // so a new friend request, post or permission change is never missed.
    await readOwnProfile();
    await readOwnProfile();

    expect(calls).toHaveLength(2);
  });

  it('gives each caller its own rows, so one query cannot leak joins into another', async () => {
    const { dataClient } = await import('@/lib/supabase/dataClient');

    // Two different queries against the same table, concurrently. One resolves a
    // join onto its rows; the other must not see it.
    const withJoin = dataClient.from('posts').select('*, profiles!posts_user_id_fkey (username)');
    const plain = dataClient.from('posts').select('*');

    const [joined, plainRes] = await Promise.all([withJoin, plain]);

    const joinedRows = joined.data as Array<Record<string, unknown>>;
    const plainRows = plainRes.data as Array<Record<string, unknown>>;
    expect(joinedRows[0].profiles).toBeDefined();
    expect(plainRows[0].profiles).toBeUndefined();
  });

  it('applies each caller its own select, even on a shared read', async () => {
    const { dataClient } = await import('@/lib/supabase/dataClient');

    const [wide, narrow] = await Promise.all([
      dataClient.from('profiles').select('*'),
      dataClient.from('profiles').select('username'),
    ]);

    const wideRows = wide.data as Array<Record<string, unknown>>;
    const narrowRows = narrow.data as Array<Record<string, unknown>>;
    expect(wideRows[0].display_name).toBe('Ada');
    expect(Object.keys(narrowRows[0])).toEqual(['username']);
  });

  it('does not hide a failed read from either caller', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (isInfraRegistryRequest(input)) return infraRegistryResponse();
      calls.push({ table: postgrestTable(input), token: TOKEN_A });
      await new Promise((resolve) => setTimeout(resolve, 0));
      return new Response(JSON.stringify({ message: 'boom' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const { dataClient } = await import('@/lib/supabase/dataClient');
    const [a, b] = await Promise.all([
      dataClient.from('profiles').select('*'),
      dataClient.from('profiles').select('*'),
    ]);

    expect(calls).toHaveLength(2);
    expect(a.error?.message).toBe('boom');
    expect(b.error?.message).toBe('boom');
  });
});
