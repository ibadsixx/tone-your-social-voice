// Home/Feed request shape (do.md — "Fix the Home/Feed loading architecture").
//
// Two properties are pinned here, both measured rather than assumed:
//
//   A. No pre-feed waterfall. The feed read used to be awaited *after* the
//      `group_follows` and `friends` lookups, which put two round trips in
//      front of every feed load and every poll. The lookups are inputs to the
//      client-side audience filter, not prerequisites for the request.
//
//   B. Join resolution dedupes and parallelizes. The Gateway does not process
//      `select` joins, so the client resolves them itself. It used to walk the
//      join specs with a sequential `for ... await`, and it re-read the same
//      table once per spec. The feed's select reaches `posts` twice (top level
//      and `shared_post:shared_post_id`) and `profiles` three times, so one feed
//      load cost nine sequential full-table reads.
//
// The audience matrix itself is covered in postVisibility.test.ts and in the
// Gateway's contentVisibilityTest.ts; test A's last case re-checks that the
// client filter is still applied now that it no longer blocks the request.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// --- Part A: the feed hook -------------------------------------------------

const OWNER_ID = 'a';     // publishes the friends-only content
const VIEWER_ID = 'b';    // accepted friend
const STRANGER_ID = 'c';  // not a friend

const getFeedTimeline = vi.fn();
const loadFriendIds = vi.fn();
let groupFollowsDeferred: { resolve: (v: unknown) => void; pending: boolean };
const releaseGroupFollows = () => {
  if (groupFollowsDeferred && groupFollowsDeferred.pending) {
    groupFollowsDeferred.pending = false;
    groupFollowsDeferred.resolve({ data: [], error: null });
  }
};

vi.mock('@/api', () => ({
  postsApi: {
    getFeedTimeline: (...args: unknown[]) => getFeedTimeline(...args),
    createPost: vi.fn(),
  },
}));

// The `group_follows` read is held open until the test releases it, which is how
// "the feed request started anyway" becomes observable.
vi.mock('@/lib/gateway', () => ({
  gateway: {
    from: (table: string) => ({
      select: () => ({
        eq: (_c: string, v: string) =>
          table === 'group_follows'
            ? new Promise((resolve) => {
                groupFollowsDeferred = { resolve, pending: true };
              })
            : Promise.resolve({ data: v ? [] : [], error: null }),
      }),
    }),
  },
}));

// Keep the REAL audience evaluator; only the friendship lookup is stubbed (it is
// exercised in postVisibility.test.ts).
vi.mock('@/lib/postVisibility', async () => {
  const actual = await vi.importActual<typeof import('@/lib/postVisibility')>('@/lib/postVisibility');
  return { ...actual, loadFriendIds: (...args: unknown[]) => loadFriendIds(...args) };
});

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: VIEWER_ID } }) }));
vi.mock('@/hooks/useNotifications', () => ({ createNotification: vi.fn() }));

const { useHomeFeed } = await import('@/hooks/useHomeFeed');

function friendsPost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-friends-1',
    user_id: OWNER_ID,
    content: 'friends only body',
    media_url: null,
    media_type: null,
    audience_type: 'friends',
    visibility: null,
    status: 'published',
    created_at: '2026-01-01T00:00:00.000Z',
    profiles: { username: 'a', display_name: 'A', profile_pic: null },
    ...overrides,
  };
}

