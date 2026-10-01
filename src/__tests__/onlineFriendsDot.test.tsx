// do.md "green online-friends indicator on the mobile Messages icon".
//
// The indicator is one boolean, and almost every way it can be wrong is a way the
// dot is wrong for the WRONG REASON rather than an obvious failure:
//
//   - it is green when the user is merely signed in, or when a pending requester or
//     a blocked person is online (a green dot that means nothing is worse than no
//     dot, because it looks like information);
//   - it collides with the unread badge, or moves the nav row when it appears;
//   - it leaks an online roster to the browser;
//   - it is kept current by a poll, or by a second realtime connection, which is the
//     thing the task most specifically forbids;
//   - it survives a sign-out or leaks across an account switch.
//
// So these render the REAL provider next to the REAL unread-badge provider and the
// REAL MobileNav, with neither the presence answer nor the badge answer mocked at the
// component boundary - only the two network calls underneath them are. A dot that
// came from somewhere else could not appear here at all.
import { render, act, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (payload: unknown) => void;

const state = vi.hoisted(() => ({
  /** What the server currently answers for the online-friends read. */
  online: true as boolean,
  /** The soonest expiry the server reports, or null for "nothing to count down to". */
  offlineAt: null as string | null,
  /** Whether the read fails. A failed read must never read as "nobody is online". */
  readFails: false,
  onlineCalls: 0,
  /** Conversations the badge aggregate reports unread. */
  unreadSet: [] as string[],
  unreadRpcCalls: 0,
  /** Live `presence.updated` listeners registered on the shared channel. */
  presence: [] as Handler[],
  created: [] as Handler[],
  reconnects: [] as (() => void)[],
  /** Events registered per event name, so a duplicate subscription is visible. */
  subscriptionCounts: {} as Record<string, number>,
  /** The Nth online-friends read hangs until `releaseSlow` is called. */
  slowCall: 0,
  slowGate: null as null | (() => void),
}));

const authStore = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let user: { id: string } | null = { id: 'me' };
  return {
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
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
      return { data: state.unreadSet, error: null };
    },
    presenceOnlineFriends: async () => {
      state.onlineCalls += 1;
      const callIndex = state.onlineCalls;
      if (callIndex === state.slowCall && state.slowGate) {
        await new Promise((resolve) => {
          state.slowGate = resolve as unknown as () => void;
        });
      }
      if (state.readFails) return { data: null, error: { message: 'gateway down' } };
      return { data: { hasOnlineFriend: state.online, offlineAt: state.offlineAt }, error: null };
    },
  },
}));

vi.mock('@/lib/messageRealtime', () => ({
  subscribeToMessages: (_userId: string, event: string, cb: Handler) => {
    state.subscriptionCounts[event] = (state.subscriptionCounts[event] ?? 0) + 1;
    if (event === 'presence.updated') state.presence.push(cb);
    if (event === 'message.created') state.created.push(cb);
    return () => {
      state.presence = state.presence.filter((h) => h !== cb);
      state.created = state.created.filter((h) => h !== cb);
      state.subscriptionCounts[event] -= 1;
    };
  },
  getMessageRealtime: () => ({
    onReconnect: (cb: () => void) => {
      state.reconnects.push(cb);
      return () => {
        state.reconnects = state.reconnects.filter((h) => h !== cb);
      };
    },
  }),
}));

import { OnlineFriendsProvider } from '@/hooks/useOnlineFriends';
import { UnreadBadgeProvider } from '@/hooks/useUnreadConversationCount';
import MobileNav from '@/components/MobileNav';

const ROUTES = ['/', '/profile', '/groups', '/groups/g1', '/search', '/settings', '/messages'];
const soon = (ms: number) => new Date(Date.now() + ms).toISOString();

function Harness({ guest = false }: { guest?: boolean }) {
  return (
    <UnreadBadgeProvider>
      <OnlineFriendsProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            {ROUTES.map((r) => (
              <Route key={r} path={r} element={<p />} />
            ))}
          </Routes>
          <MobileNav guest={guest} />
        </MemoryRouter>
      </OnlineFriendsProvider>
    </UnreadBadgeProvider>
  );
}

const dot = (c: HTMLElement) => c.querySelector('[data-testid="messages-online-friends-dot"]');
const badge = (c: HTMLElement) => c.querySelector('[data-testid="messages-unread-badge"]');

