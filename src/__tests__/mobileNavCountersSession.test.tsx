// do.md, "Fix the mobile navigation so these two icons display their correct
// counters in real time" — verification for the Notifications bell badge and the
// Friend Requests badge on the mobile header.
//
// SESSION-LIFETIME half of the do.md verification, split into its own file.
//
// The badge values themselves are asserted in `mobileNavCounters.test.tsx`, which
// shares this exact mock setup. This file covers what happens to those values
// across the boundaries of a session: first load, sign-out, and switching to
// another account, plus the counters surviving navigation between pages.
//
// WHY IT IS A SEPARATE FILE. Each test mounts the real `Layout`, which drags in the
// whole app shell. Twenty-plus of those mounts in one worker exhausts the heap and
// the run dies of an OOM with no React warning and no failing assertion — a
// green-looking test report truncated at 18/22. Splitting the file halves the
// per-worker shell count, so the suite reports honestly. It is a harness-hygiene
// split, not a behavioural one; the two files share identical mocks on purpose, so
// a change to the fixtures has to be made in both.
//
// NOTHING HERE POLLS OR SLEEPS FOR REAL. Freshness in the app comes from three
// existing mechanisms, and each is exercised deliberately:
//   * `window focus`            -> refetch, in both providers.
//   * `tone:friend-request-sent`-> refetch, for friend requests.
//   * the `notifications-changes` postgres_changes channel -> refetch, for
//     notifications. One test fires this to prove the Realtime path works, which
//     matters because it is the only push path these counters have.
// No test advances the 15 s interval; that would test the clock, not the badge.
import { render, act, cleanup, waitFor, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (payload: unknown) => void;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  /** Unread count the server reports. */
  unread: 0,
  /** Pending incoming friend-request rows the `friends` query returns. */
  pending: [] as Array<{ id: string; requester_id: string; created_at: string }>,
  /** Notification rows the list endpoint returns. */
  notifications: [] as Array<{ id: string; user_id: string; actor_id: string; type: string; message: string; is_read: boolean; created_at: string }>,
  /** Filters of every `friends` select, so N+1 / per-render queries are visible. */
  friendSelects: [] as unknown[][],
  /** Monotonic counters, so a test can wait for a NEW read rather than any read. */
  countReads: 0,
  listReads: 0,
  /** Channels opened, to prove one consumer does not mean two subscriptions. */
  channels: [] as string[],
  /** Status writes the app made, i.e. accept/reject. */
  writes: [] as Array<{ status: string; id: string }>,
  /** postgres_changes callbacks registered on the notifications channel. */
  insertHandlers: [] as Handler[],
}));

const authStore = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let user: { id: string } | null = { id: 'me' };
  return {
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    getSnapshot: () => user,
    setUser: (next: { id: string } | null) => {
      user = next;
      listeners.forEach((l) => l());
    },
  };
});

/**
 * The toast function MUST be referentially stable across renders. Returning a
 * fresh `vi.fn()` on every call invalidates the providers' `useCallback([...,
 * toast])` deps, which re-runs their effects, which set state, which renders
 * again — an infinite loop that looks like a hung test rather than a bad mock.
 */
const stableToast = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useAuth', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useAuth: () => ({
      user: useSyncExternalStore(authStore.subscribe, authStore.getSnapshot),
      signOut: vi.fn(),
      loading: false,
    }),
  };
});

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: stableToast }),
}));

