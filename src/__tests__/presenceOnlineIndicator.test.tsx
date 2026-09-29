// do.md "online presence indicator", frontend side.
//
// The reported symptom was "two users are online and the conversation list still
// shows a gray dot". The dot was never the problem. Reading the implementation
// produced three independent defects, all of which had to be fixed for the
// symptom to clear, and each of them is asserted here:
//
//   1. THE WRITE NEVER RAN. `usePresence` heartbeated by calling the database
//      function `update_last_seen()` via `gateway.rpc('update_last_seen')`.
//      Measured against production before the fix, 28 of 29 profiles had
//      `last_seen_at` exactly equal to `created_at` - the column's INSERT default.
//      Nobody had ever been marked online. The dot was gray because there was
//      never anything to draw, not because the comparison was wrong.
//      Asserted as: the heartbeat goes to `POST /api/presence/heartbeat`, and
//      `update_last_seen` is gone from the source tree entirely.
//
//   2. THE WRITER WAS MOUNTED ON A PAGE. The heartbeat lived in
//      `pages/Messages.tsx`, so navigating to Home stopped it and the user began
//      ageing out of everyone else's green dot while still signed in.
//      Asserted as: the only mount is app-level, above the router.
//
//   3. THE DOT COULD NEVER GO GRAY. `ConversationItem` is wrapped in React.memo,
//      and the presence refresh returns the SAME conversation object when a
//      partner's `last_seen_at` has not moved. Shallow-equal props -> memo bails
//      -> `isOnline()` is not re-run -> the dot is frozen at whatever it last
//      was. A partner's dot could turn green when a timestamp arrived but never
//      turn gray again, which is exactly the state a disconnecting user is in.
//      Asserted as: the list threads an incrementing `presenceTick` through to
//      the memoised item.
//
// Fixing only (1) would have turned the permanently-gray dot permanently green,
// so (3) is not a refinement of this fix, it is part of it.
//
// Run: npx vitest run src/__tests__/presenceOnlineIndicator.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const presenceHeartbeat = vi.fn();
const rpc = vi.fn();