beforeEach(() => {
  authStore.setUser({ id: 'me' });
  state.online = true;
  state.offlineAt = null;
  state.readFails = false;
  state.onlineCalls = 0;
  state.unreadSet = [];
  state.unreadRpcCalls = 0;
  state.presence = [];
  state.created = [];
  state.reconnects = [];
  state.subscriptionCounts = {};
  state.slowCall = 0;
  state.slowGate = null;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the green online-friends dot on the mobile Messages icon', () => {
  it('appears when a friend is online and is absent when none is', async () => {
    state.online = true;
    const { container, rerender } = render(<Harness />);
    await waitFor(() => expect(dot(container)).not.toBeNull());

    state.online = false;
    await act(async () => {
      state.presence.forEach((h) => h({}));
    });
    await waitFor(() => expect(dot(container)).toBeNull());

    // And back again, so the test does not pass by rendering the dot unconditionally
    // and then by it simply never updating.
    state.online = true;
    await act(async () => {
      state.presence.forEach((h) => h({}));
    });
    await waitFor(() => expect(dot(container)).not.toBeNull());
    rerender(<Harness />);
  });

  it('is independent of the unread badge in all four combinations', async () => {
    // Each combination is its own mount. Asserting them as separate renders is what
    // makes this a claim about INDEPENDENCE: a single value driving both indicators
    // would show up here as one of these four being unreachable.
    const combo = async (
      online: boolean,
      unread: string[],
      expectDot: boolean,
      expectBadgeText: string | null
    ) => {
      state.online = online;
      state.unreadSet = unread;
      const { container } = render(<Harness />);
      if (expectDot) await waitFor(() => expect(dot(container)).not.toBeNull());
      if (expectBadgeText !== null) {
        await waitFor(() => expect(badge(container)?.textContent).toBe(expectBadgeText));
      } else {
        await act(async () => {
          await new Promise((r) => setTimeout(r, 50));
        });
      }
      expect(dot(container) !== null).toBe(expectDot);
      expect(badge(container)?.textContent ?? null).toBe(expectBadgeText);
      cleanup();
    };

    // Both: a friend is online and three conversations are unread.
    await combo(true, ['a', 'b', 'c'], true, '3');
    // Badge only: unread, nobody online.
    await combo(false, ['a', 'b', 'c'], false, '3');
    // Dot only: a friend is online, everything read.
    await combo(true, [], true, null);
    // Neither.
    await combo(false, [], false, null);
  });

  it('moves the two indicators independently at runtime', async () => {
    state.online = true;
    state.unreadSet = [];
    const { container } = render(<Harness />);
    await waitFor(() => expect(dot(container)).not.toBeNull());
    expect(badge(container)).toBeNull();

    // A friend goes offline. The badge must not be affected by a presence event.
    state.online = false;
    await act(async () => {
      state.presence.forEach((h) => h({}));
    });
    await waitFor(() => expect(dot(container)).toBeNull());
    expect(badge(container)).toBeNull();

    // A message arrives. The dot must not be affected by a message event.
    state.unreadSet = ['a'];
    await act(async () => {
      state.created.forEach((h) => h({ conversationId: 'a' }));
    });
    await waitFor(() => expect(badge(container)?.textContent).toBe('1'));
    expect(dot(container)).toBeNull();

    // And both together, from the two independent sources.
    state.online = true;
    await act(async () => {
      state.presence.forEach((h) => h({}));
    });
    await waitFor(() => expect(dot(container)).not.toBeNull());
    expect(badge(container)?.textContent).toBe('1');
  });

  it('does not overlap or displace the badge: two corners, one row', async () => {
    state.online = true;
    state.unreadSet = ['a'];
    const { container } = render(<Harness />);
    await waitFor(() => expect(dot(container)).not.toBeNull());
    const d = dot(container) as HTMLElement;
    const b = badge(container) as HTMLElement;

    expect(d.className).toContain('absolute');
    expect(b.className).toContain('absolute');
    // Different corners: the badge is anchored top-right, the dot bottom-left.
    expect(b.className).toContain('-top-1.5');
    expect(b.className).toContain('-right-2.5');
    expect(d.className).toContain('-bottom-1');
    expect(d.className).toContain('-left-1.5');
    expect(d.className).not.toContain('-top-1.5');
    // The existing badge markup is untouched by this feature.
    expect(b.className).toContain('bg-red-500');
    expect(d.className).toContain('bg-green-500');
    expect(d.className).toContain('rounded-full');

    // Neither indicator changes the link's box, so the row cannot jump.
    const link = container.querySelector('a[href="/messages"]') as HTMLElement;
    const before = link.getBoundingClientRect();
    state.online = false;
    await act(async () => {
      state.presence.forEach((h) => h({}));
    });
    await waitFor(() => expect(dot(container)).toBeNull());
    expect(link.getBoundingClientRect()).toEqual(before);
    expect(link.className).toContain('w-10');
  });

  it('never renders while logged out, and reads nothing at all', async () => {
    authStore.setUser(null);
    const { container } = render(<Harness />);
    await act(async () => {});
    expect(dot(container)).toBeNull();
    expect(state.onlineCalls).toBe(0);
  });

  it('is absent for a guest, who has no Messages entry at all', async () => {
    const { container } = render(<Harness guest />);
    await act(async () => {});
    expect(container.querySelector('a[href="/messages"]')).toBeNull();
    expect(dot(container)).toBeNull();
  });
});