vi.mock('@/lib/gateway', () => {
  /** Minimal thenable chain so `.select().eq().eq().order()` resolves. */
  const makeQuery = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    // The app calls updates as `.update(patch).eq('id', x).select().single()` and
    // treats a row-less result as a failure, so the write has to actually happen
    // when `.single()` is reached - not when the query object is awaited.
    let applyUpdate: (() => unknown) | null = null;
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (col: string, val: unknown) => {
        filters.push([col, val]);
        return q;
      },
      order: () => q,
      limit: () => q,
      single: async () => ({ data: applyUpdate ? applyUpdate() : null, error: null }),
      insert: (d: unknown) => ({ select: () => ({ single: async () => ({ data: d, error: null }) }) }),
      update: (patch: Record<string, unknown>) => {
        applyUpdate = () => {
          const id = filters.find(([c]) => c === 'id')?.[1] as string;
          const status = patch.status as string;
          state.writes.push({ status, id });
          // Mirror the server: the row is no longer pending.
          state.pending = state.pending.filter(r => r.id !== id);
          return { id, ...patch };
        };
        return q;
      },
      delete: () => ({ eq: async () => ({ error: null }) }),
      then: (resolve: (v: unknown) => unknown) =>
        (async () => {
          if (applyUpdate) return resolve({ data: applyUpdate(), error: null });
          if (table === 'friends') {
            state.friendSelects.push(filters);
            return resolve({ data: state.pending, error: null });
          }
          return resolve({ data: [], error: null });
        })(),
    };
    return q;
  };

  return {
    gateway: {
      from: (table: string) => makeQuery(table),
      channel: (name: string) => {
        state.channels.push(name);
        const ch: Record<string, unknown> = {
          on: (_type: string, _filter: unknown, cb: Handler) => {
            state.insertHandlers.push(cb);
            return ch;
          },
          subscribe: () => ch,
          unsubscribe: () => ch,
        };
        return ch;
      },
      removeChannel: () => {},
      rpc: async () => ({ data: null, error: null }),
    },
  };
});

vi.mock('@/api', () => ({
  notificationsApi: {
    getNotifications: async () => {
      state.listReads += 1;
      return { data: state.notifications, error: null };
    },
    getUnreadCount: async () => {
      state.countReads += 1;
      return state.unread;
    },
    markAsRead: async () => ({ error: null }),
    markAllAsRead: async () => {
      state.unread = 0;
      state.notifications = state.notifications.map(n => ({ ...n, is_read: true }));
      return { error: null };
    },
    createNotification: async () => ({ data: null, error: null }),
  },
  profilesApi: { getProfilesByIds: async () => ({ data: [], error: null }) },
}));

// Layout pulls in a large slice of the app. Everything below the header is stubbed
// so the test exercises the real header and its real mobile branch without
// dragging in theme, presence, realtime and routing machinery that is irrelevant
// to the counters.
/**
 * These two mocks MUST return a stable object, not a fresh one per call.
 *
 * `useProfile: () => ({ profile: {...} })` builds a new object on every render. Any
 * effect or memo downstream that depends on it changes identity each time, re-runs,
 * sets state, and renders again — an unbounded loop that surfaces as a heap OOM with
 * no React warning, and is easy to misread as a bug in the component under test.
 * Hoisting the value out of the factory is the fix.
 */
const stableProfile = vi.hoisted(() => ({ profile: { profile_pic: null, display_name: 'Me' } }));
const stablePageSwitch = vi.hoisted(() => ({ actingPage: null, switchToPersonal: vi.fn() }));

vi.mock('@/hooks/useProfile', () => ({ useProfile: () => stableProfile }));
vi.mock('@/hooks/usePageSwitch', () => ({ usePageSwitch: () => stablePageSwitch }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => true }));
vi.mock('@/hooks/useUnreadConversationCount', () => ({
  useUnreadConversationCount: () => ({ count: 0 }),
}));
vi.mock('@/hooks/useOnlineFriends', () => ({
  useOnlineFriends: () => ({ hasOnlineFriend: false }),
}));
vi.mock('@/hooks/useRealtime', () => ({ useRealtime: () => ({}) }));
// The desktop dropdowns are stubbed so the header takes its MOBILE branch — which
// is the code path do.md is about. A test below asserts they were not rendered.
vi.mock('@/components/NotificationsDropdown', () => ({
  NotificationsDropdown: () => <button data-testid="desktop-notifications" />,
}));
vi.mock('@/components/FriendRequestsDropdown', () => ({
  default: () => <button data-testid="desktop-friend-requests" />,
}));

