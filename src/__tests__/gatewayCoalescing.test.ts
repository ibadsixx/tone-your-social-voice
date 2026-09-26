// Global request de-duplication at the gateway client.
//
// The Gateway ignores `select`/`limit`/`offset`/`order` and equality filters, so
// every `GET /api/<table>` is a whole-table read. Several components read the same
// table in the same tick — `Post` calls `useProfile()` once per post, and Layout,
// Stories and NewPost each read the viewer's own profile — so one feed page issued
// a dozen identical full-table reads.
//
// The client now coalesces concurrent identical GETs. These tests pin both the win
// and the two properties that make it safe: it is never shared across viewers, and
// it is never stale.
//
// The audience/authorization matrix itself is covered by postVisibility.test.ts
// and the Gateway's contentVisibilityTest.ts.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const TOKEN = { access_token: 'token-viewer-a' };

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

describe('gateway: in-flight GET coalescing', () => {
  const realFetch = globalThis.fetch;
  let calls: FetchCall[];
  let inFlight: number;
  let maxInFlight: number;
  /** How long the mock holds each response open, so overlap is controllable. */
  let responseDelayMs: number;

  beforeEach(() => {
    localStorage.setItem('tone-auth-token', JSON.stringify(TOKEN));
    calls = [];
    inFlight = 0;
    maxInFlight = 0;
    responseDelayMs = 0;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const table = String(input).split('/api/')[1]?.split('?')[0] ?? '';
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const token = headers.Authorization ? headers.Authorization.replace('Bearer ', '') : null;
      calls.push({ table, token });
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Yield, so a request that is not shared stays observable as separate.
      await new Promise((resolve) => setTimeout(resolve, responseDelayMs));
      inFlight -= 1;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => 'application/json' },
        json: async () => TABLE_ROWS[table] ?? [],
      } as unknown as Response;
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  /** Reads one profile the way `useProfile` does, i.e. a full-table GET. */
  async function readOwnProfile() {
    const { gateway } = await import('@/lib/gateway');
    return gateway.from('profiles').select('*').eq('id', 'u1').maybeSingle();
  }

  it('collapses concurrent identical reads into one network request', async () => {
    // Ten posts on the feed each call useProfile() for the viewer's own profile.
    await Promise.all(Array.from({ length: 10 }, () => readOwnProfile()));

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe('profiles');
  });

  it('still issues independent reads for different tables', async () => {
    const { gateway } = await import('@/lib/gateway');
    await Promise.all([
      gateway.from('profiles').select('*'),
      gateway.from('posts').select('*'),
      gateway.from('comments').select('*'),
    ]);

    expect(calls.map((c) => c.table).sort()).toEqual(['comments', 'posts', 'profiles']);
  });

  it('never shares a read between two different viewers', async () => {
    const { gateway } = await import('@/lib/gateway');

    // Hold the response open so the first read is provably still in flight when
    // the second viewer starts, and wait a macrotask first so the first read has
    // already captured viewer A's token. Otherwise the token flip below would
    // race the client's own token read and prove nothing.
    responseDelayMs = 25;

    const asA = readOwnProfile();
    await new Promise((resolve) => setTimeout(resolve, 0));

    localStorage.setItem('tone-auth-token', JSON.stringify({ access_token: 'token-viewer-b' }));
    const asB = readOwnProfile();

    const [a, b] = await Promise.all([asA, asB]);

    // Two viewers, same table, same tick: two separate reads, never one shared.
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.token).sort()).toEqual(['token-viewer-a', 'token-viewer-b']);
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
    const { gateway } = await import('@/lib/gateway');

    // Two different queries against the same table, concurrently. One resolves a
    // join onto its rows; the other must not see it.
    const withJoin = gateway.from('posts').select('*, profiles!posts_user_id_fkey (username)');
    const plain = gateway.from('posts').select('*');

    const [joined, plainRes] = await Promise.all([withJoin, plain]);

    const joinedRows = joined.data as Array<Record<string, unknown>>;
    const plainRows = plainRes.data as Array<Record<string, unknown>>;
    expect(joinedRows[0].profiles).toBeDefined();
    expect(plainRows[0].profiles).toBeUndefined();
  });

  it('applies each caller its own select, even on a shared read', async () => {
    const { gateway } = await import('@/lib/gateway');

    const [wide, narrow] = await Promise.all([
      gateway.from('profiles').select('*'),
      gateway.from('profiles').select('username'),
    ]);

    const wideRows = wide.data as Array<Record<string, unknown>>;
    const narrowRows = narrow.data as Array<Record<string, unknown>>;
    expect(wideRows[0].display_name).toBe('Ada');
    expect(Object.keys(narrowRows[0])).toEqual(['username']);
  });

  it('does not share a failed read in a way that hides the error', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const table = String(input).split('/api/')[1]?.split('?')[0] ?? '';
      calls.push({ table, token: TOKEN.access_token });
      await new Promise((resolve) => setTimeout(resolve, 0));
      return {
        ok: false,
        status: 500,
        statusText: 'Server Error',
        headers: { get: () => 'application/json' },
        json: async () => ({ message: 'boom' }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const { gateway } = await import('@/lib/gateway');
    const [a, b] = await Promise.all([
      gateway.from('profiles').select('*'),
      gateway.from('profiles').select('*'),
    ]);

    expect(calls).toHaveLength(1);
    expect(a.error?.message).toBe('boom');
    expect(b.error?.message).toBe('boom');
  });
});