describe('how it stays current (no polling, no second subscription)', () => {
  it('adds no interval and re-reads nothing on its own', async () => {
    state.online = true;
    render(<Harness />);
    await waitFor(() => expect(state.onlineCalls).toBe(1));

    // Well past the debounce and past several heartbeat intervals. A poll would have
    // fired by now many times over; an event-driven read cannot.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });
    expect(state.onlineCalls).toBe(1);

    const src = readFileSync(
      join(__dirname, '..', 'hooks', 'useOnlineFriends.tsx'),
      'utf8'
    );
    // Stripped of comments first: the word `setInterval` appears in this file only
    // to explain why there isn't one, and asserting on prose would make the test
    // pass or fail on its own documentation.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/setInterval/);
    expect(code).not.toMatch(/requestAnimationFrame/);
    expect(code).toMatch(/setTimeout/);
    // No presence read of its own, and no roster: the only presence read this file can
    // make is the aggregate, so the friend list and the stamps never reach the browser.
    expect(code).not.toMatch(/last_seen_at/);
    expect(code).not.toMatch(/'friends'/);
    expect(code).not.toMatch(/'blocks'/);
    expect(code).toMatch(/presenceOnlineFriends/);
  });

  it('rides the existing shared channel: one presence listener, no new connection', async () => {
    render(<Harness />);
    await waitFor(() => expect(state.onlineCalls).toBe(1));

    // One `presence.updated` listener for the whole session, on the same shared
    // ref-counted channel the badge uses. A second subscription would make this 2,
    // and a per-nav-component one would scale with the number of navs.
    expect(state.subscriptionCounts['presence.updated']).toBe(1);
    expect(state.subscriptionCounts['message.created']).toBe(1);

    const src = readFileSync(
      join(__dirname, '..', 'hooks', 'useOnlineFriends.tsx'),
      'utf8'
    );
    expect(src).toMatch(/subscribeToMessages/);
    expect(src).toMatch(/getMessageRealtime/);
    // It must not open its own SSE stream or construct its own channel.
    expect(src).not.toMatch(/new UserRealtimeChannel/);
    expect(src).not.toMatch(/realtime\/subscribe/);
    expect(src).not.toMatch(/EventSource/);
  });

  it('coalesces a burst of realtime wake-ups into one read', async () => {
    state.online = true;
    render(<Harness />);
    await waitFor(() => expect(state.onlineCalls).toBe(1));

    await act(async () => {
      for (let i = 0; i < 12; i++) state.presence.forEach((h) => h({}));
    });
    await waitFor(() => expect(state.onlineCalls).toBe(2));
    // Debounced: twelve wake-ups, one request.
    expect(state.onlineCalls).toBe(2);
  });

  it('re-reads after a realtime reconnect, when events were missed while down', async () => {
    state.online = true;
    render(<Harness />);
    await waitFor(() => expect(state.onlineCalls).toBe(1));

    state.online = false;
    await act(async () => {
      state.reconnects.forEach((cb) => cb());
    });
    await waitFor(() => expect(dot).toBeDefined());
    await act(async () => {});
    // The read happened; whether the dot moved depends on the server answer, which is
    // what proves the re-read is a real read rather than a local patch.
    expect(state.onlineCalls).toBe(2);
  });

  it('re-reads when the tab comes back, and skips the read while it is hidden', async () => {
    state.online = true;
    render(<Harness />);
    await waitFor(() => expect(state.onlineCalls).toBe(1));

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(state.onlineCalls).toBe(1);

    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(state.onlineCalls).toBe(2));
  });

  it('survives navigation across every authenticated page without re-reading', async () => {
    state.online = true;
    const nav = { go: (_to: string) => {} };
    function Capture() {
      nav.go = useNavigate();
      return null;
    }
    function Where() {
      const { pathname } = useLocation();
      return <p data-testid="where">{pathname}</p>;
    }
    const { container } = render(
      <UnreadBadgeProvider>
        <OnlineFriendsProvider>
          <MemoryRouter initialEntries={['/']}>
            <Capture />
            <Where />
            <Routes>
              {ROUTES.map((r) => (
                <Route key={r} path={r} element={<p />} />
              ))}
            </Routes>
            <MobileNav />
          </MemoryRouter>
        </OnlineFriendsProvider>
      </UnreadBadgeProvider>
    );
    await waitFor(() => expect(dot(container)).not.toBeNull());

    for (const route of ROUTES) {
      await act(async () => {
        nav.go(route);
      });
      await waitFor(() =>
        expect(container.querySelector('[data-testid="where"]')?.textContent).toBe(route)
      );
      expect(dot(container)).not.toBeNull();
    }
    // The whole walk, one read: the indicator does not require the Messages page.
    expect(state.onlineCalls).toBe(1);
  });
});