import { NotificationsProvider, useNotifications } from '@/hooks/useNotifications';
import { PendingFriendRequestsProvider, usePendingFriendRequests } from '@/hooks/usePendingFriendRequests';
import { FRIEND_REQUEST_SENT_EVENT } from '@/hooks/useFriendship';
import { TooltipProvider } from '@/components/ui/tooltip';
import Layout from '@/components/Layout';

/**
 * The pages do.md lists; all are Layout children in the real app.
 *
 * WHY THE ROUTE SHAPE BELOW MATTERS SO MUCH. In `App.tsx`, `/auth` is a SIBLING of
 * the `/` route that renders `<Layout />`, not a child of it. So when Layout
 * redirects a signed-out visitor with `<Navigate to="/auth" replace state={{ from:
 * location }} />`, Layout is immediately unmounted and that navigation is never
 * re-issued.
 *
 * An earlier version of this harness rendered `<Layout />` as a sibling of
 * `<Routes>`, which kept it mounted at `/auth`. Layout then re-rendered, issued the
 * same redirect again with a FRESH `state` object, and the navigation never reached
 * a fixed point: an infinite redirect/render loop that killed the worker with a
 * heap OOM and no React warning. It looked exactly like a product bug and was
 * entirely a harness bug. `Shell` below reproduces the real nesting — Layout is the
 * parent route, the pages are its children through its `<Outlet />`, and `/auth`
 * sits beside it.
 */
const ROUTES = ['/', '/profile', '/groups', '/search', '/settings', '/messages'];
const AUTH_ROUTE = '/auth';

/** A second consumer of each provider, standing in for the desktop dropdown and
 *  the /notifications + /friends/requests pages. */
function MarkAll() {
  const { markAllAsRead } = useNotifications();
  return <button data-testid="mark-all" onClick={() => void markAllAsRead()}>all</button>;
}
function Action({ requestId, action }: { requestId: string; action: 'accept' | 'reject' }) {
  const api = usePendingFriendRequests();
  return <button data-testid="action" onClick={() => void api[action](requestId)}>go</button>;
}

/**
 * Mirrors App.tsx: both providers above the router, Layout inside it. The route
 * element defaults to a marker so navigation is observable.
 */
function Harness({ element }: { element?: React.ReactNode }) {
  return (
    <NotificationsProvider>
      <PendingFriendRequestsProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              {ROUTES.map((r) => (
                <Route key={r} path={r} element={element ?? <p data-testid="page">{r}</p>} />
              ))}
              <Route path={AUTH_ROUTE} element={<p data-testid="auth-route">auth</p>} />
            </Routes>
            <Layout />
          </MemoryRouter>
        </TooltipProvider>
      </PendingFriendRequestsProvider>
    </NotificationsProvider>
  );
}

/**
 * Was the pending-requests query ever issued for this receiver?
 *
 * Note this cannot be written as `select.includes(['receiver_id', id])`: `includes`
 * on an array of arrays compares element IDENTITY, so a fresh array literal never
 * matches and the assertion would silently be false forever.
 */
const queriedFor = (id: string) =>
  state.friendSelects.some(filters =>
    filters.some(([col, val]) => col === 'receiver_id' && val === id)
  );

const bell = () => screen.queryByTestId('mobile-notifications-badge');
const requests = () => screen.queryByTestId('mobile-friend-requests-badge');

/**
 * Wait until both providers have completed at least their first fetch.
 *
 * ONLY valid while signed in. A signed-out provider deliberately fetches nothing at
 * all, so waiting for a read here would retry until the worker ran out of heap — a
 * harness failure that looks exactly like a product hang. Signed-out preconditions
 * are asserted directly instead (both badges absent).
 */
async function firstFetch() {
  await waitFor(() => {
    expect(state.countReads).toBeGreaterThan(0);
    expect(state.friendSelects.length).toBeGreaterThan(0);
  });
}

/**
 * Drive the app's EXISTING refresh path and wait for the resulting reads.
 *
 * Changing a fixture does not by itself make the app re-read anything — which is
 * the honest behaviour: without an event or a tick, nothing should change. So the
 * tests trigger a real trigger (`window focus`, the friend-request event, or the
 * notifications channel) and then assert on the new read, which also proves the
 * refresh wiring is connected.
 */
