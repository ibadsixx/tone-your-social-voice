// Infinite-scroll pagination (do.md — "Replace Load more with infinite scroll").
//
// These tests pin the *pagination contract* of `useHomeFeed`:
//
//   * The timeline is read ONCE and pages are revealed from it (§4, §5).
//   * Pages are appended, never re-fetched or replaced (§2, §6).
//   * The position is a stable `(created_at, id)` cursor, not an offset (§8, §9).
//   * No post is ever duplicated, skipped or reordered across page boundaries (§9, §10).
//   * The end of the feed stops pagination instead of looping (§13).
//   * A failed re-read keeps the posts the user is already reading (§14).
//
// The offset implementation these replace had a correctness bug, not just a
// performance one. Because the Gateway ignores `range` and the client slices,
// page 2 is `.slice(10, 20)` of a list that gains a new row at the top the
// moment anyone posts — so one post is served twice and another never at all.
// `tiesAndNewPost` below reproduces exactly that.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const OWNER_ID = 'a';
const VIEWER_ID = 'b';

const getFeedTimeline = vi.fn();
const loadFriendIds = vi.fn();

vi.mock('@/api', () => ({
  postsApi: {
    getFeedTimeline: (...args: unknown[]) => getFeedTimeline(...args),
    createPost: vi.fn(),
  },
}));

