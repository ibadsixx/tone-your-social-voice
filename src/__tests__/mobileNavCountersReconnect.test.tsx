// do.md, "Fix the mobile navigation so these two icons display their correct
// counters in real time" — the SSE RECONNECT half of the verification, kept in
// its own file for worker-heap reasons (see the note at the bottom).
//
// do.md §"Authentication and logout", item 4: "Realtime reconnects -> counters
// synchronize correctly."
//
// WHY THIS NEEDS ITS OWN SUITE. The gateway caps its SSE functions at 300 s, so on
// any long-lived session the stream drops and reconnects routinely. Nothing that
// happened during the gap was delivered to anybody, so a counter that does not
// re-read on reconnect is simply wrong until some unrelated event nudges it — and
// on a phone, where an app switch or a backgrounded tab pauses the 15 s interval,
// "unrelated event" can be a long time. These tests fire the app's own reconnect
// hook and assert both counters return to the server truth with no reload, no
// focus event and no interval tick.
//
// The counter-independence proof that rides along here is the anti-duplication
// one: the two providers must OBSERVE the shared `user:<myId>` stream through
// `getMessageRealtime` (which does not ref-count) rather than SUBSCRIBE to it with
// `subscribeToMessages` (which does). Otherwise a badge could hold a stream open
// on its own, which is exactly the "duplicate Realtime subscriptions" and "one
// subscription per navigation icon" that do.md forbids.
//
// Split from `mobileNavCountersSession.test.tsx` for the same reason the other two
// were split: this worker exhausts its heap at around eight Layout mounts, and the
// failure mode is a bare "Worker exited unexpectedly" with no React warning, which
// is indistinguishable from a product hang.

// The badge values themselves are asserted in `mobileNavCounters.test.tsx` and the
// session-lifetime behaviour in `mobileNavCountersSession.test.tsx`. All three
// files share this exact mock setup, so a fixture change has to be made in each.
//
// NOTHING HERE POLLS OR SLEEPS FOR REAL. These tests drive the app's own reconnect
// hook, so what is being verified is the wiring and the resync, not the clock: no
// test advances the 15 s interval, because that would test the timer rather than the
// badge.
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
  /** SSE streams the app opened, i.e. `UserRealtimeChannel.start()` calls. */
  connectionsStarted: 0,
  /** `subscribeToMessages` calls — the REF-COUNTED consumer API. */
  consumerSubscribes: 0,
  /** `getMessageRealtime` calls — the observer API, which does not ref-count. */
  realtimeObservers: 0,
  /** Callbacks registered through `channel.onReconnect`, i.e. the resync hooks. */
  reconnectHandlers: [] as Array<() => void>,
}));

/**
 * A faithful-enough stand-in for `src/lib/messageRealtime.ts`.
 *
 * The real module keeps ONE shared, lazily-created `UserRealtimeChannel` per user
 * and hands the same object to every consumer; `subscribeToMessages` increments a
 * ref count and `getMessageRealtime` deliberately does not. That asymmetry is the
 * whole point of this mock: do.md forbids duplicate subscriptions, so the counters
 * must observe the existing stream rather than add a consumer to it, and the only
 * way to prove that is to reproduce the ref counting and then count it.
 */
vi.mock('@/lib/messageRealtime', () => {
  let shared: { userId: string; onReconnect: (cb: () => void) => () => void } | null = null;
  const makeChannel = (userId: string) => ({
    userId,
    onReconnect: (cb: () => void) => {
      state.reconnectHandlers.push(cb);
      return () => {
        state.reconnectHandlers = state.reconnectHandlers.filter(h => h !== cb);
      };
    },
  });
  return {
    getMessageRealtime: (userId: string) => {
      if (!userId) return null;
      state.realtimeObservers += 1;
      if (!shared || shared.userId !== userId) {
        shared = makeChannel(userId);
        state.connectionsStarted += 1;
      }
      return shared;
    },
    subscribeToMessages: () => {
      state.consumerSubscribes += 1;
      return () => {};
    },
  };
});

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

