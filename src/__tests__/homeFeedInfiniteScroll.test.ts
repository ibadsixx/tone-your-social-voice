// Infinite-scroll pagination (do.md — "Replace Load more with infinite scroll").
//
// These tests pin the *pagination contract* of `useHomeFeed` after Phase 2A:
//
//   * One bounded server page is read at a time; the timeline is no longer
//     downloaded in full and sliced in memory (§4, §5, §10).
//   * The position is the server's `(created_at, id)` cursor, not an array
//     offset, so a post published mid-scroll cannot shift later pages (§8, §9).
//   * Pages are appended, deduplicated and kept in total order (§2, §6, §10).
//   * Concurrent sentinel triggers read only one page (§7).
//   * `hasMore` comes from the server, so the end stops pagination (§13).
//   * A failed page keeps the posts already on screen (§14).
//
// The old offset implementation had a correctness bug, not just a performance
// one: page 2 was `.slice(10, 20)` of a list that gained a row at the top the
// moment anybody posted, duplicating one post and dropping another. The
// mid-scroll test below reproduces that case against a moving server dataset.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const OWNER_ID = 'a';
const VIEWER_ID = 'b';

const getFeedTimeline = vi.fn();
const loadFriendIds = vi.fn();
let serverRows: Row[] = [];

vi.mock('@/api', () => ({
  postsApi: {
    getFeedTimeline: (...args: unknown[]) => getFeedTimeline(...args),
    createPost: vi.fn(),
  },
}));

vi.mock('@/lib/supabase/dataClient', () => ({
  dataClient: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}));

vi.mock('@/lib/postVisibility', async () => {
  const actual = await vi.importActual<typeof import('@/lib/postVisibility')>('@/lib/postVisibility');
  return { ...actual, loadFriendIds: (...args: unknown[]) => loadFriendIds(...args) };
});

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: VIEWER_ID } }) }));
vi.mock('@/hooks/useNotifications', () => ({ createNotification: vi.fn() }));

const { useHomeFeed } = await import('@/hooks/useHomeFeed');

// --- Fixtures --------------------------------------------------------------

type Row = Record<string, unknown> & { id: string; created_at: string };

