// do.md "Fix the Messages unread notification badge" - the global navigation
// badge on the Messages icon.
//
// THE BUG. The badge value did not exist outside the Messages page. Unread
// state was computed inside `useConversations`, which is only mounted by the
// Messages page, the mini chat windows and a page detail - so on Home,
// Profile, Groups, Search and Settings nothing computed it, nothing received
// `message.created`, and the nav icon had nothing to render. The count that
// must appear there is not "unread messages" either; it is the number of
// CONVERSATIONS that contain at least one unread message, which is a property
// of a set, not a sum.
//
// WHAT IS ASSERTED HERE. The badge is driven by a global provider that holds
// one realtime subscription for the session and reconciles against the server
// aggregate, so the tests drive the two inputs it actually consumes - the
// server aggregate (`gateway.rpc('get_unread_conversation_ids')`) and the
// realtime/local events - and assert the number that reaches the icon:
//
//   1. Server truth: N conversations with unread -> badge N, and the set is
//      per-conversation, not per-message (5 unread in one chat is still 1).
//   2. Empty set -> badge hidden (0).
//   3. An incoming `message.created` for a conversation that was already
//      unread must NOT bump the badge (this is the "conversations not
//      messages" rule, and the double-count trap in a burst).
//   4. An incoming `message.created` for a new conversation bumps it, and the
//      server reconcile then confirms it.
//   5. Marking a conversation read removes it from the badge set
//      immediately, before any server round trip settles.
//   6. Logout clears the badge and unsubscribes; a later login for a different
//      user starts from that user's own server truth (no cross-user leak).
//   7. A server error keeps the last good value instead of blanking the badge.
//   8. The source is the Gateway only, via the single aggregate RPC - no
//      polling loop, no per-conversation fetch, no page-scoped `useConversations`.
//
// Structural assertions at the end pin the wiring that a behavioural test in
// this file cannot reach: the provider is mounted above the router, both nav
// icons read the same hook, and the existing mark-as-read funnel notifies it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Realtime plumbing is faked: the badge must not depend on a live stream. --
type Handler = (payload: unknown) => void;
const state = vi.hoisted(() => ({
  serverSet: [] as string[],
  serverError: null as { message: string } | null,
  rpcCalls: 0,
  created: [] as Handler[],
  reconnects: [] as Array<() => void>,
  unsubscribed: 0,
  listeners: [] as Array<(id: string) => void>,
}));

// A real store, not a mutable object: `useAuth` must actually re-render the
// provider when the signed-in user changes, which is the only way a logout or
// an account switch can be observed from a test at all.
const authStore = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let user: { id: string } | null = null;
  return {
    // Arrow functions throughout: these are handed to useSyncExternalStore as
    // bare references, so a `this`-based method would lose its receiver.
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

vi.mock('@/hooks/useAuth', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useAuth: () => ({ user: useSyncExternalStore(authStore.subscribe, authStore.getSnapshot) }),
  };
});

/** Swap the signed-in account and let React see it. */
async function setUser(user: { id: string } | null) {
  await act(async () => {
    authStore.setUser(user);
  });
}

// Named so `afterEach` can restore it: tests that need a delayed or failing
// aggregate read swap this function out and must put it back.
const defaultRpc = async (fn: string) => {
  if (fn !== 'get_unread_conversation_ids') {
    throw new Error(`unexpected rpc: ${fn}`);
  }
  state.rpcCalls++;
  if (state.serverError) return { data: null, error: state.serverError };
  return { data: state.serverSet, error: null };
};

vi.mock('@/lib/gateway', () => ({
  gateway: {
    rpc: (fn: string) => defaultRpc(fn),
  },
}));

vi.mock('@/lib/messageRealtime', () => ({
  subscribeToMessages: (_userId: string, event: string, cb: Handler) => {
    if (event === 'message.created') state.created.push(cb);
    return () => {
      state.unsubscribed++;
    };
  },
  getMessageRealtime: () => ({
    onReconnect: (cb: () => void) => {
      state.reconnects.push(cb);
      return () => {
        state.reconnects = state.reconnects.filter((r) => r !== cb);
      };
    },
  }),
}));

import { notifyConversationRead } from '@/lib/unreadBadgeBus';
import { UnreadBadgeProvider, useUnreadConversationCount } from '@/hooks/useUnreadConversationCount';

const A = 'conv-a';
const B = 'conv-b';
const C = 'conv-c';

function BadgeProbe({ testId = 'badge' }: { testId?: string }) {
  const { count } = useUnreadConversationCount();
  return <span data-testid={testId}>{count}</span>;
}

