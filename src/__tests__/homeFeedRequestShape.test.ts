// Home/Feed request shape (do.md — "Fix the Home/Feed loading architecture").
//
// Two properties are pinned here, both measured rather than assumed:
//
//   A. No pre-feed waterfall. The feed read used to be awaited *after* the
//      `group_follows` and `friends` lookups, which put two round trips in
//      front of every feed load and every poll. The lookups are inputs to the
//      client-side audience filter, not prerequisites for the request.
//
//   B. PostgREST owns the joins. The removed Gateway did not process embedded
//      `select` joins, so the old client walked the join specs itself and
//      re-read the same table once per spec (nine full-table reads for one feed
//      load). The direct-Supabase client now sends one embedded select to the
//      registered posts project; this section verifies that there is no client
//      join resolver left and no fan-out to related tables.
//
// The audience matrix itself is covered in postVisibility.test.ts; test A's last
// case re-checks that the client filter is still applied now that it no longer
// blocks the request.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { clearClientCache } from '@/lib/supabase/clientFactory';
import {
  INFRA_PROJECTS,
  applyPostgrestOrder,
  isInfraRegistryRequest,
  jsonResponse,
  postgrestTable,
} from './infraFixtures';

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
vi.mock('@/lib/supabase/dataClient', () => ({
  dataClient: {
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
    // The client filter is defence-in-depth behind the trusted read boundary.
    // Removing the waterfall must not weaken it.
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
    getFeedTimeline.mockResolvedValue({ data: null, error: { message: 'Feed service unavailable' } });

    const view = renderHook(() => useHomeFeed());
    await settle();
    releaseGroupFollows();
    await settle();

    expect(view.result.current.loading).toBe(false);
    expect(view.result.current.error).toBe('Feed service unavailable');
    expect(view.result.current.feedStatus).toBe('query');
  });

  it('distinguishes no posts from posts hidden by visibility', async () => {
    loadFriendIds.mockResolvedValue(new Set<string>());
    getFeedTimeline.mockResolvedValue({ data: [], error: null, rawCount: 0 });

    const empty = renderHook(() => useHomeFeed());
    await settle();
    releaseGroupFollows();
    await settle();
    expect(empty.result.current.feedStatus).toBe('no-posts');

    getFeedTimeline.mockResolvedValue({ data: [friendsPost()], error: null, rawCount: 1 });
    const hidden = renderHook(() => useHomeFeed());
    await settle();
    releaseGroupFollows();
    await settle();
    expect(hidden.result.current.posts).toHaveLength(0);
    expect(hidden.result.current.feedStatus).toBe('none-visible');
  });

  it('keeps routing and authentication failures out of the empty states', async () => {
    getFeedTimeline.mockResolvedValue({
      data: null,
      error: { message: 'Feed routing is ambiguous' },
      feedErrorCode: 'FEED_ROUTE_AMBIGUOUS',
    });

    const routing = renderHook(() => useHomeFeed());
    await settle();
    releaseGroupFollows();
    await settle();
    expect(routing.result.current.feedStatus).toBe('routing');

    getFeedTimeline.mockResolvedValue({
      data: null,
      error: { message: 'Your session has expired' },
      feedErrorCode: 'AUTH_REQUIRED',
    });
    const auth = renderHook(() => useHomeFeed());
    await settle();
    releaseGroupFollows();
    await settle();
    expect(auth.result.current.feedStatus).toBe('auth');
  });
});

// --- Part B: direct-Supabase feed requests ----------------------------------

/**
 * The feed's embedded select, including a nested comment author so the direct
 * request still exercises the deeply nested join shape the old resolver had.
 */
const SELECT_WITH_NESTED_COMMENT_AUTHOR = `
  *,
  profiles!posts_user_id_fkey (username, display_name, profile_pic),
  likes (id, user_id),
  comments (id, content, profiles:user_id (display_name)),
  shared_post:shared_post_id (id, content, media_url, media_type, type, created_at, profiles!posts_user_id_fkey (username, display_name, profile_pic)),
  group_posts (group_id, groups:group_id (id, name))
`;

/** A post row as PostgREST returns it once the embedded joins are resolved. */
type JoinedRow = {
  id: string;
  user_id: string;
  profiles?: { username?: string; display_name?: string };
  likes?: Array<{ id: string; user_id: string }>;
  comments?: Array<{ id: string; content: string }>;
  shared_post?: JoinedRow;
  group_posts?: Array<{ group_id: string; groups?: { id: string; name: string } }>;
};

const POSTS_ORIGIN = 'http://posts.test';
const OTHER_ORIGIN = 'http://other.test';

const POSTS_WITH_JOINS: Record<string, unknown>[] = [
  {
    id: 'p1',
    user_id: 'a',
    content: 'one',
    created_at: '2026-01-03T00:00:00.000Z',
    profiles: { id: 'a', username: 'a', display_name: 'A', profile_pic: null },
    likes: [{ id: 'l1', user_id: 'a' }],
    comments: [{ id: 'c1', content: 'nice', profiles: { display_name: 'A' } }],
    shared_post: {
      id: 'sp1',
      user_id: 'c',
      content: 'original',
      created_at: '2026-01-01T00:00:00.000Z',
      profiles: { id: 'c', username: 'c', display_name: 'C', profile_pic: null },
    },
    group_posts: [{ group_id: 'g1', groups: { id: 'g1', name: 'Group One' } }],
  },
  {
    id: 'p2',
    user_id: 'b',
    content: 'two',
    created_at: '2026-01-02T00:00:00.000Z',
    profiles: { id: 'b', username: 'b', display_name: 'B', profile_pic: null },
    likes: [],
    comments: [],
    group_posts: [],
  },
];

