// Regression tests for the SECOND bug in do.md: delayed visibility.
//
// The authorization matrix is covered in postVisibility.test.ts and
// contentVisibilityTest.ts (Gateway). These tests pin the *synchronization*
// contract: when somebody else publishes, an authorized viewer must see it
// without a reload, and an unauthorized viewer must never see it arrive.
//
// Root cause this guards against: `GatewayChannel` in src/lib/gateway.ts stores
// `postgres_changes` callbacks but never opens a WebSocket and never invokes
// them, so there is no server push for table changes anywhere in the app. The
// feed therefore depends entirely on client-side invalidation, and before this
// fix the only trigger was a 60s timer that is skipped while the tab is hidden.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// --- Mocks -----------------------------------------------------------------

const OWNER_ID = 'a';       // publishes the friends-only content
const VIEWER_ID = 'b';      // accepted friend
const STRANGER_ID = 'c';    // not a friend

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

// Keep the REAL audience evaluator (it is the thing under test downstream of the
// sync change) and only stub the friendship lookup, which is exercised separately
// in postVisibility.test.ts.
vi.mock('@/lib/postVisibility', async () => {
  const actual = await vi.importActual<typeof import('@/lib/postVisibility')>('@/lib/postVisibility');
  return {
    ...actual,
    loadFriendIds: (...args: unknown[]) => loadFriendIds(...args),
  };
});

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: VIEWER_ID } }) }));
vi.mock('@/hooks/useNotifications', () => ({ createNotification: vi.fn() }));

// `useHomeFeed` is imported after the mocks are registered.
const { useHomeFeed, POST_CREATED_EVENT } = await import('@/hooks/useHomeFeed');

// --- Fixtures --------------------------------------------------------------

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
    created_at: '2026-01-02T00:00:00.000Z',
    profiles: { username: 'a', display_name: 'A', profile_pic: null },
    ...overrides,
  };
}

function publicPost(overrides: Record<string, unknown> = {}) {
  return {
    // Older than the Friends post on purpose. Every test below describes "A
    // publishes to Friends while B has the feed open", and a genuinely newer
    // post is what makes that unambiguous.
    //
    // These two fixtures used to share a `created_at`, which left the expected
    // order resting on whatever the server happened to return. The feed now
    // sorts by `(created_at, id)` so that pagination has a stable total order
    // (do.md §9), which made that ambiguity fail loudly. The tie-break itself is
    // pinned in homeFeedInfiniteScroll.test.ts.
    ...friendsPost({
      id: 'post-public-1',
      audience_type: 'public',
      created_at: '2026-01-01T00:00:00.000Z',
    }),
    ...overrides,
  };
}

/** Flush the promise chain inside act(). */
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