function renderBadge() {
  return render(
    <UnreadBadgeProvider>
      <BadgeProbe />
    </UnreadBadgeProvider>
  );
}

const count = () => Number(document.querySelector('[data-testid="badge"]')?.textContent ?? '-1');
const emitted = (conversationId: string) => state.created.forEach((h) => h({ conversationId }));
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
/** The provider debounces its server reconcile; push past that window. */
const reconcile = () => act(async () => { await new Promise((r) => setTimeout(r, 400)); });

beforeEach(() => {
  authStore.setUser({ id: 'me' });
  state.serverSet = [];
  state.serverError = null;
  state.rpcCalls = 0;
  state.created = [];
  state.reconnects = [];
  state.unsubscribed = 0;
  state.listeners = [];
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  // `@/lib/gateway` is mocked as a shared module object, so any rpc this file
  // swapped in would otherwise decide the answer for every later test.
  const { gateway } = await import('@/lib/gateway');
  (gateway as { rpc: unknown }).rpc = defaultRpc;
});

describe('global Messages unread badge', () => {
  it('starts at zero and never reads the server for a signed-out visitor', async () => {
    authStore.setUser(null);
    renderBadge();
    await settle();
    expect(count()).toBe(0);
    expect(state.rpcCalls).toBe(0);
  });

  it('shows the number of conversations with unread messages, not the number of messages', async () => {
    // A: 5 unread, B: 1 unread, C: 0 unread -> badge 2.
    state.serverSet = [A, B];
    renderBadge();
    await waitFor(() => expect(count()).toBe(2));
  });

  it('hides the badge when every conversation is read', async () => {
    state.serverSet = [];
    renderBadge();
    await waitFor(() => expect(count()).toBe(0));
  });

  it('does not bump for a second message in a conversation that is already unread', async () => {
    // A -> 5 unread, B -> 2 unread, badge 2. A sixth message in A is still 2.
    state.serverSet = [A, B];
    renderBadge();
    await waitFor(() => expect(count()).toBe(2));

    await act(async () => { emitted(A); });
    await settle();
    expect(count()).toBe(2);

    await reconcile();
    expect(count()).toBe(2);
  });

  it('bumps for a new conversation and survives the server reconcile', async () => {
    // New conversation / message request arriving while on Home.
    state.serverSet = [A, B];
    renderBadge();
    await waitFor(() => expect(count()).toBe(2));

    await act(async () => { emitted(C); });
    await settle();
    expect(count()).toBe(3);

    // The server has now recorded C's unread message: the badge is confirmed,
    // not merely optimistic.
    state.serverSet = [A, B, C];
    await reconcile();
    expect(count()).toBe(3);
  });

  it('collapses a burst of messages in one conversation into a single increment', async () => {
    state.serverSet = [A];
    renderBadge();
    await waitFor(() => expect(count()).toBe(1));

    await act(async () => { emitted(C); emitted(C); emitted(C); });
    await settle();
    expect(count()).toBe(2);

    state.serverSet = [A, C];
    await reconcile();
    expect(count()).toBe(2);
  });

  it('decrements immediately when a conversation is marked read', async () => {
    state.serverSet = [A, B, C];
    renderBadge();
    await waitFor(() => expect(count()).toBe(3));

    // The local read must not wait for the server round trip: the sender
    // reading the open conversation is the most common decrement there is.
    await act(async () => { notifyConversationRead(B); });
    expect(count()).toBe(2);

    // ...and the reconcile that follows confirms it, with the server agreeing.
    state.serverSet = [A, C];
    await reconcile();
    expect(count()).toBe(2);
  });

  it('leaves the badge alone when a conversation with no unread is marked read', async () => {
    state.serverSet = [A];
    renderBadge();
    await waitFor(() => expect(count()).toBe(1));

    await act(async () => { notifyConversationRead(B); });
    expect(count()).toBe(1);
    await reconcile();
    expect(count()).toBe(1);
  });

  it('clears on logout and starts from the next user on login', async () => {
    state.serverSet = [A, B, C];
    const { unmount } = renderBadge();
    await waitFor(() => expect(count()).toBe(3));

    await setUser(null);
    await waitFor(() => expect(count()).toBe(0));
    // The realtime subscription is dropped, not merely ignored.
    expect(state.unsubscribed).toBeGreaterThan(0);

    // A different account must never inherit the first one's badge: the old set
    // is gone before the new one is fetched, and only the new user's server
    // truth lands.
    state.serverSet = [B];
    await setUser({ id: 'user-2' });
    await waitFor(() => expect(count()).toBe(1));
    unmount();
  });

  it('keeps the last good value when the aggregate read fails', async () => {
    state.serverSet = [A, B];
    renderBadge();
    await waitFor(() => expect(count()).toBe(2));

    state.serverError = { message: 'gateway down' };
    await act(async () => { emitted(C); });
    await settle();
    // Optimistic add shows, but the failed reconcile must not blank the badge
    // the user is already looking at.
    await reconcile();
    expect(count()).toBeGreaterThan(0);
  });

  it('discards a slow response from a previous account instead of showing it', async () => {
    // The first aggregate read is held open. It was issued for user-1; by the
    // time it answers, user-1 has signed out and user-2 is signed in, so its
    // answer belongs to nobody and must not be painted anywhere.
    const { gateway } = await import('@/lib/gateway');
    let releaseFirst: ((v: unknown) => void) | null = null;
    let call = 0;

    (gateway as { rpc: unknown }).rpc = async (fn: string) => {
      if (fn !== 'get_unread_conversation_ids') return { data: null, error: null };
      call += 1;
      if (call === 1) {
        state.serverSet = [A, B, C]; // user-1's unread set
        return new Promise((resolve) => {
          releaseFirst = resolve;
        });
      }
      state.serverSet = [B]; // user-2's unread set
      return defaultRpc(fn);
    };

    state.serverSet = [A, B, C];
    renderBadge();
    await settle();
    expect(call).toBe(1);

    await setUser(null);
    await setUser({ id: 'user-2' });
    await waitFor(() => expect(count()).toBe(1));

    // The stale answer lands now; it must be dropped, not applied.
    releaseFirst?.({ data: [A, B, C], error: null });
    await settle();
    expect(count()).toBe(1);
  });

  it('reconciles on an SSE reconnect, which is how a dropped stream heals', async () => {
    state.serverSet = [A];
    renderBadge();
    await waitFor(() => expect(count()).toBe(1));

    // Messages that arrived while the stream was down.
    state.serverSet = [A, B, C];
    expect(state.reconnects.length).toBeGreaterThan(0);
    await act(async () => { state.reconnects.forEach((r) => r()); });
    await settle();
    expect(count()).toBe(3);
  });
});