vi.mock('@/lib/gateway', () => ({
  gateway: {
    presenceHeartbeat: () => presenceHeartbeat(),
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

import {
  isOnline,
  formatLastSeen,
  usePresence,
  POLL_INTERVAL_MS,
  OFFLINE_THRESHOLD_MS,
} from '@/hooks/usePresence';

const SRC = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

/**
 * `waitFor` cannot be used with fake timers installed - it schedules its own
 * polling on the clock that the test has taken over, so it never fires. The
 * heartbeat's mock resolves immediately, so flushing microtasks inside `act` is
 * both sufficient and deterministic.
 */
const flush = async () => {
  await act(async () => {});
};

/**
 * Strip comments so a "this must be gone" sweep cannot be satisfied by the prose
 * that explains why it was removed. A state machine rather than a regex, because
 * a naive strip desynchronises on this codebase and then reports "clean" for the
 * wrong reason:
 *
 *   - a `//` inside a string literal (a URL) would truncate the rest of the line
 *   - a regex literal containing a quote - `/^['"]|['"]$/g` in lib/gateway.ts -
 *     would be mistaken for the start of a string, and every comment after it
 *     would be read as string content
 *
 * The second is why this is not `src.replace(/\/\/.*$/gm, '')`. A stripper that
 * quietly stops stripping is worse than none, because every assertion built on it
 * still looks like it is holding.
 */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  /** Last non-whitespace character emitted, used to tell division from a regex. */
  const prevMeaningful = () => {
    for (let k = out.length - 1; k >= 0; k--) {
      if (!/\s/.test(out[k])) return out[k];
    }
    return '';
  };
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // Regex literal: a `/` that cannot be division, because the previous
    // meaningful character cannot end an expression.
    if (c === '/' && (prevMeaningful() === '' || /[({[,;=:!&|?+\-*%~^<>]/.test(prevMeaningful()))) {
      out += c;
      i++;
      let inClass = false;
      while (i < n) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] ?? ''); i += 2; continue; }
        if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        else if (src[i] === '/' && !inClass) { out += src[i]; i++; break; }
        else if (src[i] === '\n') break;
        out += src[i];
        i++;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += c;
      i++;
      while (i < n) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] ?? ''); i += 2; continue; }
        out += src[i];
        if (src[i] === quote) { i++; break; }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Every .ts/.tsx under src/, so "does X still exist anywhere" is answerable. */
function allSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) allSourceFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('isOnline - the comparison behind the dot', () => {
  const now = () => Date.now();

  it('is true for a timestamp inside the freshness window', () => {
    expect(isOnline(new Date(now() - 1000).toISOString())).toBe(true);
  });

  it('is false once the timestamp is outside the window', () => {
    expect(isOnline(new Date(now() - OFFLINE_THRESHOLD_MS - 1000).toISOString())).toBe(false);
  });

  it('is false at exactly the threshold, so the window does not overlap itself', () => {
    // Strictly-less-than, matching the original. An inclusive bound would make
    // `now - lastSeen === threshold` flicker between true and false depending on
    // millisecond rounding, which is how a dot ends up flickering.
    expect(isOnline(new Date(now() - OFFLINE_THRESHOLD_MS).toISOString())).toBe(false);
  });

  it('treats a missing, null or empty timestamp as offline, never as online', () => {
    expect(isOnline(undefined)).toBe(false);
    expect(isOnline(null)).toBe(false);
    expect(isOnline('')).toBe(false);
  });

  it('treats an unparseable timestamp as offline, not as now', () => {
    // The failure this guards: a malformed value that parsed to NaN and then
    // compared as "fresh", which would paint everyone green on a bad deploy.
    expect(isOnline('not-a-date')).toBe(false);
  });

  it('agrees with the production failure it was measured against', () => {
    // The value 28 of 29 real profiles actually held. It must read as offline,
    // which is the honest reading and the reason the dot was gray.
    const insertDefault = '2026-08-27T20:28:38.675535+00:00';
    expect(isOnline(insertDefault)).toBe(false);
  });
});

describe('the freshness window vs background-tab timer throttling', () => {
  it('clears the ~60s throttle a background tab imposes on timers', () => {
    // Chrome throttles timers in a background tab to roughly once per minute,
    // and keeps that rate under "intensive" throttling after five minutes. A
    // 30s interval therefore actually fires about every 60s in a background tab.
    const BACKGROUND_TAB_TIMER_CLAMP_MS = 60_000;
    expect(OFFLINE_THRESHOLD_MS).toBeGreaterThan(BACKGROUND_TAB_TIMER_CLAMP_MS);
  });

  it('still beats the heartbeat interval in the foreground', () => {
    expect(OFFLINE_THRESHOLD_MS).toBeGreaterThan(POLL_INTERVAL_MS);
  });

  it('survives two consecutive throttled ticks, not just one', () => {
    // One missed tick is tolerable. Two is the real requirement: an interval
    // that fires every 60s must still be inside the window on the tick after a
    // single gap, so the window has to exceed twice the clamped interval.
    expect(OFFLINE_THRESHOLD_MS).toBeGreaterThan(2 * 60_000);
  });

  it('keeps the heartbeat cheap - not a per-second poll', () => {
    // do.md: do not add polling if a realtime mechanism exists. None does (see
    // the GatewayChannel note below), so a 30s heartbeat is the architecture -
    // but it still must not become a tight loop.
    expect(POLL_INTERVAL_MS).toBeGreaterThanOrEqual(15_000);
  });
});

describe('usePresence - the write path', () => {
  beforeEach(() => {
    presenceHeartbeat.mockReset();
    rpc.mockReset();
    presenceHeartbeat.mockResolvedValue({ data: { ok: true, updated: 1, last_seen_at: 'now' }, error: null });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('beats immediately on mount rather than waiting a full interval', async () => {
    renderHook(() => usePresence('me'));
    await flush();
    expect(presenceHeartbeat).toHaveBeenCalledTimes(1);
  });

  it('goes through the gateway endpoint, not the dead database function', async () => {
    renderHook(() => usePresence('me'));
    await flush();
    expect(presenceHeartbeat).toHaveBeenCalled();
    // The specific regression: the old implementation heartbeat by
    // `gateway.rpc('update_last_seen')`, which silently wrote nothing.
    expect(rpc).not.toHaveBeenCalled();
  });

  it('re-beats on the interval', async () => {
    renderHook(() => usePresence('me'));
    await flush();
    expect(presenceHeartbeat).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(presenceHeartbeat).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(presenceHeartbeat).toHaveBeenCalledTimes(3);
  });

  it('does not beat when there is no signed-in user', async () => {
    renderHook(() => usePresence(null));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    });
    expect(presenceHeartbeat).not.toHaveBeenCalled();
  });

  it('re-beats the moment the tab becomes visible again', async () => {
    renderHook(() => usePresence('me'));
    await flush();
    expect(presenceHeartbeat).toHaveBeenCalledTimes(1);
    // A backgrounded tab can be minutes past the window; the first beat on
    // return is what makes the user green again immediately.
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await act(async () => {});
    expect(presenceHeartbeat).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(presenceHeartbeat).toHaveBeenCalledTimes(2);
  });

  it('stops beating and detaches its listeners on unmount', async () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => usePresence('me'));
    await flush();
    expect(presenceHeartbeat).toHaveBeenCalledTimes(1);
    unmount();
    const callsBefore = presenceHeartbeat.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 4);
    });
    expect(presenceHeartbeat.mock.calls.length).toBe(callsBefore);
    // The old implementation registered a `visibilitychange` listener and never
    // removed it, so every mount of the owning page leaked one.
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});