/** Fire a window event and let the resulting fetches settle. */
async function fireWindow(type: string) {
  await act(async () => {
    window.dispatchEvent(new Event(type));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  getFeedTimeline.mockReset();
  loadFriendIds.mockReset();
  // Viewer B is an accepted friend of A only.
  loadFriendIds.mockResolvedValue(new Set([OWNER_ID]));
  getFeedTimeline.mockResolvedValue({ data: [publicPost()], error: null });
});

afterEach(() => {
  vi.useRealTimers();
});

// --- Tests -----------------------------------------------------------------

describe('home feed synchronization (do.md bug #2)', () => {
  it('prepends a newly published Friends post on window focus, with no reload', async () => {
    getFeedTimeline.mockResolvedValue({ data: [publicPost()], error: null });
    const { result } = await mountFeed();
    expect(result.current.posts.map(p => p.id)).toEqual(['post-public-1']);

    // A publishes to Friends while B has the feed open.
    getFeedTimeline.mockResolvedValue({
      data: [friendsPost(), publicPost()],
      error: null,
    });

    await fireWindow('focus');

    await waitFor(() => {
      expect(result.current.posts.map(p => p.id)).toEqual(['post-friends-1', 'post-public-1']);
    });
  });

  it('catches up when the tab becomes visible again (visibilitychange)', async () => {
    getFeedTimeline.mockResolvedValue({ data: [publicPost()], error: null });
    const { result } = await mountFeed();

    getFeedTimeline.mockResolvedValue({ data: [friendsPost(), publicPost()], error: null });

    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.posts.map(p => p.id)).toEqual(['post-friends-1', 'post-public-1']);
    });
    hidden.mockRestore();
  });

  it('catches up when the network reconnects (online)', async () => {
    getFeedTimeline.mockResolvedValue({ data: [publicPost()], error: null });
    const { result } = await mountFeed();
    const before = getFeedTimeline.mock.calls.length;

    getFeedTimeline.mockResolvedValue({ data: [friendsPost(), publicPost()], error: null });
    await fireWindow('online');

    expect(getFeedTimeline.mock.calls.length).toBeGreaterThan(before);
    await waitFor(() => {
      expect(result.current.posts.map(p => p.id)).toEqual(['post-friends-1', 'post-public-1']);
    });
  });

  it('re-reads the accepted-friend list on every check (no stale friendship cache)', async () => {
    const { result } = await mountFeed();
    loadFriendIds.mockClear();

    await fireWindow('focus');
    // do.md section 14: a just-accepted friendship must take effect immediately.
    expect(loadFriendIds).toHaveBeenCalled();

    getFeedTimeline.mockResolvedValue({ data: [friendsPost(), publicPost()], error: null });
    await fireWindow('focus');
    await waitFor(() => {
      expect(result.current.posts.map(p => p.id)).toContain('post-friends-1');
    });
  });

  it('does not duplicate a post that is already displayed', async () => {
    getFeedTimeline.mockResolvedValue({ data: [friendsPost(), publicPost()], error: null });
    const { result } = await mountFeed();
    expect(result.current.posts.map(p => p.id)).toEqual(['post-friends-1', 'post-public-1']);

    await fireWindow('focus');
    await fireWindow('online');

    expect(result.current.posts.map(p => p.id)).toEqual(['post-friends-1', 'post-public-1']);
  });

  it('polls on a bounded interval so an open feed is never stale for a minute', async () => {
    vi.useFakeTimers();
    getFeedTimeline.mockResolvedValue({ data: [publicPost()], error: null });

    const { result } = renderHook(() => useHomeFeed());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const callsAfterMount = getFeedTimeline.mock.calls.length;

    // The old interval was 60_000, which is the "appears after a very long
    // delay" symptom for a viewer who simply leaves the tab open.
    await act(async () => {
      vi.advanceTimersByTime(21_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getFeedTimeline.mock.calls.length).toBeGreaterThan(callsAfterMount);
    void result;
  });

  it('collapses concurrent triggers into a single request', async () => {
    const { result } = await mountFeed();
    const before = getFeedTimeline.mock.calls.length;

    // A laptop waking from sleep fires focus/visibilitychange/online together.
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getFeedTimeline.mock.calls.length - before).toBe(1);
    void result;
  });

  it('still reacts to POST_CREATED_EVENT from the composer', async () => {
    const { result } = await mountFeed();
    getFeedTimeline.mockResolvedValue({ data: [friendsPost(), publicPost()], error: null });

    await act(async () => {
      window.dispatchEvent(new CustomEvent(POST_CREATED_EVENT));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.posts.map(p => p.id)).toEqual(['post-friends-1', 'post-public-1']);
    });
  });

  it('never delivers a Friends post to a non-friend through the sync path', async () => {
    // Viewer C is not a friend of A.
    loadFriendIds.mockResolvedValue(new Set<string>());
    getFeedTimeline.mockResolvedValue({ data: [friendsPost(), publicPost()], error: null });

    const { result } = await mountFeed();

    expect(result.current.posts.map(p => p.id)).toEqual(['post-public-1']);

    // A new Friends post must not appear for C on any trigger.
    getFeedTimeline.mockResolvedValue({
      data: [friendsPost({ id: 'post-friends-2' }), friendsPost(), publicPost()],
      error: null,
    });
    await fireWindow('focus');
    await fireWindow('online');

    expect(result.current.posts.map(p => p.id)).toEqual(['post-public-1']);
  });

  it('never delivers a Friends post to a guest through the sync path', async () => {
    // No viewer id at all.
    vi.doMock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
    vi.resetModules();
    loadFriendIds.mockResolvedValue(new Set<string>());
    getFeedTimeline.mockResolvedValue({ data: [friendsPost(), publicPost()], error: null });

    const { useHomeFeed: useHomeFeedGuest } = await import('@/hooks/useHomeFeed');
    const view = renderHook(() => useHomeFeedGuest());
    await settle();

    expect(view.result.current.posts.map(p => p.id)).toEqual(['post-public-1']);

    getFeedTimeline.mockResolvedValue({
      data: [friendsPost({ id: 'post-friends-3' }), friendsPost(), publicPost()],
      error: null,
    });
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(view.result.current.posts.map(p => p.id)).toEqual(['post-public-1']);
  });
});
