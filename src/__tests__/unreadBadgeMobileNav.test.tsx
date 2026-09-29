// do.md, "Mobile-specific verification": the badge must remain visible on the
// mobile Messages item while navigating between authenticated pages.
//
// The nav never unmounts on a Layout-child route change, so the count cannot
// change either -- but "cannot" is exactly the kind of claim that breaks when
// someone later moves a provider, adds a route guard, or splits the shell. This
// drives real route changes through a real router and re-reads the badge after
// each one, so the invariant is measured rather than assumed.
import { render, act, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (payload: unknown) => void;
const state = vi.hoisted(() => ({
  serverSet: [] as string[],
  created: [] as Handler[],
  unreadRpcCalls: 0,
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

vi.mock('@/hooks/useAuth', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useAuth: () => ({ user: useSyncExternalStore(authStore.subscribe, authStore.getSnapshot) }),
  };
});

vi.mock('@/lib/gateway', () => ({
  gateway: {
    rpc: async (fn: string) => {
      if (fn !== 'get_unread_conversation_ids') throw new Error(`unexpected rpc: ${fn}`);
      state.unreadRpcCalls += 1;
      return { data: state.serverSet, error: null };
    },
  },
}));

vi.mock('@/lib/messageRealtime', () => ({
  subscribeToMessages: (_userId: string, event: string, cb: Handler) => {
    if (event === 'message.created') state.created.push(cb);
    return () => {
      state.created = state.created.filter((h) => h !== cb);
    };
  },
  getMessageRealtime: () => ({ onReconnect: () => () => {} }),
}));

import { UnreadBadgeProvider } from '@/hooks/useUnreadConversationCount';
import MobileNav from '@/components/MobileNav';

const A = 'conv-a';
const B = 'conv-b';

/** The pages do.md lists, all Layout children in the real app. */
const ROUTES = [
  '/', '/profile', '/groups', '/groups/g1', '/search', '/settings', '/messages',
];

function Where() {
  const { pathname } = useLocation();
  return <p data-testid="where">{pathname}</p>;
}

/** Captures navigate() so the test can drive real route changes. */
const nav = { go: (_to: string) => {} };
function NavCapture() {
  nav.go = useNavigate();
  return null;
}

function Harness() {
  return (
    <UnreadBadgeProvider>
      <MemoryRouter initialEntries={['/']}>
        <Where />
        <NavCapture />
        <Routes>
          {ROUTES.map((r) => (
            <Route key={r} path={r} element={<p />} />
          ))}
        </Routes>
        <MobileNav />
      </MemoryRouter>
    </UnreadBadgeProvider>
  );
}

function badgeOf(container: HTMLElement): string | null {
  const link = container.querySelector('a[href="/messages"]') as HTMLElement | null;
  return link?.querySelector('.bg-red-500')?.textContent ?? null;
}

/**
 * Drive a real route change, the way clicking a nav entry does. Routes with no
 * bottom-nav link of their own (Profile, Groups, Settings) are reached the same
 * way, because the point is that the nav survives a route change whether or not
 * the nav itself owns the link.
 */
async function go(container: HTMLElement, href: string) {
  await act(async () => {
    nav.go(href);
  });
  await waitFor(() =>
    expect(container.querySelector('[data-testid="where"]')?.textContent).toBe(href)
  );
}

beforeEach(() => {
  authStore.setUser({ id: 'me' });
  state.serverSet = [];
  state.created = [];
  state.unreadRpcCalls = 0;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('mobile badge across navigation', () => {
  it('stays on the mobile Messages item through every authenticated page', async () => {
    state.serverSet = [A, B];
    const { container } = render(<Harness />);
    await waitFor(() => expect(badgeOf(container)).toBe('2'));

    for (const route of ROUTES) {
      await go(container, route);
      expect(badgeOf(container)).toBe('2');
    }

    // Navigation must not re-read the aggregate per route: one fetch for the
    // whole walk. This is the "no API request every time the nav renders" rule.
    expect(state.unreadRpcCalls).toBe(1);
  });

  it('updates live from realtime while on each page, not only on mount', async () => {
    state.serverSet = [A];
    const { container } = render(<Harness />);
    await waitFor(() => expect(badgeOf(container)).toBe('1'));

    for (const route of ['/profile', '/groups', '/search', '/settings']) {
      await go(container, route);

      // A message arrives while the user is parked on this page.
      await act(async () => {
        state.created.forEach((h) => h({ conversationId: B }));
      });
      await waitFor(() => expect(badgeOf(container)).toBe('2'));

      // A second message in the same conversation must not make it 3.
      await act(async () => {
        state.created.forEach((h) => h({ conversationId: B }));
      });
      await act(async () => {});
      expect(badgeOf(container)).toBe('2');

      // And the server truth for that conversation leaving the set brings it
      // back down, proving the count is not a local high-water mark.
      state.serverSet = [A];
      await act(async () => {
        const { notifyConversationRead } = await import('@/lib/unreadBadgeBus');
        notifyConversationRead(B);
      });
      await waitFor(() => expect(badgeOf(container)).toBe('1'));
    }
  });
});
