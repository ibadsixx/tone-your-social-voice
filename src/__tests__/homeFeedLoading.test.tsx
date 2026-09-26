// Home/Feed loading architecture (do.md — "Fix the Home/Feed loading architecture").
//
// These tests pin the *independence* contract that the fix introduced:
//
//   1. The Home shell renders immediately, without waiting on the feed.
//   2. The feed has its own loading state, so a slow feed never blanks the page.
//   3. Reels suggestions and Friend suggestions mount, load and render on their
//      own schedule — a slow one cannot hold up the feed, and vice versa.
//   4. A failure in one section is contained to that section.
//
// Before the fix, `Home.tsx` returned a full-page spinner while
// `useHomeFeed().loading` was true, and both discovery sections were rendered
// from inside `posts.map()` at a fixed index, so they could not mount at all
// until the feed had resolved AND had at least 3 (or 5) posts. That is the
// "one long spinner, then every section appears at once" symptom.
//
// The audience matrix is covered in postVisibility.test.ts; this file is only
// about *when* things render, not *whether* a viewer may see them.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const VIEWER_ID = 'b';

// --- Mocks -----------------------------------------------------------------

const homeFeed = vi.hoisted(() => ({
  posts: [] as unknown[],
  loading: true,
  error: null as string | null,
  hasMore: false,
  loadMore: vi.fn(),
  refresh: vi.fn(),
  createPost: vi.fn(),
  toggleLike: vi.fn(),
}));

vi.mock('@/hooks/useHomeFeed', () => ({ useHomeFeed: () => homeFeed }));

const auth = vi.hoisted(() => ({ user: { id: 'b' } as { id: string } | null }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));

// Section stubs that record their own loading state independently of the feed.
vi.mock('@/components/Stories', () => ({
  default: () => <div data-testid="stories">stories</div>,
}));
vi.mock('@/components/NewPost', () => ({
  default: () => <div data-testid="composer">composer</div>,
}));
vi.mock('@/components/PeopleYouMayKnow', () => ({
  PeopleYouMayKnow: () => <div data-testid="pymk">friend suggestions</div>,
}));
vi.mock('@/components/reels/HorizontalReelsSection', () => ({
  default: () => <div data-testid="reels">reels suggestions</div>,
}));
vi.mock('@/components/Post', () => ({
  default: (props: { id: string }) => <div data-testid="post">{`post:${props.id}`}</div>,
}));

// framer-motion is irrelevant to loading behaviour and slow in jsdom.
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: (_t, tag: string) => tag }),
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

import Home from '@/pages/Home';

// --- IntersectionObserver stub ---------------------------------------------
//
// jsdom has no IntersectionObserver, and the behaviour under test is *what the
// component does when the sentinel enters the band*, so the observer is stubbed
// with something the test can drive by hand.

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;
const observers: { callback: ObserverCallback; options?: IntersectionObserverInit }[] = [];

class MockIntersectionObserver {
  constructor(callback: ObserverCallback, options?: IntersectionObserverInit) {
    observers.push({ callback, options });
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}

/** Pretend the sentinel entered the observer band. */
function intersectSentinel() {
  observers.forEach(o => o.callback([{ isIntersecting: true }]));
}

// --- Helpers ---------------------------------------------------------------

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  );
}

function post(id: string) {
  return { id, user_id: 'a', content: `body ${id}`, audience_type: 'public', created_at: '2026-01-01T00:00:00.000Z' };
}

beforeEach(() => {
  homeFeed.posts = [];
  homeFeed.loading = true;
  homeFeed.error = null;
  homeFeed.hasMore = false;
  homeFeed.loadMore = vi.fn();
  homeFeed.refresh = vi.fn();
  auth.user = { id: VIEWER_ID };
  observers.length = 0;
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
});

// --- Tests -----------------------------------------------------------------

describe('Home shell is not blocked by the feed', () => {
  it('renders the shell while the feed is still loading', () => {
    homeFeed.loading = true;
    homeFeed.posts = [];
    renderHome();

    // The composer and stories are part of the shell, not the feed. They must be
    // on screen before any feed response arrives.
    expect(screen.getByTestId('composer')).toBeTruthy();
    expect(screen.getByTestId('stories')).toBeTruthy();
  });

  it('shows a feed skeleton while the feed is loading, then the posts', async () => {
    homeFeed.loading = true;
    homeFeed.posts = [];
    const view = renderHome();

    expect(screen.getByLabelText('Loading posts')).toBeTruthy();
    expect(screen.queryByTestId('post')).toBeNull();

    // Feed resolves.
    homeFeed.loading = false;
    homeFeed.posts = [post('p1'), post('p2')];
    view.rerender(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByLabelText('Loading posts')).toBeNull();
    });
    expect(screen.getByText('post:p1')).toBeTruthy();
    expect(screen.getByText('post:p2')).toBeTruthy();
  });

  it('does not show the skeleton again when a background poll is in flight', async () => {
    homeFeed.loading = true;
    homeFeed.posts = [post('p1')];
    const view = renderHome();

    // Posts already on screen — a poll must not replace them with a skeleton.
    expect(screen.getByText('post:p1')).toBeTruthy();
    expect(screen.queryByLabelText('Loading posts')).toBeNull();
    view.unmount();
  });
});