/**
 * Fires every registered `onReconnect` callback, i.e. what the gateway's SSE hub
 * does when the stream is re-established after a drop.
 *
 * This is the one path that matters most for correctness and is least visible: the
 * gateway caps its SSE functions at 300 s, so on any long-lived session the stream
 * drops and reconnects routinely, and nothing that happened during the gap was
 * delivered to anybody. A counter that does not re-read on reconnect is simply
 * wrong until some unrelated event nudges it.
 */
async function reconnectSse() {
  expect(state.reconnectHandlers.length).toBeGreaterThan(0);
  const before = { counts: state.countReads, friends: state.friendSelects.length };
  await act(async () => {
    state.reconnectHandlers.forEach(h => h());
  });
  await waitFor(() => {
    expect(state.countReads).toBeGreaterThan(before.counts);
    expect(state.friendSelects.length).toBeGreaterThan(before.friends);
  });
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
  // NOT reset, deliberately. `connectionsStarted` is cumulative for the whole file,
  // so "one stream" is asserted as an absolute 1 across every mount in it: if any
  // provider or badge ever opened its own connection, this number would climb and the
  // assertion would fail. (In `mobileNavCountersSession.test.tsx` the equivalent count
  // legitimately reaches 2, because that file signs in as a second user and the real
  // module — like this mock — starts a fresh stream for a different user id and stops
  // the previous one. That is one stream per IDENTITY over time, not a leak.)
  state.consumerSubscribes = 0;
  state.realtimeObservers = 0;
  state.reconnectHandlers = [];
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * Fires the browser event a phone sends when the user switches back into the app.
 *
 * `document.hidden` is a read-only accessor in jsdom, so it is redefined here
 * rather than assigned; the assertion is that the app checks it at all, because a
 * provider that refetched on *every* visibilitychange — including the one that hid
 * the tab — would burn a request on the way out for no reason.
 */
async function returnToApp() {
  const before = { counts: state.countReads, friends: state.friendSelects.length };
  await act(async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await waitFor(() => {
    expect(state.countReads).toBeGreaterThan(before.counts);
    expect(state.friendSelects.length).toBeGreaterThan(before.friends);
  });
}

describe('realtime reconnect (do.md §"Authentication and logout", item 4)', () => {
  it('re-reads both counters when the SSE stream reconnects', async () => {
    render(<Harness />);
    await firstFetch();

    // While the stream is down nothing can be delivered, so the values on screen go
    // stale silently — which is exactly what the reconnect has to repair.
    state.unread = 5;
    state.notifications = [];
    state.pending = [
      { id: 'r1', requester_id: 'u1', created_at: new Date().toISOString() },
      { id: 'r2', requester_id: 'u2', created_at: new Date().toISOString() },
      { id: 'r3', requester_id: 'u3', created_at: new Date().toISOString() },
    ];

    await reconnectSse();

    // The counts on screen were 0 before the reconnect and must now be the server
    // truth, with no page reload, no focus event and no interval tick.
    await waitFor(() => expect(bell()?.textContent).toBe('5'));
    await waitFor(() => expect(requests()?.textContent).toBe('3'));
  });

  it('survives repeated reconnects and never drifts from the server value', async () => {
    render(<Harness />);
    await firstFetch();
    await withUnread(1);
    await addRequestsViaEvent('r1');
    await waitFor(() => expect(bell()?.textContent).toBe('1'));

    // Two drops in a row, with the server value changing between them. A patch-based
    // resync (e.g. re-applying the last known delta) would get this wrong; a
    // re-read cannot.
    state.unread = 2;
    await reconnectSse();
    await waitFor(() => expect(bell()?.textContent).toBe('2'));

    state.unread = 0;
    await reconnectSse();
    await waitFor(() => expect(bell()).toBeNull());
  });

  it('observes the existing shared stream instead of adding a subscription', async () => {
    // do.md forbids "duplicate Realtime subscriptions" and "one subscription per
    // navigation icon". The counters must therefore NOT go through
    // `subscribeToMessages`, which increments the shared channel's ref count: two
    // providers taking a ref each would let a badge keep a stream alive on its own,
    // and would mean a nav icon owning a subscription. They use
    // `getMessageRealtime`, which hands back the same object WITHOUT counting, so
    // mounting and unmounting them leaves the stream's lifecycle untouched.
    render(<Harness />);
    await firstFetch();

    // Both providers observe the shared stream...
    expect(state.reconnectHandlers.length).toBe(2);
    // ...neither of them took a ref-counted subscription...
    expect(state.consumerSubscribes).toBe(0);
    // ...and exactly one stream exists for this identity, not one per provider and
    // not one per badge. `connectionsStarted` is cumulative across the whole file, so
    // this stays 1 no matter how many times a later test mounts the providers again.
    expect(state.connectionsStarted).toBe(1);
  });

  it('unregisters the resync hook on sign-out, so a signed-out session reads nothing', async () => {
    render(<Harness />);
    await firstFetch();
    expect(state.reconnectHandlers.length).toBe(2);
    const countsAtSignOut = state.countReads;
    const friendsAtSignOut = state.friendSelects.length;

    // NOT wrapped in act(), for the same reason the session suite does it that way:
    // act() re-flushes effects while the router is also reacting to the redirect
    // Layout issues for a signed-out user on a protected path, and the two fight until
    // the worker dies of a heap OOM with no React warning.
    authStore.setUser(null);

    // Both providers saw the session end and dropped their reconnect hooks, so
    // nothing is left holding a resync against a session that no longer exists.
    await waitFor(() => expect(state.reconnectHandlers.length).toBe(0));

    // And the signed-out session reads nothing at all: the counts did not move again
    // after the sign-out, which is also what stops the previous account's numbers
    // reappearing when the stream next reconnects. A standalone probe confirmed this
    // is stable rather than merely slow — zero further reads over 300 ms, with the DOM
    // collapsed and no growth.
    //
    // NOTE: there is deliberately no `act()` wrapping anything after the sign-out. It
    // is not needed (nothing below mutates React state) and it is actively harmful
    // here: `act` re-flushes effects while the router is still reacting to the
    // redirect Layout issues for a signed-out user on a protected path, and the two
    // fight until the worker dies of a heap OOM with no React warning — the exact
    // failure this suite exists to avoid confusing with a product hang.
    expect(state.countReads).toBe(countsAtSignOut);
    expect(state.friendSelects.length).toBe(friendsAtSignOut);
    expect(bell()).toBeNull();
    expect(requests()).toBeNull();
  });
});

describe('returning to the app (the mobile case)', () => {
  it('re-reads the notifications count when the tab becomes visible again', async () => {
    render(<Harness />);
    await firstFetch();
    await withUnread(1);
    await waitFor(() => expect(bell()?.textContent).toBe('1'));

    // While the app is backgrounded on a phone the 15 s interval is gated off, so the
    // badge can only be as fresh as the moment the user left. `window focus` is not
    // dependable across app switches on mobile, which is why this provider also
    // listens for `visibilitychange`.
    state.unread = 4;
    await returnToApp();
    await waitFor(() => expect(bell()?.textContent).toBe('4'));
  });

  it('re-reads the pending requests when the tab becomes visible again', async () => {
    render(<Harness />);
    await firstFetch();
    addRequests('r1');
    await act(async () => {
      window.dispatchEvent(new CustomEvent(FRIEND_REQUEST_SENT_EVENT));
    });
    await waitFor(() => expect(requests()?.textContent).toBe('1'));

    // The friend-request side gets this for free from the ONE shared
    // `useFriendRequestLiveUpdates` interval's listener set — a second listener on an
    // existing listener set, not a second poll and not a second provider fetch path.
    addRequests('r2', 'r3');
    await returnToApp();
    await waitFor(() => expect(requests()?.textContent).toBe('3'));
  });
});