vi.mock('@/lib/gateway', () => ({
  gateway: {
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

/** `n` public posts, newest first, with strictly descending timestamps. */
function makePosts(n: number, overrides: (i: number) => Record<string, unknown> = () => ({})) {
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
  }));
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

function ids(view: { result: { current: { posts: { id: string }[] } } }) {
  return view.result.current.posts.map(p => p.id);
}

beforeEach(() => {
  getFeedTimeline.mockReset();
  loadFriendIds.mockReset();
  loadFriendIds.mockResolvedValue(new Set([OWNER_ID]));
  getFeedTimeline.mockResolvedValue({ data: makePosts(25), error: null });
});

// --- Tests -----------------------------------------------------------------

describe('A. the timeline is read once and paged in memory (§2, §4, §5)', () => {
  it('shows only the first page on first paint', async () => {
    const view = await mountFeed();

    expect(ids(view).length).toBe(10);
    expect(view.result.current.hasMore).toBe(true);
  });

  it('issues exactly one request for the whole feed, not one per page', async () => {
    const view = await mountFeed();
    expect(getFeedTimeline).toHaveBeenCalledTimes(1);

    await act(async () => { view.result.current.loadMore(); });
    await act(async () => { view.result.current.loadMore(); });

    // 25 posts revealed across three pages, still one request. Under the old
    // offset implementation this would have been three full-table downloads.
    expect(ids(view).length).toBe(25);
    expect(getFeedTimeline).toHaveBeenCalledTimes(1);
  });

  it('appends the next page instead of replacing the feed (§2)', async () => {
    const view = await mountFeed();
    const firstPage = ids(view);

    await act(async () => { view.result.current.loadMore(); });

    // Everything already on screen is still on screen, in the same order.
    expect(ids(view).slice(0, 10)).toEqual(firstPage);
    expect(ids(view).length).toBe(20);
  });

  it('does not disturb the posts already loaded when revealing (§6)', async () => {
    const view = await mountFeed();
    await act(async () => { view.result.current.loadMore(); });
    await act(async () => { view.result.current.loadMore(); });

    const all = ids(view);
    expect(new Set(all).size).toBe(all.length);
    expect(view.result.current.loading).toBe(false);
  });
});

describe('B. no duplicates, no skips, stable order (§8, §9, §10)', () => {
  it('reveals every post exactly once, in order, across many pages', async () => {
    const view = await mountFeed();

    for (let i = 0; i < 5; i++) {
      await act(async () => { view.result.current.loadMore(); });
    }

    const all = ids(view);
    expect(all).toEqual(makePosts(25).map(p => p.id));
    expect(new Set(all).size).toBe(25);
  });

  it('breaks created_at ties with id, so a shared timestamp still pages deterministically', async () => {
    // Every post shares one timestamp — the case a created_at-only cursor gets
    // wrong, and the reason the spec asks for a tie-breaker.
    getFeedTimeline.mockResolvedValue({
      data: makePosts(25, () => ({ created_at: '2026-01-01T00:00:00.000Z' })),
      error: null,
    });
    const view = await mountFeed();

    for (let i = 0; i < 5; i++) {
      await act(async () => { view.result.current.loadMore(); });
    }

    const all = ids(view);
    expect(new Set(all).size).toBe(25);
    // Ties resolve by id descending, which is the declared total order.
    expect(all).toEqual([...all].sort().reverse());
  });

  it('deduplicates a timeline that repeats a post id (§10)', async () => {
    getFeedTimeline.mockResolvedValue({
      data: [...makePosts(12), ...makePosts(3)],
      error: null,
    });
    const view = await mountFeed();

    for (let i = 0; i < 3; i++) {
      await act(async () => { view.result.current.loadMore(); });
    }

    const all = ids(view);
    expect(new Set(all).size).toBe(all.length);
  });

  it('does not duplicate or drop a post published mid-scroll (§9)', async () => {
    const view = await mountFeed();
    await act(async () => { view.result.current.loadMore(); });
    const beforeReveal = ids(view);

    // Somebody posts while the user is on page 2. Under offset paging this
    // shifted every later page by one row: p000 appeared twice and p020 never.
    const newPost = {
      ...makePosts(1)[0],
      id: 'pNEW',
      content: 'just posted',
      created_at: new Date(Date.UTC(2026, 5, 1)).toISOString(),
    };
    getFeedTimeline.mockResolvedValue({ data: [newPost, ...makePosts(25)], error: null });

    // A background poll picks it up.
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await settle();

    // The new post is at the top; everything already revealed is untouched.
    expect(ids(view)[0]).toBe('pNEW');
    expect(ids(view).slice(1, beforeReveal.length + 1)).toEqual(beforeReveal);

    await act(async () => { view.result.current.loadMore(); });
    // `loadMore` is a synchronous reveal in the cursor implementation; the flush
    // is here so an implementation that made it async could not pass this test
    // by leaving the assertion to observe an unchanged list.
    await settle();

    const all = ids(view);
    expect(new Set(all).size).toBe(all.length);
    // Every original post is still present exactly once, and the new one is too.
    expect(all).toHaveLength(26);
    for (const id of makePosts(25).map(p => p.id)) {
      expect(all).toContain(id);
    }
    expect(all).toContain('pNEW');
  });
});

describe('C. repeated triggers do not re-request a page (§7)', () => {
  it('advances the cursor on every call instead of re-serving the same page', async () => {
    const view = await mountFeed();

    // An IntersectionObserver can fire several times for one approach to the
    // sentinel. Each call must move forward, never re-serve.
    await act(async () => {
      view.result.current.loadMore();
      view.result.current.loadMore();
      view.result.current.loadMore();
    });

    expect(ids(view).length).toBe(25); // not 10, and not 15 with repeats
    expect(new Set(ids(view)).size).toBe(25);
    // Still zero additional requests.
    expect(getFeedTimeline).toHaveBeenCalledTimes(1);
  });
});

describe('D. the end of the feed (§13)', () => {
  it('reports no more pages once everything is revealed', async () => {
    const view = await mountFeed();
    for (let i = 0; i < 3; i++) {
      await act(async () => { view.result.current.loadMore(); });
    }

    expect(view.result.current.hasMore).toBe(false);
  });

  it('is a no-op at the end rather than looping', async () => {
    const view = await mountFeed();
    for (let i = 0; i < 3; i++) {
      await act(async () => { view.result.current.loadMore(); });
    }
    const settled = ids(view);

    await act(async () => { view.result.current.loadMore(); });
    await act(async () => { view.result.current.loadMore(); });

    expect(ids(view)).toEqual(settled);
    expect(getFeedTimeline).toHaveBeenCalledTimes(1);
  });

  it('has nothing to load when the feed is shorter than one page', async () => {
    getFeedTimeline.mockResolvedValue({ data: makePosts(4), error: null });
    const view = await mountFeed();

    expect(ids(view).length).toBe(4);
    expect(view.result.current.hasMore).toBe(false);
  });

  it('handles an empty feed', async () => {
    getFeedTimeline.mockResolvedValue({ data: [], error: null });
    const view = await mountFeed();

    expect(ids(view)).toEqual([]);
    expect(view.result.current.hasMore).toBe(false);
    expect(view.result.current.loading).toBe(false);
  });

  it('handles an empty page (feed length is an exact multiple of the page size)', async () => {
    getFeedTimeline.mockResolvedValue({ data: makePosts(20), error: null });
    const view = await mountFeed();
    expect(view.result.current.hasMore).toBe(true);

    await act(async () => { view.result.current.loadMore(); });
    await act(async () => { view.result.current.loadMore(); });

    expect(ids(view).length).toBe(20);
    expect(view.result.current.hasMore).toBe(false);
  });
});

describe('E. a failing re-read never destroys the feed (§14)', () => {
  it('keeps the revealed posts when a later read fails', async () => {
    const view = await mountFeed();
    await act(async () => { view.result.current.loadMore(); });
    const before = ids(view);

    getFeedTimeline.mockResolvedValue({ data: null, error: { message: 'Gateway unreachable' } });
    await act(async () => { view.result.current.refresh(); });
    await settle();

    // Every post the user was reading is still there (§14).
    expect(ids(view)).toEqual(before);
    expect(view.result.current.error).toBeTruthy();
  });

  it('surfaces an error and no posts when the very first read fails', async () => {
    getFeedTimeline.mockResolvedValue({ data: null, error: { message: 'Gateway unreachable' } });
    const view = await mountFeed();

    expect(ids(view)).toEqual([]);
    expect(view.result.current.error).toBeTruthy();
    expect(view.result.current.loading).toBe(false);
  });

  it('recovers when a retry succeeds', async () => {
    getFeedTimeline.mockResolvedValue({ data: null, error: { message: 'Gateway unreachable' } });
    const view = await mountFeed();
    expect(ids(view)).toEqual([]);

    getFeedTimeline.mockResolvedValue({ data: makePosts(25), error: null });
    await act(async () => { view.result.current.refresh(); });
    await settle();

    expect(ids(view).length).toBe(10);
    expect(view.result.current.error).toBeNull();
  });
});

describe('F. a friends-only post appears without a manual refresh (§12)', () => {
  it('surfaces a newly published friends post for an accepted friend', async () => {
    const view = await mountFeed();
    const before = ids(view);

    // A publishes a friends-only post; B is an accepted friend, so it is
    // authorized and must appear on its own.
    getFeedTimeline.mockResolvedValue({
      data: [
        {
          id: 'pFRIENDS',
          user_id: OWNER_ID,
          content: 'friends only',
          media_url: null,
          media_type: null,
          audience_type: 'friends',
          visibility: null,
          status: 'published',
          created_at: '2026-12-01T00:00:00.000Z',
          profiles: { username: 'a', display_name: 'A', profile_pic: null },
        },
        ...makePosts(25),
      ],
      error: null,
    });

    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await settle();

    expect(ids(view)[0]).toBe('pFRIENDS');
    expect(ids(view).slice(1)).toEqual(before);
  });

  it('keeps a friends-only post out of the feed for a non-friend', async () => {
    loadFriendIds.mockResolvedValue(new Set<string>());
    getFeedTimeline.mockResolvedValue({
      data: [
        {
          id: 'pFRIENDS',
          user_id: OWNER_ID,
          content: 'friends only',
          media_url: null,
          media_type: null,
          audience_type: 'friends',
          visibility: null,
          status: 'published',
          created_at: '2026-12-01T00:00:00.000Z',
          profiles: { username: 'a', display_name: 'A', profile_pic: null },
        },
        ...makePosts(25),
      ],
      error: null,
    });

    const view = await mountFeed();
    for (let i = 0; i < 3; i++) {
      await act(async () => { view.result.current.loadMore(); });
    }

    // Revealing every page must not surface it either: authorization is applied
    // once, to the whole timeline, before anything is paginated (§11).
    expect(ids(view)).not.toContain('pFRIENDS');
  });
});

describe('G. a guest feed sees only public posts (§11, §17)', () => {
  it('never receives friends-only or only-me rows', async () => {
    const { useHomeFeed: useGuestFeed } = await import('@/hooks/useHomeFeed');
    loadFriendIds.mockResolvedValue(new Set<string>());
    getFeedTimeline.mockResolvedValue({
      data: [
        ...makePosts(20),
        { ...makePosts(1, () => ({ id: 'pFRIENDS', audience_type: 'friends', created_at: '2026-12-01T00:00:00.000Z' }))[0] },
        { ...makePosts(1, () => ({ id: 'pPRIVATE', audience_type: 'only_me', created_at: '2026-12-02T00:00:00.000Z' }))[0] },
      ],
      error: null,
    });

    const view = renderHook(() => useGuestFeed());
    await settle();
    for (let i = 0; i < 3; i++) {
      await act(async () => { view.result.current.loadMore(); });
    }

    const all = ids(view);
    expect(all).not.toContain('pFRIENDS');
    expect(all).not.toContain('pPRIVATE');
  });
});