function projectRegistry() {
  return INFRA_PROJECTS.map((project) => ({
    ...project,
    project_url: project.domain === 'posts' ? POSTS_ORIGIN : OTHER_ORIGIN,
  }));
}

function ambiguousPostsRegistry() {
  const projects = projectRegistry();
  const postsProject = projects.find((project) => project.domain === 'posts');
  if (!postsProject) throw new Error('test fixture is missing the posts project');
  return [...projects, { ...postsProject, project_key: 'posts-2' }];
}

describe('B. direct-Supabase feed requests', () => {
  const realFetch = globalThis.fetch;
  let requested: string[] = [];
  let postsRequests: Array<{ url: URL; init?: RequestInit }> = [];
  let postsQueryFails = false;
  let registryProjects = projectRegistry();

  beforeEach(() => {
    clearClientCache();
    requested = [];
    postsRequests = [];
    postsQueryFails = false;
    registryProjects = projectRegistry();

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (isInfraRegistryRequest(input)) {
        requested.push('registry');
        return jsonResponse(200, registryProjects);
      }

      const url = typeof input === 'string'
        ? new URL(input)
        : input instanceof URL
          ? input
          : new URL(input.url);
      const table = postgrestTable(url);
      requested.push(table || url.pathname);
      if (table === 'posts') postsRequests.push({ url, init });

      if (postsQueryFails && table === 'posts') {
        return jsonResponse(500, { code: 'PGRST500', message: 'embedded posts join failed' });
      }
      if (table !== 'posts') {
        return jsonResponse(404, { message: `no mock route for ${table || url.pathname}` });
      }

      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? POSTS_WITH_JOINS.length);
      const rows = applyPostgrestOrder(POSTS_WITH_JOINS, url).slice(offset, offset + limit);
      return jsonResponse(200, rows);
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
    clearClientCache();
  });

  /** Runs one feed-shaped query against the REAL dataClient client. */
  async function runFeedQuery() {
    // `importActual` is required: this file mocks '@/lib/supabase/dataClient' for
    // part A, but this section must exercise the real direct-Supabase client.
    const { dataClient } = await vi.importActual<typeof import('@/lib/supabase/dataClient')>('@/lib/supabase/dataClient');
    return dataClient
      .from('posts')
      .select(SELECT_WITH_NESTED_COMMENT_AUTHOR)
      .order('created_at', { ascending: false })
      .range(0, 1);
  }

  it('reads the feed from exactly the registered posts project', async () => {
    const res = await runFeedQuery();

    expect(res.error).toBeNull();
    expect(requested).toEqual(['registry', 'posts']);
    expect(postsRequests).toHaveLength(1);
    expect(postsRequests[0].url.origin).toBe(POSTS_ORIGIN);
    expect(postsRequests[0].url.pathname).toBe('/rest/v1/posts');
  });

  it('sends embedded joins in one PostgREST select instead of client-side table reads', async () => {
    await runFeedQuery();

    const select = postsRequests[0].url.searchParams.get('select') ?? '';
    expect(select).toContain('profiles!posts_user_id_fkey');
    expect(select).toContain('likes');
    expect(select).toContain('comments');
    expect(select).toContain('shared_post:shared_post_id');
    expect(select).toContain('group_posts');
    expect(postsRequests[0].url.searchParams.get('order')).toBe('created_at.desc');
    // No client-side resolver may re-read profiles/likes/comments/groups.
    expect(requested.filter((table) => table !== 'registry')).toEqual(['posts']);
  });

  it('preserves ordered, ranged rows with their embedded profile and shared data', async () => {
    const res = await runFeedQuery();
    const rows = res.data as JoinedRow[];

    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe('p1');
    expect(rows[0].profiles?.display_name).toBe('A');
    expect(rows[0].likes?.[0]?.user_id).toBe('a');
    expect(rows[0].comments?.[0]?.id).toBe('c1');
    expect(rows[0].shared_post?.id).toBe('sp1');
    expect(rows[0].shared_post?.profiles?.display_name).toBe('C');
    expect(rows[0].group_posts?.[0]?.groups?.name).toBe('Group One');
    expect(rows[1].id).toBe('p2');
  });

  it('surfaces an embedded query failure instead of returning a partial feed', async () => {
    postsQueryFails = true;

    const res = await runFeedQuery();

    expect(res.data).toBeNull();
    expect(res.error?.message).toMatch(/join failed/i);
    expect(requested.filter((table) => table !== 'registry')).toEqual(['posts']);
  });

  it('fails closed when the posts domain has more than one active project', async () => {
    registryProjects = ambiguousPostsRegistry();

    const res = await runFeedQuery();

    expect(res.data).toBeNull();
    expect(res.error?.configCode).toBe('AMBIGUOUS_ROUTE');
    expect(postsRequests).toHaveLength(0);
  });
});