describe('usePresence - a failing heartbeat must be visible', () => {
  beforeEach(() => {
    presenceHeartbeat.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('logs a real failure instead of swallowing it', async () => {
    // The old implementation discarded the result entirely, which is precisely
    // why a write path that had never once succeeded produced no signal.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    presenceHeartbeat.mockResolvedValue({ data: null, error: { message: 'Presence update failed', code: '500' } });
    renderHook(() => usePresence('me'));
    await flush();
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls[0].join(' ')).toContain('Presence update failed');
  });

  it('does not log a 401 on every tick - that is just sign-out', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    presenceHeartbeat.mockResolvedValue({ data: null, error: { message: 'Missing authorization header', code: '401' } });
    renderHook(() => usePresence('me'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('reports `updated: 0`, because a write that matched nothing is not a write', async () => {
    // Valid token, no profile row. Reporting this as success is the exact
    // invisibility that let a dead heartbeat look like an idle user.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    presenceHeartbeat.mockResolvedValue({ data: { ok: true, updated: 0, last_seen_at: 'now' }, error: null });
    renderHook(() => usePresence('me'));
    await flush();
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls[0].join(' ')).toMatch(/no profile row/i);
  });
});

describe('the heartbeat has exactly one owner, above the router', () => {
  it('is mounted at app level, not inside a page', () => {
    const app = read('App.tsx');
    expect(app).toContain('PresenceHeartbeat');
    // Above the router: presence is a property of the session, not of the route.
    expect(app.indexOf('<PresenceHeartbeat />')).toBeLessThan(app.indexOf('<Routes>'));
    // And inside the auth provider, so it can see the session at all.
    expect(app.indexOf('<AuthProvider>')).toBeLessThan(app.indexOf('<PresenceHeartbeat />'));
  });

  it('is NOT mounted on the Messages page any more', () => {
    // Leaving Messages previously stopped the heartbeat entirely, so the user
    // aged out of every other user's green dot while still signed in.
    const messages = read('pages/Messages.tsx');
    expect(messages).not.toMatch(/usePresence\(/);
  });

  it('is mounted nowhere else either - a second mount doubles the write rate', () => {
    const callers = allSourceFiles(SRC).filter((f) => {
      if (f.endsWith(join('hooks', 'usePresence.ts'))) return false;
      if (f.endsWith(join('components', 'presence', 'PresenceHeartbeat.tsx'))) return false;
      return /<PresenceHeartbeat\s*\/>/.test(readFileSync(f, 'utf8'));
    });
    expect(callers.map((f) => f.slice(SRC.length + 1))).toEqual(['App.tsx']);
  });

  it('the mount component renders nothing and takes its id from useAuth', () => {
    const mount = read('components/presence/PresenceHeartbeat.tsx');
    expect(mount).toContain('useAuth');
    expect(mount).toMatch(/return null/);
  });
});

describe('the dead write path is gone from the source tree', () => {
  it('no longer calls the update_last_seen RPC anywhere', () => {
    // Not merely unused: absent. Leaving the call in place would let a future
    // "simplification" resurrect the write path that never worked.
    const offenders = allSourceFiles(SRC).filter((f) => /update_last_seen/.test(stripComments(readFileSync(f, 'utf8'))));
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });
});

describe('the dot can age out - React.memo must not freeze it', () => {
  it('the list threads an incrementing presenceTick to the memoised item', () => {
    const list = read('components/messages/ConversationList.tsx');
    // The item is memoised, so an unchanged `conversation` object means the item
    // does not re-render and `isOnline()` is not re-evaluated against the clock.
    expect(list).toContain('memo(');
    expect(list).toContain('presenceTick');
    // Passed down at the render site, not merely accepted as a prop.
    expect(list).toMatch(/<ConversationItem[\s\S]*presenceTick=\{presenceTick\}/);
  });

  it('the hook bumps the tick on every refresh round', () => {
    const hook = read('hooks/useConversations.ts');
    expect(hook).toMatch(/setPresenceTick\(\s*\w+\s*=>\s*\w+\s*\+\s*1\s*\)/);
    expect(hook).toMatch(/presenceTick/);
  });

  it('the tick is bumped even when no timestamp changed', () => {
    // The bump must sit AFTER the profile read, at the TOP LEVEL of the refresh
    // function - not inside the branch that rewrites `last_seen_at`, because the
    // unchanged case is precisely when a disconnecting partner's dot has to turn
    // gray. A textual "appears later in the file" check is not enough: moving the
    // bump into the short-circuit arm still reads later, and reintroduces exactly
    // the frozen dot. So this asserts the indentation, which distinguishes "last
    // statement of the round" from "inside the per-conversation mapper".
    const hook = read('hooks/useConversations.ts');
    const effect = hook.slice(hook.indexOf('const refreshPresence'));
    const bumpLines = effect.split('\n').filter((l) => /^\s*setPresenceTick\(/.test(l));
    expect(bumpLines.length).toBe(1);
    const indent = bumpLines[0].match(/^\s*/)?.[0].length ?? 0;
    expect(
      indent,
      'the bump must be a top-level statement of refreshPresence (6 spaces), not nested ' +
      'inside the per-conversation mapper - otherwise it only fires when a timestamp moved, ' +
      'and the dot can never turn gray',
    ).toBe(6);
    expect(effect.indexOf('setPresenceTick('))
      .toBeGreaterThan(effect.indexOf('newLastSeen ==='));
  });

  it('the page threads the tick from the hook to the list', () => {
    const messages = read('pages/Messages.tsx');
    expect(messages).toMatch(/presenceTick=\{presenceTick\}/);
  });
});

describe('there is still only one presence store', () => {
  it('no second presence column or table was introduced', () => {
    // The fix must repair the existing store, not add a parallel one. A new
    // `is_online` column or presence table would split the truth in two.
    const offenders = allSourceFiles(SRC).filter((f) => /\bis_online\b/.test(stripComments(readFileSync(f, 'utf8'))));
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });

  it('reads the same last_seen_at the gateway writes', () => {
    const gatewayClient = read('lib/gateway.ts');
    expect(gatewayClient).toContain('/api/presence/heartbeat');
    // No-store, because a cached 200 would report "you are online" for as long
    // as the entry lived.
    expect(gatewayClient).toMatch(/cache:\s*'no-store'/);
  });

  it('leaves the message-request presence privacy rule intact', () => {
    // The redaction gate for non-friends with a pending request is a separate
    // feature; the heartbeat must not have weakened it.
    const privacy = read('hooks/usePresencePrivacy.ts');
    expect(privacy).toContain('computePresencePrivacy');
    const list = read('components/messages/ConversationList.tsx');
    expect(list).toContain('isPresenceHidden');
    expect(list).toMatch(/const online = !isMulti && !presenceHidden/);
  });
});

describe('formatLastSeen', () => {
  it('reads "Offline" for a missing timestamp and "Just now" for a fresh one', () => {
    expect(formatLastSeen(undefined)).toBe('Offline');
    expect(formatLastSeen(new Date().toISOString())).toBe('Just now');
  });

  it('scales through minutes, hours and days', () => {
    const ago = (ms: number) => formatLastSeen(new Date(Date.now() - ms).toISOString());
    expect(ago(5 * 60_000)).toBe('5m ago');
    expect(ago(3 * 3_600_000)).toBe('3h ago');
    expect(ago(2 * 86_400_000)).toBe('2d ago');
  });
});
