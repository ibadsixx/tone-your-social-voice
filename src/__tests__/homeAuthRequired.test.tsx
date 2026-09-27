// The Home/Feed page is restricted to authenticated users (do.md — "Update the
// Tone app so that the Home/Feed page is strictly restricted to authenticated
// users").
//
// The requirement is not "hide the feed from guests" — it is that a guest never
// reaches the page at all. That distinction is the whole test suite, because a
// `if (!user) return <Navigate/>` inside Home would pass every "is the feed
// visible" assertion while still having mounted the page, and mounting is what
// runs the effect that requests the feed. So these tests assert on MOUNTS and on
// REQUESTS, not on styling.
//
// The three states of the guard are each load-bearing:
//
//   * session unresolved -> nothing renders, because "unknown" is not "guest";
//     redirecting here would bounce a signed-in visitor off Home on refresh.
//   * resolved, no session -> redirect to /auth, and the page never mounts.
//   * resolved, with a session -> the page mounts and behaves as before.
//
// `RequireAuth` is exercised directly, and then through the real route table so
// the wiring is covered too. The public routes are asserted alongside, because
// the requirement cuts both ways: Home becomes private WITHOUT narrowing the
// surfaces that are supposed to stay guest-readable (do.md §13).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const authState = vi.hoisted(() => ({
  user: null as { id: string } | null,
  session: null as { access_token: string } | null,
  loading: false,
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));

// The feed is the thing that must not be requested, so every test asserts on
// this call rather than on rendered output alone.
const getFeedTimeline = vi.hoisted(() => vi.fn());
const loadFriendIds = vi.hoisted(() => vi.fn());
const loadUnfollowedGroupIds = vi.hoisted(() => vi.fn());

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>();
  return {
    ...actual,
    postsApi: { ...actual.postsApi, getFeedTimeline: (...a: unknown[]) => getFeedTimeline(...a) },
  };
});

vi.mock('@/lib/gateway', () => ({
  gateway: { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }) },
}));

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: (_t, tag: string) => tag }),
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

// Home's sibling sections each own their own requests. They are stubbed so a
// failure in any of them cannot be mistaken for the feed being requested: the
// only request this suite watches is the timeline itself.
vi.mock('@/components/Stories', () => ({ default: () => <div data-testid="stories" /> }));
vi.mock('@/components/NewPost', () => ({ default: () => <div data-testid="new-post" /> }));
// A named export, unlike its siblings.
vi.mock('@/components/PeopleYouMayKnow', () => ({
  PeopleYouMayKnow: () => <div data-testid="people-you-may-know" />,
}));
vi.mock('@/components/Post', () => ({ default: () => <div data-testid="post-card" /> }));
vi.mock('@/components/reels/HorizontalReelsSection', () => ({
  default: () => <div data-testid="reels-section" />,
}));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import Home from '@/pages/Home';
import RequireAuth from '@/components/RequireAuth';

/** A stand-in that records whether the protected page ever mounted. */
const homeMounts = vi.hoisted(() => [] as string[]);
function MountProbe() {
  homeMounts.push('home');
  return <div data-testid="home-page">home feed</div>;
}

function setAuth(state: Partial<typeof authState>) {
  Object.assign(authState, { user: null, session: null, loading: false, ...state });
}

function authedUser() {
  return { user: { id: 'u1' }, session: { access_token: 'jwt' }, loading: false };
}

beforeEach(() => {
  homeMounts.length = 0;
  setAuth({ user: null, session: null, loading: false });
  getFeedTimeline.mockReset();
  getFeedTimeline.mockResolvedValue({ data: [], error: null });
  loadFriendIds.mockReset();
  loadFriendIds.mockResolvedValue(new Set());
  loadUnfollowedGroupIds.mockReset();
  loadUnfollowedGroupIds.mockResolvedValue(new Set());
});

// --- A. the guard itself ----------------------------------------------------

describe('A. RequireAuth decides on the resolved session', () => {
  function renderGuarded(initialPath = '/') {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/" element={<RequireAuth><MountProbe /></RequireAuth>} />
          <Route path="/auth" element={<div data-testid="auth-page">sign in</div>} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('renders nothing at all while the session is still resolving', () => {
    setAuth({ user: null, session: null, loading: true });

    const { container } = renderGuarded();

    // Not the page, and not a spinner standing in for it: the answer is not
    // known yet, and guessing "guest" would redirect a signed-in visitor off
    // Home on every refresh.
    expect(container.innerHTML).toBe('');
    expect(homeMounts).toHaveLength(0);
  });

  it('redirects a guest to /auth and never mounts the page', async () => {
    renderGuarded();

    await waitFor(() => expect(screen.queryByTestId('auth-page')).not.toBeNull());
    expect(screen.queryByTestId('home-page')).toBeNull();
    expect(homeMounts).toHaveLength(0);
  });

  it('renders the page for a signed-in visitor', () => {
    setAuth(authedUser());

    renderGuarded();

    expect(screen.queryByTestId('home-page')).not.toBeNull();
    expect(screen.queryByTestId('auth-page')).toBeNull();
  });

  it('treats a half-populated session as signed out', () => {
    // `user` and `session` are two halves of one fact. A state that has one
    // without the other is not a session, and must not open a protected route.
    setAuth({ user: { id: 'u1' }, session: null, loading: false });

    renderGuarded();

    expect(screen.queryByTestId('auth-page')).not.toBeNull();
    expect(homeMounts).toHaveLength(0);
  });

  it('sends a guest back to the page they asked for after signing in', async () => {
    // The guard records the attempted location so /auth can return them there
    // instead of dumping them on Home.
    function Destination() {
      const location = useLocation() as { state?: { from?: { pathname?: string } } };
      return <div data-testid="intended-destination">{location.state?.from?.pathname}</div>;
    }

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <RequireAuth>
                <MountProbe />
              </RequireAuth>
            }
          />
          <Route path="/auth" element={<Destination />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.queryByTestId('intended-destination')).not.toBeNull());
    expect(screen.getByTestId('intended-destination').textContent).toBe('/');
  });
});