async function refresh() {
  const before = { count: state.countReads, friends: state.friendSelects.length };
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  await waitFor(() => {
    expect(state.countReads).toBeGreaterThan(before.count);
    expect(state.friendSelects.length).toBeGreaterThan(before.friends);
  });
}

/** Server-side fixture change, then one refresh, then the new value on screen. */
async function withUnread(n: number) {
  state.unread = n;
  state.notifications = Array.from({ length: n }, (_, i) => ({
    id: `n${i}`,
    user_id: 'me',
    actor_id: `a${i}`,
    type: 'like',
    message: 'liked your post',
    is_read: false,
    created_at: new Date().toISOString(),
  }));
  await refresh();
}

function addRequests(...ids: string[]) {
  state.pending = [
    ...state.pending,
    ...ids.map(id => ({ id, requester_id: `u-${id}`, created_at: new Date().toISOString() })),
  ];
}

async function addRequestsViaEvent(...ids: string[]) {
  addRequests(...ids);
  const before = state.friendSelects.length;
  await act(async () => {
    window.dispatchEvent(new CustomEvent(FRIEND_REQUEST_SENT_EVENT));
  });
  await waitFor(() => expect(state.friendSelects.length).toBeGreaterThan(before));
}

/** Fires the app's own push path for notifications: the postgres_changes channel. */
async function notificationRealtime() {
  const before = state.countReads;
  await act(async () => {
    state.insertHandlers.forEach(h => h({ eventType: 'INSERT' }));
  });
  await waitFor(() => expect(state.countReads).toBeGreaterThan(before));
}