/** `n` public posts, newest first, with strictly descending timestamps. */
function makePosts(n: number, overrides: (i: number) => Record<string, unknown> = () => ({})): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${String(i).padStart(3, '0')}`,
    user_id: OWNER_ID,
    content: `body ${i}`,
    media_url: null,
    media_type: null,
    audience_type: 'public',
    visibility: null,
    status: 'published',
    // p000 is newest. Descending so a naive index comparison would "work",
    // which is the point: the cursor must not depend on that.
    created_at: new Date(Date.UTC(2026, 0, 1) - i * 60_000).toISOString(),
    profiles: { username: 'a', display_name: 'A', profile_pic: null },
    ...overrides(i),
  })) as Row[];
}

function byNewestFirst(a: Row, b: Row): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

function cursorOf(row: Row) {
  return { created_at: row.created_at, id: row.id };
}

/** Emulates the server's keyset read, including the limit + 1 probe row. */
function serveFeedPage(options: { cursor?: { created_at: string; id: string } | null; limit?: number } = {}) {
  const limit = options.limit ?? 10;
  const sorted = [...serverRows].sort(byNewestFirst);
  const cursor = options.cursor ?? null;
  const candidates = cursor
    ? sorted.filter((row) => byNewestFirst(row, cursor as Row) > 0)
    : sorted;
  const shown = candidates.slice(0, limit);
  const hasMore = candidates.length > limit;
  return {
    data: shown,
    error: null,
    rawCount: shown.length,
    visibleCount: shown.length,
    hasMore,
    nextCursor: hasMore && shown.length ? cursorOf(shown[shown.length - 1]) : null,
  };
}

function setServerRows(rows: Row[]) {
  serverRows = rows;
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mountFeed() {
  const view = renderHook(() => useHomeFeed());
  await settle();
  return view;
}

async function loadNextPage(view: { result: { current: { loadMore: () => Promise<void> } } }) {
  await act(async () => {
    await view.result.current.loadMore();
  });
}

function ids(view: { result: { current: { posts: { id: string }[] } } }) {
  return view.result.current.posts.map(p => p.id);
}

function requestedCursors() {
  return getFeedTimeline.mock.calls.map((call) => (call[0] as { cursor?: { id: string } | null })?.cursor?.id ?? null);
}

beforeEach(() => {
  getFeedTimeline.mockReset();
  loadFriendIds.mockReset();
  loadFriendIds.mockResolvedValue(new Set([OWNER_ID]));
  setServerRows(makePosts(25));
  getFeedTimeline.mockImplementation(async (options: { cursor?: { created_at: string; id: string } | null; limit?: number } = {}) =>
    serveFeedPage(options)
  );
});

// --- Tests -----------------------------------------------------------------

describe('A. one bounded server page at a time (§2, §4, §5)', () => {
  it('shows only the first server page on first paint', async () => {
    const view = await mountFeed();

    expect(ids(view).length).toBe(10);
    expect(ids(view)).toEqual(makePosts(25).slice(0, 10).map(p => p.id));
    expect(view.result.current.hasMore).toBe(true);
  });

  it('reads one server page per call instead of downloading the whole feed', async () => {
    const view = await mountFeed();
    expect(getFeedTimeline).toHaveBeenCalledTimes(1);
    expect(getFeedTimeline.mock.calls[0][0]).toEqual({ cursor: null, limit: 10 });

    await loadNextPage(view);
    await loadNextPage(view);

    // 25 posts across three bounded reads. The server never sent more than
    // limit + 1 rows in any one response.
    expect(ids(view).length).toBe(25);
    expect(getFeedTimeline).toHaveBeenCalledTimes(3);
    for (const call of getFeedTimeline.mock.calls) {
      expect((call[0] as { limit: number }).limit).toBe(10);
    }
    expect(await getFeedTimeline.mock.results[0].value).toMatchObject({ hasMore: true });
  });

  it('uses the server cursor, not an array index, for the next page', async () => {
    const view = await mountFeed();
    await loadNextPage(view);
    await loadNextPage(view);

    expect(requestedCursors()).toEqual([null, 'p009', 'p019']);
    expect(ids(view).length).toBe(25);
  });

  it('appends the next page instead of replacing the feed (§2)', async () => {
    const view = await mountFeed();
    const firstPage = ids(view);

    await loadNextPage(view);

    expect(ids(view).slice(0, 10)).toEqual(firstPage);
    expect(ids(view).length).toBe(20);
  });

  it('does not disturb the posts already loaded when paging (§6)', async () => {
    const view = await mountFeed();
    await loadNextPage(view);
    await loadNextPage(view);

    const all = ids(view);
    expect(new Set(all).size).toBe(all.length);
    expect(view.result.current.loading).toBe(false);
  });
});

describe('B. no duplicates, no skips, stable order (§8, §9, §10)', () => {
  it('reads every post exactly once, in order, across many pages', async () => {
    const view = await mountFeed();

    for (let i = 0; i < 5; i++) await loadNextPage(view);

    expect(ids(view)).toEqual(makePosts(25).map(p => p.id));
    expect(new Set(ids(view)).size).toBe(25);
  });

  it('breaks created_at ties with id, so a shared timestamp still pages deterministically', async () => {
    const tied = makePosts(25, () => ({ created_at: '2026-01-01T00:00:00.000Z' }));
    setServerRows(tied);
    const view = await mountFeed();

    for (let i = 0; i < 5; i++) await loadNextPage(view);

    const all = ids(view);
    expect(new Set(all).size).toBe(25);
    // Ties resolve by id descending, which is the declared total order.
    expect(all).toEqual([...all].sort().reverse());
  });

  it('deduplicates a server response that repeats a post id (§10)', async () => {
    const duplicated = [...makePosts(12), { ...makePosts(1)[0], created_at: '2025-12-31T00:00:00.000Z' }];
    setServerRows(duplicated);
    const view = await mountFeed();

    for (let i = 0; i < 3; i++) await loadNextPage(view);

    const all = ids(view);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toEqual(makePosts(12).map(p => p.id));
  });

  it('does not duplicate or drop a post published mid-scroll (§9)', async () => {
    const view = await mountFeed();
    await loadNextPage(view);
    const beforeReveal = ids(view);

    const newPost = {
      ...makePosts(1)[0],
      id: 'pNEW',
      content: 'just posted',
      created_at: new Date(Date.UTC(2026, 5, 1)).toISOString(),
    };
    setServerRows([newPost, ...makePosts(25)]);

    // A background poll picks it up from the newest server page.
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await settle();

    expect(ids(view)[0]).toBe('pNEW');
    expect(ids(view).slice(1, beforeReveal.length + 1)).toEqual(beforeReveal);

    // The next keyset page overlaps the rows already shown after the insert;
    // id deduplication removes them, and one further page reaches the tail.
    await loadNextPage(view);
    await loadNextPage(view);

    const all = ids(view);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(26);
    for (const id of makePosts(25).map(p => p.id)) expect(all).toContain(id);
    expect(all).toContain('pNEW');
  });
});

describe('C. repeated sentinel triggers do not issue duplicate requests (§7)', () => {
  it('single-flights concurrent triggers and advances the cursor for later calls', async () => {
    const view = await mountFeed();

    await act(async () => {
      void view.result.current.loadMore();
      void view.result.current.loadMore();
      void view.result.current.loadMore();
    });
    await settle();

    // Initial page plus exactly one next page: the re-entrancy guard holds.
    expect(getFeedTimeline).toHaveBeenCalledTimes(2);
    expect(ids(view).length).toBe(20);

    await loadNextPage(view);
    expect(getFeedTimeline).toHaveBeenCalledTimes(3);
    expect(ids(view).length).toBe(25);
  });
});

describe('D. the end of the feed (§13)', () => {
  it('reports no more pages once the server says the cursor is exhausted', async () => {
    const view = await mountFeed();
    for (let i = 0; i < 3; i++) await loadNextPage(view);

    expect(view.result.current.hasMore).toBe(false);
    expect(requestedCursors()).toEqual([null, 'p009', 'p019']);
  });

  it('is a no-op at the end rather than requesting another page', async () => {
    const view = await mountFeed();
    for (let i = 0; i < 3; i++) await loadNextPage(view);
    const settled = ids(view);
    const callsAtEnd = getFeedTimeline.mock.calls.length;

    await loadNextPage(view);
    await loadNextPage(view);

    expect(ids(view)).toEqual(settled);
    expect(getFeedTimeline).toHaveBeenCalledTimes(callsAtEnd);
  });

  it('has nothing to load when the feed is shorter than one page', async () => {
    setServerRows(makePosts(4));
    const view = await mountFeed();

    expect(ids(view).length).toBe(4);
    expect(view.result.current.hasMore).toBe(false);
  });

  it('handles an empty feed', async () => {
    setServerRows([]);
    const view = await mountFeed();

    expect(ids(view)).toEqual([]);
    expect(view.result.current.hasMore).toBe(false);
    expect(view.result.current.loading).toBe(false);
    expect(view.result.current.feedStatus).toBe('no-posts');
  });

  it('stops after the final full server page', async () => {
    setServerRows(makePosts(20));
    const view = await mountFeed();
    expect(view.result.current.hasMore).toBe(true);
    expect(ids(view).length).toBe(10);

    await loadNextPage(view);

    expect(ids(view).length).toBe(20);
    expect(view.result.current.hasMore).toBe(false);
  });
});

describe('E. a failing page read never destroys the feed (§14)', () => {
  it('keeps the revealed posts when a later read fails', async () => {
    const view = await mountFeed();
    await loadNextPage(view);
    const before = ids(view);

    getFeedTimeline.mockResolvedValue({ data: null, error: { message: 'Feed service unavailable' } });
    await act(async () => { await view.result.current.refresh(); });
    await settle();

    expect(ids(view)).toEqual(before);
    expect(view.result.current.error).toBeTruthy();
  });

  it('surfaces an error and no posts when the very first read fails', async () => {
    getFeedTimeline.mockResolvedValue({ data: null, error: { message: 'Feed service unavailable' } });
    const view = await mountFeed();

    expect(ids(view)).toEqual([]);
    expect(view.result.current.error).toBeTruthy();
    expect(view.result.current.loading).toBe(false);
  });

  it('recovers when a retry succeeds', async () => {
    getFeedTimeline.mockResolvedValue({ data: null, error: { message: 'Feed service unavailable' } });
    const view = await mountFeed();
    expect(ids(view)).toEqual([]);

    getFeedTimeline.mockImplementation(async (options: { cursor?: { created_at: string; id: string } | null; limit?: number } = {}) =>
      serveFeedPage(options)
    );
    await act(async () => { await view.result.current.refresh(); });
    await settle();

    expect(ids(view).length).toBe(10);
    expect(view.result.current.error).toBeNull();
  });
});

describe('F. a friends-only post appears without a manual refresh (§12)', () => {
  it('surfaces a newly published friends post for an accepted friend', async () => {
    const view = await mountFeed();
    const before = ids(view);

    const friendsPost = {
      ...makePosts(1)[0],
      id: 'pFRIENDS',
      audience_type: 'friends',
      content: 'friends only',
      created_at: '2026-12-01T00:00:00.000Z',
    };
    setServerRows([friendsPost, ...makePosts(25)]);

    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await settle();

    expect(ids(view)[0]).toBe('pFRIENDS');
    expect(ids(view).slice(1)).toEqual(before);
  });

  it('keeps a friends-only post out of the feed for a non-friend', async () => {
    loadFriendIds.mockResolvedValue(new Set<string>());
    const friendsPost = {
      ...makePosts(1)[0],
      id: 'pFRIENDS',
      audience_type: 'friends',
      content: 'friends only',
      created_at: '2026-12-01T00:00:00.000Z',
    };
    setServerRows([friendsPost, ...makePosts(25)]);

    const view = await mountFeed();
    for (let i = 0; i < 4; i++) await loadNextPage(view);

    // Every server page is fetched, but authorization is applied to each page
    // before anything is rendered. The hidden row never appears.
    expect(ids(view)).not.toContain('pFRIENDS');
    expect(ids(view)).toHaveLength(25);
  });
});

describe('G. a guest feed sees only public posts (§11, §17)', () => {
  it('never receives friends-only or only-me rows', async () => {
    const { useHomeFeed: useGuestFeed } = await import('@/hooks/useHomeFeed');
    loadFriendIds.mockResolvedValue(new Set<string>());
    const hidden = [
      { ...makePosts(1, () => ({ id: 'pFRIENDS', audience_type: 'friends' }))[0], created_at: '2026-12-01T00:00:00.000Z' },
      { ...makePosts(1, () => ({ id: 'pPRIVATE', audience_type: 'only_me' }))[0], created_at: '2026-12-02T00:00:00.000Z' },
    ];
    setServerRows([...hidden, ...makePosts(20)]);

    const view = renderHook(() => useGuestFeed());
    await settle();
    for (let i = 0; i < 3; i++) await loadNextPage(view);

    const all = ids(view);
    expect(all).not.toContain('pFRIENDS');
    expect(all).not.toContain('pPRIVATE');
    expect(all).toHaveLength(20);
  });
});