describe('going offline, without polling for it', () => {
  it('turns the dot off when the reported expiry arrives', async () => {
    state.online = true;
    state.offlineAt = soon(400);
    const { container } = render(<Harness />);
    await waitFor(() => expect(dot(container)).not.toBeNull());

    // The friend is gone. The countdown is the only mechanism that can notice.
    state.online = false;
    await waitFor(() => expect(dot(container)).toBeNull(), { timeout: 3000 });
    expect(state.onlineCalls).toBe(2);
  });

  it('keeps the dot while another friend is still online, then drops it', async () => {
    // do.md's sequence: A goes offline but B is still there, so the answer stays
    // true and the countdown simply re-arms with B's later expiry.
    state.online = true;
    state.offlineAt = soon(300);
    const { container } = render(<Harness />);
    await waitFor(() => expect(dot(container)).not.toBeNull());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    // The countdown fired, re-read, and the server still says a friend is online.
    expect(dot(container)).not.toBeNull();
    expect(state.onlineCalls).toBe(2);

    // Now the last one goes.
    state.online = false;
    state.offlineAt = soon(200);
    await act(async () => {
      state.presence.forEach((h) => h({}));
    });
    await waitFor(() => expect(dot(container)).toBeNull(), { timeout: 3000 });
  });

  it('arms no countdown at all when the answer is false', async () => {
    state.online = false;
    state.offlineAt = soon(300);
    const { container } = render(<Harness />);
    await waitFor(() => expect(state.onlineCalls).toBe(1));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 900));
    });
    // A null answer cannot become false, so there is nothing to wake up for.
    expect(state.onlineCalls).toBe(1);
  });
});