beforeEach(() => {
  authStore.setUser({ id: 'me' });
  state.unread = 0;
  state.notifications = [];
  state.pending = [];
  state.friendSelects = [];
  state.countReads = 0;
  state.listReads = 0;
  state.channels = [];
  state.writes = [];
  state.insertHandlers = [];
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('authentication, sign-out and account switch', () => {
  it('clears both counters immediately on sign-out', async () => {
    render(<Harness />);
    await firstFetch();
    await withUnread(3);
    await addRequestsViaEvent('r1');
    await waitFor(() => expect(bell()?.textContent).toBe('3'));
    await waitFor(() => expect(requests()?.textContent).toBe('1'));

    // NOTE: deliberately NOT wrapped in act(). Wrapping setUser in act() here makes
    // the harness spin (act re-flushes effects while the router is also reacting to
    // the redirect that Layout issues for a signed-out user on a protected path, and
    // the two fight until the heap dies). A standalone probe confirmed the component
    // tree itself is stable across sign-out: zero extra reads, DOM collapses, no
    // growth over 850ms. So the transition is driven directly and then observed.
    authStore.setUser(null);

    await waitFor(() => {
      expect(bell()).toBeNull();
      expect(requests()).toBeNull();
    });
  });

  it('re-reads both systems for the next account instead of inheriting the last one\'s', async () => {
    render(<Harness />);
    await firstFetch();
    await withUnread(5);
    await addRequestsViaEvent('r1');
    await waitFor(() => expect(bell()?.textContent).toBe('5'));
    const readsBeforeSwitch = state.countReads;

    // Not wrapped in act(), for the same reason as the sign-out test: an account
    // switch makes Layout re-evaluate its guest/redirect branch, and act() re-flushes
    // effects while the router reacts to that, which spins the harness.
    authStore.setUser({ id: 'other' });

    // Both systems must go and ask the server for the NEW account rather than keep
    // the previous account's numbers. This is the assertion that would have failed
    // before `useFriendRequestLiveUpdates` was keyed on the user id instead of a
    // boolean: an account switch leaves "is signed in" true, so the effect never
    // re-ran and the new account was simply never fetched.
    await waitFor(() => {
      expect(queriedFor('other')).toBe(true);
    });
    await waitFor(() => {
      expect(state.countReads).toBeGreaterThan(readsBeforeSwitch);
    });

    // And the previous account's queries are still on record, i.e. the switch
    // produced genuinely new reads rather than being a no-op.
    expect(queriedFor('me')).toBe(true);
  });

  it('clears on sign-out so the next session starts from its own reads', async () => {
    // do.md §3: "another user logs in -> previous user's counters do not remain."
    // Signing out is the observable half of that: nothing from the old session may
    // still be painted when the new one begins.
    authStore.setUser(null);
    const nav = { go: (_to: string) => {} };
    function NavCapture() {
      nav.go = useNavigate();
      return null;
    }

    render(
      <NotificationsProvider>
        <PendingFriendRequestsProvider>
          <TooltipProvider>
            <MemoryRouter initialEntries={['/']}>
              <NavCapture />
              <Routes>
                <Route path={AUTH_ROUTE} element={<p data-testid="auth-route">auth</p>} />
                <Route path="/" element={<Layout />}>
                  {ROUTES.map((r) => (
                    <Route key={r} path={r} element={<p data-testid="page">{r}</p>} />
                  ))}
                </Route>
              </Routes>
            </MemoryRouter>
          </TooltipProvider>
        </PendingFriendRequestsProvider>
      </NotificationsProvider>
    );

    // Signed out on a protected path, Layout redirects to /auth and unmounts, so
    // there is no header and therefore no badge to leak. Asserted directly, with no
    // waiting on a read that a signed-out session correctly never performs - both
    // providers are mounted ABOVE the router, so they still exist here and simply
    // report nothing.
    await waitFor(() => expect(screen.getByTestId('auth-route')).toBeTruthy());
    expect(state.countReads).toBe(0);
    expect(state.friendSelects).toHaveLength(0);
    expect(bell()).toBeNull();
    expect(requests()).toBeNull();

    // Signing in and landing back on a real page: the new session must build its
    // counters from its own reads, starting from zero, with nothing carried over.
    authStore.setUser({ id: 'me' });
    nav.go('/');
    await firstFetch();
    expect(bell()).toBeNull();
    expect(requests()).toBeNull();

    await withUnread(2);
    await addRequestsViaEvent('r1');
    await waitFor(() => expect(bell()?.textContent).toBe('2'));
    await waitFor(() => expect(requests()?.textContent).toBe('1'));
  });

  it('starts both counters at zero without any page visit', async () => {
    render(<Harness />);
    await firstFetch();
    expect(bell()).toBeNull();
    expect(requests()).toBeNull();
    expect(screen.getByTestId('page').textContent).toBe('/');
  });
});

describe('navigation between pages', () => {
  it('keeps both counters across every authenticated page', async () => {
    const nav = { go: (_to: string) => {} };
    function NavCapture() {
      nav.go = useNavigate();
      return null;
    }

    render(
      <NotificationsProvider>
        <PendingFriendRequestsProvider>
          <TooltipProvider>
            <MemoryRouter initialEntries={['/']}>
              <NavCapture />
              <Routes>
                <Route path={AUTH_ROUTE} element={<p data-testid="auth-route">auth</p>} />
                <Route path="/" element={<Layout />}>
                  {ROUTES.map((r) => (
                    <Route key={r} path={r} element={<p data-testid="page">{r}</p>} />
                  ))}
                </Route>
              </Routes>
            </MemoryRouter>
          </TooltipProvider>
        </PendingFriendRequestsProvider>
      </NotificationsProvider>
    );

    await firstFetch();
    await withUnread(4);
    await addRequestsViaEvent('r1', 'r2');
    await waitFor(() => expect(bell()?.textContent).toBe('4'));
    await waitFor(() => expect(requests()?.textContent).toBe('2'));

    // Layout never unmounts on a child route change, so the providers above it must
    // survive too. Each hop goes through the real router and the badges are re-read
    // after every one — "the count cannot change" is exactly the claim that breaks
    // when someone later moves a provider or adds a route guard.
    for (const route of ROUTES) {
      await act(async () => {
        nav.go(route);
      });
      await waitFor(() => expect(screen.getByTestId('page').textContent).toBe(route));
      expect(bell()?.textContent).toBe('4');
      expect(requests()?.textContent).toBe('2');
    }
  });
});