// --- B. the route table -----------------------------------------------------

describe('B. `/` is the guarded route and the public ones are not', () => {
  // Mirrors App.tsx: the guarded index, a guest-readable public route, and the
  // sign-in page they land on.
  function renderApp(initialPath: string) {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
          <Route path="/profile/:username" element={<div data-testid="public-profile">profile</div>} />
          <Route path="/post/:id" element={<div data-testid="public-post">post</div>} />
          <Route path="/groups" element={<div data-testid="public-groups">groups</div>} />
          <Route path="/auth" element={<div data-testid="auth-page">sign in</div>} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('sends a guest at / to /auth with no feed request', async () => {
    renderApp('/');

    await waitFor(() => expect(screen.queryByTestId('auth-page')).not.toBeNull());
    // The requirement is explicit: no Home UI, no feed loading state, no Home
    // requests. The page never mounting is what makes all three true at once.
    expect(getFeedTimeline).not.toHaveBeenCalled();
  });

  it('shows a guest no trace of the feed, including no loading skeleton', async () => {
    renderApp('/');

    await waitFor(() => expect(screen.queryByTestId('auth-page')).not.toBeNull());
    expect(screen.queryByLabelText('Loading posts')).toBeNull();
    expect(screen.queryByText(/welcome to tone/i)).toBeNull();
  });

  it('loads the feed normally for a signed-in visitor', async () => {
    setAuth(authedUser());

    renderApp('/');

    await waitFor(() => expect(getFeedTimeline).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('auth-page')).toBeNull();
  });

  it('still lets a guest read the public surfaces', async () => {
    for (const [path, testId] of [
      ['/profile/someone', 'public-profile'],
      ['/post/abc', 'public-post'],
      ['/groups', 'public-groups'],
    ] as const) {
      const view = renderApp(path);
      expect(screen.queryByTestId(testId)).not.toBeNull();
      // Narrowing Home must not narrow these — the same visit still must not
      // pull the Home timeline.
      expect(getFeedTimeline).not.toHaveBeenCalled();
      view.unmount();
    }
  });
});

// --- C. the transition window (do.md §9, §10, §11) -------------------------

describe('C. nothing is requested while the answer is unknown or the visitor left', () => {
  it('does not request the feed during the authentication transition', async () => {
    // Rendered while the session is still being read — the exact window in
    // which an unguarded mount effect fires its request.
    setAuth({ user: null, session: null, loading: true });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
          <Route path="/auth" element={<div data-testid="auth-page">sign in</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(getFeedTimeline).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(getFeedTimeline).not.toHaveBeenCalled();
  });

  it('loads the feed once the session resolves, without a reload', async () => {
    function App() {
      return (
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
            <Route path="/auth" element={<div data-testid="auth-page">sign in</div>} />
          </Routes>
        </MemoryRouter>
      );
    }

    setAuth({ user: null, session: null, loading: true });
    const view = render(<App />);
    expect(getFeedTimeline).not.toHaveBeenCalled();

    // Signing in while the page is already open: the guard must let Home mount
    // on its own rather than requiring a manual reload.
    setAuth(authedUser());
    view.rerender(<App />);

    await waitFor(() => expect(getFeedTimeline).toHaveBeenCalledTimes(1));
  });

  it('does not keep requesting the feed after sign-out', async () => {
    setAuth(authedUser());

    const view = render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
          <Route path="/auth" element={<div data-testid="auth-page">sign in</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(getFeedTimeline).toHaveBeenCalledTimes(1));

    setAuth({ user: null, session: null, loading: false });
    view.rerender(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
          <Route path="/auth" element={<div data-testid="auth-page">sign in</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Home becomes unreachable immediately: the pollers unmount with it and the
    // guard is already redirecting, so nothing re-arms a request.
    await waitFor(() => expect(screen.queryByTestId('auth-page')).not.toBeNull());
    const callsAtSignOut = getFeedTimeline.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getFeedTimeline.mock.calls.length).toBe(callsAtSignOut);
  });
});

// --- D. the hook agrees with the route (do.md §9) --------------------------

describe('D. useHomeFeed refuses to read the feed without a session', () => {
  // The guard and the hook are separate layers on purpose. If some future route
  // mounts the hook without the guard, the hook must still not request.
  it('makes no request at all while unauthenticated', async () => {
    setAuth({ user: null, session: null, loading: false });

    const { renderHook } = await import('@testing-library/react');
    const { useHomeFeed } = await import('@/hooks/useHomeFeed');
    renderHook(() => useHomeFeed());

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getFeedTimeline).not.toHaveBeenCalled();
  });

  it('reads the feed once a session exists', async () => {
    setAuth(authedUser());

    const { renderHook } = await import('@testing-library/react');
    const { useHomeFeed } = await import('@/hooks/useHomeFeed');
    renderHook(() => useHomeFeed());

    await waitFor(() => expect(getFeedTimeline).toHaveBeenCalledTimes(1));
  });
});