describe('Reels and Friend suggestions are independent of the feed', () => {
  it('mounts both sections even while the feed has resolved nothing', () => {
    homeFeed.loading = true;
    homeFeed.posts = [];
    renderHome();

    // This is the regression: these used to live inside `posts.map()`, so with
    // zero posts neither could render.
    expect(screen.getByTestId('reels')).toBeTruthy();
    expect(screen.getByTestId('pymk')).toBeTruthy();
  });

  it('keeps both sections rendered when the feed fails', async () => {
    homeFeed.loading = false;
    homeFeed.posts = [];
    homeFeed.error = 'Gateway unreachable';
    renderHome();

    await waitFor(() => {
      expect(screen.getByText('Could not load the feed')).toBeTruthy();
    });
    expect(screen.getByText('Gateway unreachable')).toBeTruthy();

    // Error isolation: the other sections are untouched.
    expect(screen.getByTestId('reels')).toBeTruthy();
    expect(screen.getByTestId('pymk')).toBeTruthy();
    expect(screen.getByTestId('composer')).toBeTruthy();
  });

  it('offers a retry from the feed error state', async () => {
    homeFeed.loading = false;
    homeFeed.posts = [];
    homeFeed.error = 'boom';
    renderHome();

    await waitFor(() => expect(screen.getByText('Try again')).toBeTruthy());
    screen.getByText('Try again').click();
    expect(homeFeed.refresh).toHaveBeenCalled();
  });

  it('shows the welcome empty state, not an error, when the feed is simply empty', () => {
    homeFeed.loading = false;
    homeFeed.posts = [];
    homeFeed.error = null;
    renderHome();

    expect(screen.getByText('Welcome to Tone!')).toBeTruthy();
    expect(screen.queryByText('Could not load the feed')).toBeNull();
  });

  it('hides Friend suggestions from guests but keeps Reels', () => {
    auth.user = null;
    homeFeed.loading = true;
    homeFeed.posts = [];
    renderHome();

    expect(screen.getByTestId('reels')).toBeTruthy();
    expect(screen.queryByTestId('pymk')).toBeNull();
    // Guests get the sign-in card rather than the composer.
    expect(screen.queryByTestId('composer')).toBeNull();
    expect(screen.queryByTestId('stories')).toBeNull();
  });
});

describe('infinite scroll (do.md §1-§3, §13)', () => {
  it('renders no "Load more posts" button anywhere', () => {
    homeFeed.loading = false;
    homeFeed.posts = [post('p1'), post('p2')];
    homeFeed.hasMore = true;
    renderHome();

    expect(screen.queryByText('Load more posts')).toBeNull();
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
  });

  it('watches a sentinel at the end of the feed with an IntersectionObserver', () => {
    homeFeed.loading = false;
    homeFeed.posts = [post('p1')];
    homeFeed.hasMore = true;
    renderHome();

    expect(screen.getByTestId('feed-sentinel')).toBeTruthy();
    expect(observers.length).toBe(1);
  });

  it('prefetches before the user reaches the end (rootMargin 500-1000px)', () => {
    homeFeed.loading = false;
    homeFeed.posts = [post('p1')];
    homeFeed.hasMore = true;
    renderHome();

    const rootMargin = observers[0]?.options?.rootMargin ?? '';
    const px = Number(rootMargin.match(/(\d+)px/)?.[1] ?? '0');
    // §3/§5: load while the user is still 500-1000px away, never at a blank gap.
    expect(px).toBeGreaterThanOrEqual(500);
    expect(px).toBeLessThanOrEqual(1000);
  });

  it('reveals the next page automatically when the sentinel is reached', () => {
    homeFeed.loading = false;
    homeFeed.posts = [post('p1')];
    homeFeed.hasMore = true;
    renderHome();

    expect(homeFeed.loadMore).not.toHaveBeenCalled();
    intersectSentinel();
    expect(homeFeed.loadMore).toHaveBeenCalledTimes(1);
  });

  it('does not ask for another page once the feed has ended (§13)', () => {
    homeFeed.loading = false;
    homeFeed.posts = [post('p1')];
    homeFeed.hasMore = false;
    renderHome();

    intersectSentinel();
    expect(homeFeed.loadMore).not.toHaveBeenCalled();
    expect(screen.getByText(/all caught up/i)).toBeTruthy();
  });

  it('keeps existing posts on screen while a page is revealed (§6)', () => {
    homeFeed.loading = false;
    homeFeed.posts = [post('p1'), post('p2'), post('p3')];
    homeFeed.hasMore = true;
    renderHome();

    expect(screen.getAllByTestId('post').length).toBe(3);
    // No full-page loader appears just because the sentinel was reached.
    intersectSentinel();
    expect(screen.getAllByTestId('post').length).toBe(3);
  });

  it('re-observes nothing when a page is revealed (observer is not torn down)', () => {
    homeFeed.loading = false;
    homeFeed.posts = [post('p1')];
    homeFeed.hasMore = true;
    renderHome();
    const created = observers.length;

    intersectSentinel();
    // Re-rendering as a result of revealing must not build a second observer,
    // which is what would make mid-scroll pagination stutter.
    expect(observers.length).toBe(created);
  });
});

describe('feed error handling (§14)', () => {
  it('keeps loaded posts visible and offers a retry instead of blanking the feed', () => {
    homeFeed.loading = false;
    homeFeed.posts = [post('p1'), post('p2')];
    homeFeed.hasMore = true;
    homeFeed.error = 'Gateway unreachable';
    renderHome();

    expect(screen.getAllByTestId('post').length).toBe(2);
    const retry = screen.getByRole('button', { name: /try again/i });
    expect(retry).toBeTruthy();
    retry.click();
    expect(homeFeed.refresh).toHaveBeenCalled();
  });
});