// --- Wiring: the parts a behavioural test above cannot reach -----------------
describe('unread badge wiring', () => {
  const SRC = join(__dirname, '..');
  const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

  it('is mounted above the router, next to the session-scoped presence beat', () => {
    const app = read('App.tsx');
    expect(app).toMatch(/<UnreadBadgeProvider>/);
    // Above the router: the provider must wrap <Routes>, not sit inside a page.
    expect(app.indexOf('<UnreadBadgeProvider>')).toBeLessThan(app.indexOf('<Routes>'));
    expect(app.indexOf('</UnreadBadgeProvider>')).toBeGreaterThan(app.indexOf('</Routes>'));
  });

  it('drives BOTH Messages icons from the same global count', () => {
    const layout = read('components/Layout.tsx');
    const mobile = read('components/MobileNav.tsx');
    for (const [name, src] of [['sidebar', layout], ['mobile', mobile]] as const) {
      expect(src).toMatch(/useUnreadConversationCount\(\)/);
      // The badge is tied to the Messages entry only.
      expect(src).toMatch(/Messages'/);
    }
  });

  it('caps the badge at 9+ and reuses the existing badge component', () => {
    for (const rel of ['components/Layout.tsx', 'components/MobileNav.tsx']) {
      const src = read(rel);
      expect(src).toMatch(/<Badge/);
      expect(src).toMatch(/'9\+'/);
    }
  });

  it('reads the badge from the Gateway aggregate, never from raw message tables', () => {
    const src = read('hooks/useUnreadConversationCount.tsx');
    expect(src).toMatch(/get_unread_conversation_ids/);
    expect(src).not.toMatch(/from\('messages'\)/);
    expect(src).not.toMatch(/from\('message_reads'\)/);
    expect(src).not.toMatch(/setInterval/);
  });

  it('reuses the existing shared realtime subscription instead of a new stream', () => {
    const src = read('hooks/useUnreadConversationCount.tsx');
    expect(src).toMatch(/subscribeToMessages\(userId, 'message\.created'/);
  });

  it('is told by the single mark-as-read funnel, not by a second read path', () => {
    const src = read('hooks/useConversations.ts');
    expect(src).toMatch(/notifyConversationRead\(conversationId\)/);
  });
});
