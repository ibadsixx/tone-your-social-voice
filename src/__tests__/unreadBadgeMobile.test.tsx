// do.md "mobile badge" round: the mobile navigation must consume the SAME
// global unread-conversation state as the desktop navigation.
//
// WHAT WAS WRONG (or, as it turned out, what was NOT). The report was that the
// badge works on desktop but the mobile Messages icon never shows it. The
// suspicion list in do.md runs from "separate mobile component" to "CSS hiding
// the badge". Every one of those was checked and none held:
//
//   - There is ONE navigation implementation per breakpoint. MobileNav is the
//     only bottom nav; the desktop rail is a different tree inside Layout. They
//     are not duplicates of each other's logic, they are two consumers.
//   - MobileNav is rendered unconditionally by Layout (line 508), OUTSIDE the
//     `!pathname.startsWith('/settings')` guard that hides the desktop rail, so
//     it is present on Settings too and on every other Layout child.
//   - It already called `useUnreadConversationCount()` and already rendered the
//     shared `Badge` with the `9+` cap.
//   - The deployed stylesheet really does contain the badge's positioning
//     classes (min-w-3.5, -top-1.5, -right-2.5, h-3.5, text-[9px], bg-red-500),
//     so nothing was purged and no breakpoint rule hides it.
//
// So the mobile badge was never missing a wire. What these tests lock down is
// the property that actually matters and was previously only asserted by
// reading source text: that MobileNav renders the number produced by the ONE
// provider instance, and that it does so without standing up a second realtime
// subscription, a second API call path, or its own unread arithmetic.
import { render, act, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (payload: unknown) => void;
const state = vi.hoisted(() => ({
  serverSet: [] as string[],
  subscribeCalls: [] as string[],
  created: [] as Handler[],
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
      return { data: state.serverSet, error: null };
    },
  },
}));

vi.mock('@/lib/messageRealtime', () => ({
  subscribeToMessages: (userId: string, event: string, cb: Handler) => {
    // Counted so a second subscription would be caught, not just eyeballed.
    state.subscribeCalls.push(`${userId}:${event}`);
    if (event === 'message.created') state.created.push(cb);
    return () => {
      state.created = state.created.filter((h) => h !== cb);
    };
  },
  getMessageRealtime: () => ({ onReconnect: () => () => {} }),
}));

import { notifyConversationRead } from '@/lib/unreadBadgeBus';
import { UnreadBadgeProvider } from '@/hooks/useUnreadConversationCount';
import MobileNav from '@/components/MobileNav';

const A = 'conv-a';
const B = 'conv-b';
const C = 'conv-c';

/**
 * Render the REAL mobile nav inside the REAL provider -- no mock of the unread
 * hook. If MobileNav were computing its own count, or reading a second store,
 * this would not move.
 */
function renderMobileNav() {
  const utils = render(
    <UnreadBadgeProvider>
      <MemoryRouter>
        <MobileNav />
      </MemoryRouter>
    </UnreadBadgeProvider>
  );
  const link = utils.container.querySelector('a[href="/messages"]') as HTMLElement;
  const badge = () => link.querySelector('.bg-red-500')?.textContent ?? null;
  return { ...utils, badge };
}

const emitted = (conversationId: string) =>
  act(async () => {
    state.created.forEach((h) => h({ conversationId }));
  });

beforeEach(() => {
  authStore.setUser({ id: 'me' });
  state.serverSet = [];
  state.subscribeCalls = [];
  state.created = [];
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('mobile Messages badge consumes the global unread state', () => {
  it('shows the global count: unread CONVERSATIONS, not messages', async () => {
    // A: 3 unread messages, B: 1 unread, C: read -> badge 2.
    state.serverSet = [A, B];
    const { badge } = renderMobileNav();
    await waitFor(() => expect(badge()).toBe('2'));
  });

  it('renders no badge at all when every conversation is read', async () => {
    state.serverSet = [];
    const { badge } = renderMobileNav();
    await waitFor(() => expect(badge()).toBeNull());
  });

  it('caps at 9+ on mobile exactly as the desktop badge does', async () => {
    state.serverSet = [A, B, C];
    const { badge } = renderMobileNav();
    await waitFor(() => expect(badge()).toBe('3'));
    expect(badge()).not.toBe('9+');

    // 12 unread conversations renders the cap, not 12.
    state.serverSet = Array.from({ length: 12 }, (_, i) => `c${i}`);
    const { badge: capped } = renderMobileNav();
    await waitFor(() => expect(capped()).toBe('9+'));
  });

  it('moves on an incoming message without a second realtime subscription', async () => {
    state.serverSet = [A];
    const { badge } = renderMobileNav();
    await waitFor(() => expect(badge()).toBe('1'));

    // Another user sends a message while the user is on mobile Home.
    await emitted(B);
    await waitFor(() => expect(badge()).toBe('2'));

    // A second message in the SAME conversation must not make it 3.
    await emitted(B);
    await waitFor(() => expect(badge()).toBe('2'));

    // Exactly one message subscription, created by the one provider.
    expect(state.subscribeCalls).toEqual(['me:message.created']);
  });

  it('drops on mark-as-read, then hides at zero', async () => {
    state.serverSet = [A, B, C];
    const { badge } = renderMobileNav();
    await waitFor(() => expect(badge()).toBe('3'));

    await act(async () => {
      notifyConversationRead(A);
    });
    expect(badge()).toBe('2');

    state.serverSet = [C];
    await act(async () => {
      notifyConversationRead(B);
    });
    expect(badge()).toBe('1');

    state.serverSet = [];
    await act(async () => {
      notifyConversationRead(C);
    });
    expect(badge()).toBeNull();
  });

  it('clears on logout and restores the next account on login', async () => {
    state.serverSet = [A, B];
    const { badge } = renderMobileNav();
    await waitFor(() => expect(badge()).toBe('2'));

    await act(async () => {
      authStore.setUser(null);
    });
    await waitFor(() => expect(badge()).toBeNull());

    state.serverSet = [C];
    await act(async () => {
      authStore.setUser({ id: 'user-2' });
    });
    await waitFor(() => expect(badge()).toBe('1'));
  });

  it('opens ONE subscription for many consumers of the one provider', async () => {
    state.serverSet = [A, B];
    // The real tree: one UnreadBadgeProvider in App.tsx with BOTH navigation
    // surfaces (desktop rail + mobile nav) mounted inside it. Several
    // consumers, one owner, therefore one stream.
    render(
      <UnreadBadgeProvider>
        <MemoryRouter>
          <MobileNav />
          <MobileNav />
          <MobileNav />
        </MemoryRouter>
      </UnreadBadgeProvider>
    );
    await waitFor(() => expect(state.subscribeCalls.length).toBe(1));
    expect(state.subscribeCalls).toEqual(['me:message.created']);
  });
});