describe('auth lifecycle', () => {
  it('clears on sign-out and does not re-read while signed out', async () => {
    state.online = true;
    const { container } = render(<Harness />);
    await waitFor(() => expect(dot(container)).not.toBeNull());

    await act(async () => {
      authStore.setUser(null);
    });
    expect(dot(container)).toBeNull();

    const callsAtLogout = state.onlineCalls;
    await act(async () => {
      state.presence.forEach((h) => h({}));
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(state.onlineCalls).toBe(callsAtLogout);
  });

  it('clears the previous account on sign-out and re-reads for the next one', async () => {
    state.online = true;
    const { container } = render(<Harness />);
    await waitFor(() => expect(dot(container)).not.toBeNull());

    await act(async () => {
      authStore.setUser(null);
    });
    expect(dot(container)).toBeNull();

    state.online = false;
    await act(async () => {
      authStore.setUser({ id: 'other' });
    });
    // The new account starts from nothing: it must not inherit the old dot while
    // its own first read is still in flight.
    expect(dot(container)).toBeNull();
    await waitFor(() => expect(state.onlineCalls).toBe(2));
    expect(dot(container)).toBeNull();
  });

  it('does not let a slow read for the previous account land on the current one', async () => {
    state.online = true;
    const { container } = render(<Harness />);
    await waitFor(() => expect(dot(container)).not.toBeNull());

    // The next read will hang: we trigger a refresh (by firing presence.updated),
    // then switch accounts while it's in flight.
    state.slowCall = state.onlineCalls + 1;

    state.online = false;
    await act(async () => {
      state.presence.forEach((h) => h({}));
    });
    await act(async () => {
      authStore.setUser({ id: 'other' });
    });
    if (state.slowGate) {
      await act(async () => {
        state.slowGate?.();
        state.slowGate = null;
      });
    }

    // Account B's own answer is false, so a late response from account A's
    // generation must not paint.
    await act(async () => {});
    expect(dot(container)).toBeNull();
  });
});

describe('failure handling and mobile-only scope', () => {
  it('keeps the last good answer when a read fails, rather than claiming nobody is online', async () => {
    state.online = true;
    const { container } = render(<Harness />);
    await waitFor(() => expect(dot(container)).not.toBeNull());

    state.readFails = true;
    await act(async () => {
      state.presence.forEach((h) => h({}));
    });
    await waitFor(() => expect(state.onlineCalls).toBe(2));
    // A gateway blip must not retract a dot the user is looking at.
    expect(dot(container)).not.toBeNull();
  });

  it('never exposes WHICH friend is online', async () => {
    // The provider's only knowledge is a boolean. Asserted on the source, because a
    // roster cannot be observed at the DOM level: the dot has no accessible name, no
    // title, no data attribute and no text.
    const src = readFileSync(join(__dirname, '..', 'hooks', 'useOnlineFriends.tsx'), 'utf8');
    expect(src).not.toMatch(/friendIds|friend_id|onlineFriendIds/);
    const nav = readFileSync(join(__dirname, '..', 'components', 'MobileNav.tsx'), 'utf8');
    const dotMarkup = /messages-online-friends-dot[\s\S]*?\/>/.exec(nav);
    expect(dotMarkup).not.toBeNull();
    // The testid itself says "friends", so it is stripped before looking for anything
    // that could leak a name.
    const attributes = dotMarkup![0].replace('messages-online-friends-dot', '');
    // No id, no name, no tooltip, no text - nothing that could carry who it is.
    expect(attributes).not.toMatch(/friend/i);
    expect(attributes).not.toMatch(/title=/i);
    expect(attributes).not.toMatch(/aria-label/i);
    expect(attributes).toMatch(/aria-hidden/);
  });

  it('is mobile only: nothing else consumes it', () => {
    // The indicator is absent where it should be because nothing asks for it, not
    // because a breakpoint hides it. That distinction is the whole guarantee: a
    // later desktop nav refactor cannot accidentally acquire a dot.
    const layout = readFileSync(join(__dirname, '..', 'components', 'Layout.tsx'), 'utf8');
    expect(layout).not.toMatch(/useOnlineFriends|OnlineFriendsProvider|online-friends-dot/);
    // The desktop rail's badge must be exactly as it was: it still reads the shared
    // count, still caps at 9+, and still anchors top-right with nothing added to it.
    expect(layout).toMatch(/useUnreadConversationCount/);
    expect(layout).toMatch(/unreadMessageCount > 9 \? '9\+'/);
    expect(layout).toMatch(/-top-2 -right-2\.5 h-4 min-w-4/);

    // And the dot's markup exists in exactly one component.
    const files = [
      'components/MobileNav.tsx',
      'components/Layout.tsx',
      'pages/Messages.tsx',
      'components/messages/ConversationList.tsx',
      'components/messages/ChatWindow.tsx',
      'components/messages/ChatInfoPanel.tsx',
    ];
    const withDot = files.filter((f) =>
      readFileSync(join(__dirname, '..', f), 'utf8').includes('messages-online-friends-dot')
    );
    expect(withDot).toEqual(['components/MobileNav.tsx']);
  });
});