function publicPost(overrides: Record<string, unknown> = {}) {
  return { ...friendsPost({ id: 'post-public-1', audience_type: 'public' }), ...overrides };
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('A. the feed read does not wait for the filter lookups', () => {
  beforeEach(() => {
    getFeedTimeline.mockReset();
    loadFriendIds.mockReset();
    groupFollowsDeferred = { resolve: () => {}, pending: false };
    loadFriendIds.mockResolvedValue(new Set([OWNER_ID]));
    getFeedTimeline.mockResolvedValue({ data: [publicPost()], error: null });
  });

  it('issues the feed request even while group_follows is still in flight', async () => {
    renderHook(() => useHomeFeed());
    await settle();

    // group_follows has never resolved. The feed request must already be out.
    expect(groupFollowsDeferred.pending).toBe(true);
    expect(getFeedTimeline).toHaveBeenCalledTimes(1);
  });

  it('issues the feed request even while the friends lookup is still in flight', async () => {
    let releaseFriends: (v: unknown) => void = () => {};
    loadFriendIds.mockReturnValue(new Promise((resolve) => { releaseFriends = resolve; }));

    renderHook(() => useHomeFeed());
    await settle();

    expect(getFeedTimeline).toHaveBeenCalledTimes(1);
    releaseFriends(new Set([OWNER_ID]));
    await settle();
  });

  it('renders the feed once the lookups land', async () => {
    const view = renderHook(() => useHomeFeed());
    await settle();
    releaseGroupFollows();
    await settle();

    expect(view.result.current.posts.map((p) => p.id)).toContain('post-public-1');
    expect(view.result.current.loading).toBe(false);
  });

  it('still hides friends-only content from a non-friend', async () => {
    // The client filter is defence-in-depth behind the Gateway. Removing the
    // waterfall must not weaken it.
    loadFriendIds.mockResolvedValue(new Set<string>());
    getFeedTimeline.mockResolvedValue({ data: [friendsPost(), publicPost()], error: null });

    const view = renderHook(() => useHomeFeed());
    await settle();
    releaseGroupFollows();
    await settle();

    const ids = view.result.current.posts.map((p) => p.id);
    expect(ids).toContain('post-public-1');
    expect(ids).not.toContain('post-friends-1');
  });

  it('shows friends-only content to an accepted friend', async () => {
    getFeedTimeline.mockResolvedValue({ data: [friendsPost(), publicPost()], error: null });

    const view = renderHook(() => useHomeFeed());
    await settle();
    releaseGroupFollows();
    await settle();

    expect(view.result.current.posts.map((p) => p.id)).toContain('post-friends-1');
  });

  it('reports a feed-scoped error without throwing', async () => {
    getFeedTimeline.mockResolvedValue({ data: null, error: { message: 'Gateway unreachable' } });

    const view = renderHook(() => useHomeFeed());
    await settle();
    releaseGroupFollows();
    await settle();

    expect(view.result.current.loading).toBe(false);
    expect(view.result.current.error).toBe('Gateway unreachable');
  });
});

// --- Part B: join resolution ------------------------------------------------

/**
 * The feed's select, with `comments` still carrying a nested author join so that
 * the dedupe of nested same-table reads is exercised independently of the
 * payload trim in src/api/posts.ts.
 */
const SELECT_WITH_NESTED_COMMENT_AUTHOR = `
  *,
  profiles!posts_user_id_fkey (username, display_name, profile_pic),
  likes (id, user_id),
  comments (id, content, profiles:user_id (display_name)),
  shared_post:shared_post_id (id, content, media_url, media_type, type, created_at, profiles!posts_user_id_fkey (username, display_name, profile_pic)),
  group_posts (group_id, groups:group_id (id, name))
`;

/** A post row with the feed's joins resolved. */
type JoinedRow = {
  id: string;
  user_id: string;
  profiles?: { username?: string; display_name?: string };
  likes?: Array<{ id: string; user_id: string }>;
  comments?: Array<{ id: string; content: string }>;
  shared_post?: JoinedRow;
  group_posts?: Array<{ group_id: string; groups?: { id: string; name: string } }>;
};

const TABLE_ROWS: Record<string, unknown[]> = {
  posts: [
    { id: 'p1', user_id: 'a', content: 'one', shared_post_id: 'sp1', created_at: '2026-01-03T00:00:00.000Z' },
    { id: 'p2', user_id: 'b', content: 'two', shared_post_id: null, created_at: '2026-01-02T00:00:00.000Z' },
    { id: 'sp1', user_id: 'c', content: 'original', shared_post_id: null, created_at: '2026-01-01T00:00:00.000Z' },
  ],
  profiles: [
    { id: 'a', username: 'a', display_name: 'A', profile_pic: null },
    { id: 'b', username: 'b', display_name: 'B', profile_pic: null },
    { id: 'c', username: 'c', display_name: 'C', profile_pic: null },
  ],
  likes: [{ id: 'l1', user_id: 'a', post_id: 'p1' }],
  comments: [{ id: 'c1', content: 'nice', user_id: 'a', post_id: 'p1' }],
  group_posts: [{ group_id: 'g1', post_id: 'p1' }],
  groups: [{ id: 'g1', name: 'Group One' }],
};

describe('B. join resolution dedupes tables and reads them concurrently', () => {
  const realFetch = globalThis.fetch;
  let requested: string[] = [];
  let maxConcurrent = 0;
  let inFlight = 0;

  beforeEach(() => {
    requested = [];
    maxConcurrent = 0;
    inFlight = 0;

    globalThis.fetch = vi.fn(async (url: string) => {
      const table = String(url).split('/api/')[1];
      requested.push(table);
      inFlight += 1;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      // Yield so sequential execution stays sequential and parallel stays parallel.
      await new Promise((resolve) => setTimeout(resolve, 0));
      inFlight -= 1;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => 'application/json' },
        // Fresh objects per response: join resolution writes the joined fields
        // onto the rows it is given, so handing back the shared fixtures would
        // leak resolved fields from one test into the next.
        json: async () => JSON.parse(JSON.stringify(TABLE_ROWS[table] ?? [])),
      } as unknown as Response;
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  /** Runs one feed-shaped query against the REAL gateway client. */
  async function runFeedQuery() {
    // `importActual` is required: this file mocks '@/lib/gateway' for part A, and
    // join resolution lives in that module.
    const { gateway } = await vi.importActual<typeof import('@/lib/gateway')>('@/lib/gateway');
    const res = await gateway
      .from('posts')
      .select(SELECT_WITH_NESTED_COMMENT_AUTHOR)
      .order('created_at', { ascending: false })
      .range(0, 1);
    return res;
  }

  it('reads each related table at most once', async () => {
    await runFeedQuery();

    const counts = requested.reduce<Record<string, number>>((acc, t) => {
      acc[t] = (acc[t] ?? 0) + 1;
      return acc;
    }, {});

    // `posts` is reached twice by this select (top level and shared_post) and
    // `profiles` three times (post author, comment author, shared post author).
    // Before the fix each was re-read in full.
    expect(counts.posts).toBe(1);
    expect(counts.profiles).toBe(1);
    expect(counts.likes).toBe(1);
    expect(counts.comments).toBe(1);
    expect(counts.group_posts).toBe(1);
    expect(counts.groups).toBe(1);
    expect(requested.length).toBe(6);
  });

  it('requests independent tables concurrently, not one after another', async () => {
    await runFeedQuery();

    // The top-level read is necessarily alone, but every join table must be in
    // flight at the same time. A sequential `for ... await` caps this at 1.
    expect(maxConcurrent).toBeGreaterThanOrEqual(4);
  });

  it('still resolves the joined fields correctly', async () => {
    const res = await runFeedQuery();
    const rows = res.data as JoinedRow[];

    expect(rows).toHaveLength(2);
    // Ordered client-side by created_at desc, sliced to the range.
    expect(rows[0].id).toBe('p1');
    expect(rows[0].profiles?.display_name).toBe('A');
    expect(rows[0].likes?.[0]?.user_id).toBe('a');
    expect(rows[0].comments?.[0]?.id).toBe('c1');
    // shared_post resolved off the already-fetched posts response.
    expect(rows[0].shared_post?.id).toBe('sp1');
    expect(rows[0].shared_post?.profiles?.display_name).toBe('C');
    expect(rows[0].group_posts?.[0]?.groups?.name).toBe('Group One');
    // A post with no shared_post_id must not gain a bogus one.
    expect(rows[1].id).toBe('p2');
    expect(rows[1].shared_post).toBeUndefined();
  });

  it('does not fail the whole query when one related table errors', async () => {
    globalThis.fetch = vi.fn(async (url: string) => {
      const table = String(url).split('/api/')[1];
      requested.push(table);
      if (table === 'comments') {
        return {
          ok: false,
          status: 500,
          statusText: 'Server Error',
          headers: { get: () => 'application/json' },
          json: async () => ({}),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => 'application/json' },
        json: async () => JSON.parse(JSON.stringify(TABLE_ROWS[table] ?? [])),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const res = await runFeedQuery();
    const rows = res.data as JoinedRow[];

    // The feed still renders, with the healthy joins attached.
    expect(rows).toHaveLength(2);
    expect(rows[0].profiles?.display_name).toBe('A');
    expect(rows[0].group_posts?.[0]?.groups?.name).toBe('Group One');
    expect(rows[0].comments).toBeUndefined();
  });
});
