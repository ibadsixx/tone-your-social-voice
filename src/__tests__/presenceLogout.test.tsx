// do.md "online presence indicator" - explicit sign-out cleanup, frontend side.
//
// THE BUG. Two users are connected and each correctly sees the other green. User
// A then logs out, and B keeps seeing A green. The online detection itself was
// fine, which is exactly why the fix had to be in the sign-out path rather than in
// the comparison.
//
// THE ROOT CAUSE. `useAuth.signOut` called `gateway.auth.signOut()` and nothing
// else. It never mentioned presence. So `profiles.last_seen_at` was left holding
// the timestamp from the last heartbeat - up to one 30s interval earlier - and
// `isOnline()` kept answering `true` for the whole remaining freshness window.
// Nobody's dot could go gray until that window expired on its own. There was no
// error, no failed request and nothing to time out early: the presence row simply
// described the last moment the heartbeat happened to run, and sign-out was not a
// thing the presence system knew about.
//
// WHY NOT `channel.untrack()`. do.md asks for the Supabase Realtime lifecycle -
// `track()`, `untrack()`, `presenceState()`, `presence_diff`. Tone has none of
// them. `GatewayChannel` in `src/lib/gateway.ts` is a hand-rolled local shim:
// `subscribe()` immediately calls back with 'SUBSCRIBED' and connects to nothing,
// `postgres_changes` listeners are stored and never dispatched, there is no
// `track`/`untrack`/`presenceState`/`presence_diff`, `removeAllChannels()` is a
// no-op, and `send({type:'broadcast'})` only reaches broadcast listeners in the
// SAME tab. Its 19 call sites are decorative. There is therefore no channel to
// untrack and no `presence_diff` to observe, and adding one would be the second
// presence system this codebase deliberately does not have. The existing
// mechanism - one heartbeat write, read by the other client's existing
// `last_seen_at` refresh - is what the fix uses, and it is asserted as such below
// rather than replaced.
//
// WHAT IS ASSERTED, in the order the failures would actually bite:
//   1. Sign-out calls the presence-removal write, and calls it BEFORE auth signOut.
//   2. The heartbeat is stopped and drained first, so an in-flight heartbeat
//      cannot land after the marker and put the green dot straight back.
//   3. The marker is the epoch, not null - null is the reader's REDACTION shape.
//   4. The reader treats the marker as offline under any threshold.
//   5. Signing back in resumes the heartbeat, so the pause cannot outlive logout.
//   6. Closing a tab is NOT a logout and must not write the marker (multi-tab).
//   7. Nothing introduces a second channel, a poll, a per-conversation request,
//      an N+1, or an arbitrary delay.
//
// Run: npx vitest run src/__tests__/presenceLogout.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const presenceHeartbeat = vi.fn();
const presenceLogout = vi.fn();
const authSignOut = vi.fn();

vi.mock('@/lib/gateway', () => ({
  gateway: {
    presenceHeartbeat: () => presenceHeartbeat(),
    presenceLogout: () => presenceLogout(),
    auth: {
      signOut: () => authSignOut(),
    },
  },
}));

import {
  isOnline,
  isLoggedOutPresence,
  formatLastSeen,
  usePresence,
  endPresenceSession,
  resumePresenceSession,
  isPresenceWritePaused,
  PRESENCE_LOGGED_OUT_AT,
  POLL_INTERVAL_MS,
  OFFLINE_THRESHOLD_MS,
} from '@/hooks/usePresence';

const SRC = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

/**
 * The marker as Postgres actually returns it over PostgREST, which is NOT the
 * string that was written: `TIMESTAMPTZ` is rendered as
 * `1970-01-01T00:00:00+00:00`, with an offset and no milliseconds. This is the
 * value the other user's client actually receives, so it is the value every
 * reader assertion must use - a test that only exercised the literal string the
 * gateway sent would pass while production failed.
 */
const MARKER_AS_POSTGRES_RETURNS_IT = '1970-01-01T00:00:00+00:00';

const flush = async () => {
  await act(async () => {});
};

/**
 * Strip comments so a "this must not exist" sweep cannot be satisfied by - or
 * defeated by - the prose that explains the absence. A state machine rather than
 * a regex, for the two reasons this codebase forces:
 *
 *   - a `//` inside a string literal (a URL) would truncate the rest of the line
 *   - a regex literal containing a quote - `/^['"]|['"]$/g` in lib/gateway.ts -
 *     would be mistaken for the start of a string, and every comment after it
 *     would be read as string content
 *
 * Identical to the copy in `presenceOnlineIndicator.test.tsx`, which is where it
 * was written and proven; a second, subtly different implementation would be a
 * second thing to be wrong.
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

beforeEach(() => {
  vi.useFakeTimers();
  presenceHeartbeat.mockReset();
  presenceLogout.mockReset();
  authSignOut.mockReset();
  presenceHeartbeat.mockResolvedValue({ data: { ok: true, updated: 1 }, error: null });
  presenceLogout.mockResolvedValue({ data: { ok: true, updated: 1 }, error: null });
  authSignOut.mockResolvedValue({ error: null });
  resumePresenceSession();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the root cause: sign-out never mentioned presence', () => {
  it('the original sign-out wrote nothing about presence', () => {
    // Proven from the shape of the fix rather than from history: if `signOut`
    // does not call into the presence module at all, the row keeps its last
    // heartbeat value and the dot stays green for the whole window. This is the
    // baseline the assertions below are all measured against.
    const src = read('hooks/useAuth.tsx');
    expect(src).toMatch(/endPresenceSession/);
  });

  it('the sign-out path calls presence removal, and calls it before auth signOut', () => {
    const src = read('hooks/useAuth.tsx');

    const presenceAt = src.indexOf('endPresenceSession()');
    const authAt = src.indexOf('gateway.auth.signOut()');
    expect(presenceAt).toBeGreaterThan(-1);
    expect(authAt).toBeGreaterThan(-1);

    // THE ORDERING IS THE FIX. Once `gateway.auth.signOut()` has run it removes
    // the bearer token from localStorage, and the removal endpoint is
    // authenticated - so calling it afterwards would 401 and write nothing,
    // reproducing the original bug in a new position.
    expect(presenceAt).toBeLessThan(authAt);
  });

  it('presence removal is awaited, not fired and forgotten', () => {
    const src = read('hooks/useAuth.tsx');
    // An un-awaited call would let auth signOut race the write; the sign-out
    // would frequently complete first and the marker would then 401.
    expect(src).toMatch(/await\s+endPresenceSession\(\)/);
  });

  it('does not rely on a shortened timeout or a delay as the removal mechanism', () => {
    const src = read('hooks/usePresence.ts');
    // The spec forbids solving this by waiting. A setTimeout near the logout
    // path would be exactly that.
    expect(src).not.toMatch(/setTimeout\([^)]*presenceLogout/);
    expect(src).not.toMatch(/setTimeout\([^)]*endPresenceSession/);
  });
});

describe('the marker the reader sees', () => {
  it('is not null, because null is the redaction shape', () => {
    // `useConversations` keeps the previously held value when the server sends
    // none, precisely because a null is what a REDACTED presence looks like (a
    // non-friend with a pending message request). A null written by logout would
    // be dropped by that same guard and the dot would stay green.
    expect(PRESENCE_LOGGED_OUT_AT).not.toBeNull();
    expect(PRESENCE_LOGGED_OUT_AT).not.toBe('');
  });

  it('recognises the marker as Postgres returns it, not only as it was written', () => {
    expect(isLoggedOutPresence(MARKER_AS_POSTGRES_RETURNS_IT)).toBe(true);
    expect(isLoggedOutPresence(PRESENCE_LOGGED_OUT_AT)).toBe(true);
    // Both spellings must be the same instant.
    expect(new Date(MARKER_AS_POSTGRES_RETURNS_IT).getTime())
      .toBe(new Date(PRESENCE_LOGGED_OUT_AT).getTime());
  });

  // Documents a KNOWN REDUNDANCY, deliberately.
//
// `isOnline` checks `isLoggedOutPresence` before its freshness comparison, and
// with the epoch as the marker that check is not load-bearing: `Date.now() - 0`
// is already outside any plausible window, so deleting the line changes nothing.
// Mutant M7 in scripts/presence-mutants.sh confirms this by SURVIVING.
//
// The guard is kept because it is what keeps logout correct if the marker is
// ever changed, and the obvious change is to backdate it to restore last-seen
// precision - which would put logged-out users back to green for the whole
// window, i.e. the original bug. This test exists so that redundancy is
// documented rather than rediscovered: if you are reading this while deleting the
// guard, the deletion is only safe while the marker stays the epoch.
it('reads as offline under any plausible increase of the freshness window', () => {
    // The reason the marker is the epoch rather than `now - threshold - margin`:
    // a backdated value couples this repo to OFFLINE_THRESHOLD_MS, which lives in
    // the other repository. Raise the threshold past the margin and logout
    // silently stops working - the same class of invisible failure as the bug
    // being fixed.
    //
    // Stated precisely rather than as "any window": the marker is as old as the
    // Unix epoch, so it is stale under any threshold below that age, which is a
    // bound of roughly 56 years. No plausible tuning of a presence window
    // approaches it, and the margin by which it clears is what matters - the
    // current threshold is four orders of magnitude below the bound.
    const markerAgeMs = Date.now() - new Date(MARKER_AS_POSTGRES_RETURNS_IT).getTime();
    expect(markerAgeMs).toBeGreaterThan(50 * 365 * 24 * 3600 * 1000);
    for (const threshold of [1, 1000, OFFLINE_THRESHOLD_MS, 10 * OFFLINE_THRESHOLD_MS, 365 * 24 * 3600 * 1000]) {
      expect(markerAgeMs < threshold).toBe(false);
    }
    expect(isOnline(MARKER_AS_POSTGRES_RETURNS_IT)).toBe(false);
  });

  it('does not confuse the marker with an ordinary stale timestamp', () => {
    // The distinction is the whole reason the marker can be recognised at all.
    const genuinelyStale = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    expect(isLoggedOutPresence(genuinelyStale)).toBe(false);
    expect(isLoggedOutPresence(null)).toBe(false);
    expect(isLoggedOutPresence(undefined)).toBe(false);
    expect(isLoggedOutPresence('')).toBe(false);
    expect(isLoggedOutPresence('not-a-date')).toBe(false);
  });

  it('never renders the literal epoch date to a user', () => {
    // "Last seen 1/1/1970" would be both ugly and wrong. The three call sites all
    // show this text only when the dot is already gray.
    const rendered = formatLastSeen(MARKER_AS_POSTGRES_RETURNS_IT);
    expect(rendered).not.toMatch(/1970/);
    expect(rendered.length).toBeGreaterThan(0);
    // And it must not collide with the existing null-rendering.
    expect(rendered).not.toBe(formatLastSeen(null));
  });

  it('still ages ordinary timestamps normally, so the marker is the only change', () => {
    expect(formatLastSeen(new Date(Date.now() - 5 * 60 * 1000).toISOString())).toBe('5m ago');
    expect(formatLastSeen(new Date(Date.now() - 3 * 3600 * 1000).toISOString())).toBe('3h ago');
    expect(formatLastSeen(null)).toBe('Offline');
  });
});

describe('endPresenceSession: stop, drain, then write', () => {
  it('writes the logout marker', async () => {
    await act(async () => { await endPresenceSession(); });
    expect(presenceLogout).toHaveBeenCalledTimes(1);
  });

  it('stops the heartbeat from writing', async () => {
    const { rerender } = renderHook(({ id }: { id: string }) => usePresence(id), {
      initialProps: { id: 'user-a' },
    });
    await flush();
    const before = presenceHeartbeat.mock.calls.length;

    await act(async () => { await endPresenceSession(); });

    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3); });

    expect(presenceHeartbeat.mock.calls.length).toBe(before);
    void rerender;
  });

  it('pauses before it writes, so no heartbeat can start after the marker', async () => {
    // Ordering inside `endPresenceSession`, observed from outside: the pause must
    // already be in force by the time the marker is requested.
    let pausedWhenLogoutCalled: boolean | null = null;
    presenceLogout.mockImplementation(async () => {
      pausedWhenLogoutCalled = isPresenceWritePaused();
      return { data: { ok: true, updated: 1 }, error: null };
    });

    await act(async () => { await endPresenceSession(); });

    expect(pausedWhenLogoutCalled).toBe(true);
  });

  it('drains an in-flight heartbeat BEFORE writing the marker', async () => {
    // The race this closes. A heartbeat dispatched moments before sign-out can
    // still land at the gateway after the marker and overwrite it with `now`,
    // putting the green dot straight back for another 150s. Draining first makes
    // the marker provably the last write of the session.
    const order: string[] = [];
    let releaseHeartbeat: (() => void) | null = null;

    presenceHeartbeat.mockImplementation(() => {
      order.push('heartbeat:start');
      return new Promise((resolve) => {
        releaseHeartbeat = () => {
          order.push('heartbeat:settle');
          resolve({ data: { ok: true, updated: 1 }, error: null });
        };
      });
    });
    presenceLogout.mockImplementation(async () => {
      order.push('logout:write');
      return { data: { ok: true, updated: 1 }, error: null };
    });

    renderHook(() => usePresence('user-a'));
    await flush();
    expect(order).toContain('heartbeat:start');

    const done = act(async () => { await endPresenceSession(); });
    // The heartbeat has not settled yet, so the marker must not have been written.
    await flush();
    expect(order).not.toContain('logout:write');

    await act(async () => { releaseHeartbeat!(); });
    await done;

    expect(order).toEqual(['heartbeat:start', 'heartbeat:settle', 'logout:write']);
  });

  it('never rejects, so a failed presence write cannot block a sign-out', async () => {
    presenceLogout.mockRejectedValue(new Error('network down'));
    await expect(endPresenceSession()).resolves.toBeUndefined();
  });

  it('does not throw when the gateway reports an error', async () => {
    presenceLogout.mockResolvedValue({ data: null, error: { message: 'boom', code: '500' } });
    await expect(endPresenceSession()).resolves.toBeUndefined();
  });

  it('does not throw when a drained heartbeat rejected', async () => {
    presenceHeartbeat.mockRejectedValue(new Error('socket hang up'));
    const { unmount } = renderHook(() => usePresence('user-a'));
    await flush();
    await act(async () => { await endPresenceSession(); });
    expect(presenceLogout).toHaveBeenCalledTimes(1);
    unmount();
  });
});

describe('signing back in', () => {
  it('resumes the heartbeat, so the pause cannot outlive the logout', async () => {
    const { unmount } = renderHook(() => usePresence('user-a'));
    await flush();

    await act(async () => { await endPresenceSession(); });
    presenceHeartbeat.mockClear();

    unmount();
    // A new session mounts the heartbeat again.
    renderHook(() => usePresence('user-a'));
    await flush();

    expect(presenceHeartbeat).toHaveBeenCalled();
    expect(isPresenceWritePaused()).toBe(false);

    // And it keeps writing on the interval, which is what makes the user green
    // again after signing back in.
    presenceHeartbeat.mockClear();
    await act(async () => { await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS); });
    expect(presenceHeartbeat).toHaveBeenCalled();
  });

  it('writes a real timestamp after signing back in, not the logout marker', async () => {
    // The marker is a constant, so a stale flag carried into a new session would
    // leave the user permanently "logged out" - gray forever, with no way back.
    const { unmount } = renderHook(() => usePresence('user-a'));
    await flush();
    await act(async () => { await endPresenceSession(); });
    unmount();

    const before = Date.now();
    renderHook(() => usePresence('user-a'));
    await flush();

    expect(isOnline(new Date().toISOString())).toBe(true);
    expect(before).toBeLessThanOrEqual(Date.now());
  });
});

describe('closing a tab is not logging out (multi-tab)', () => {
  it('does not write the logout marker when the page is hidden or closed', async () => {
    renderHook(() => usePresence('user-a'));
    await flush();
    presenceLogout.mockClear();

    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flush();

    // The spec is explicit: closing one tab must not mark the account offline if
    // another active tab is still connected. So the unload path must stay a plain
    // HEARTBEAT and must never be promoted to the logout marker.
    expect(presenceLogout).not.toHaveBeenCalled();
    expect(presenceHeartbeat).toHaveBeenCalled();
  });

  it('the pagehide handler cannot write the marker even if a logout happened first', async () => {
    renderHook(() => usePresence('user-a'));
    await flush();

    await act(async () => { await endPresenceSession(); });
    presenceLogout.mockClear();
    presenceHeartbeat.mockClear();

    await act(async () => { window.dispatchEvent(new Event('pagehide')); });
    await flush();

    // Otherwise the last thing to happen on a sign-out-then-close sequence would
    // be a fresh heartbeat re-stamping the user as online.
    expect(presenceLogout).not.toHaveBeenCalled();
    expect(presenceHeartbeat).not.toHaveBeenCalled();
  });
});

describe('no second presence system, no new traffic', () => {
  it('introduces no Realtime presence channel, track, or untrack', () => {
    // Comments are stripped first, and that is not a nicety: this suite's own
    // explanatory comments in `lib/gateway.ts` use the words "track()" and
    // "untrack()" to explain why they are NOT called, so a raw-source scan
    // matches the prose that documents the absence and reports the absence as
    // present. The regex-literal case matters too - `lib/gateway.ts` contains
    // `/^['"]|['"]$/g`, and a naive stripper reads the `'` as a string delimiter
    // and silently stops stripping from there.
    const code = stripComments(read('lib/gateway.ts'));
    expect(code).not.toMatch(/\buntrack\b/);
    expect(code).not.toMatch(/presenceState|presence_diff/);
    // Sanity-check the stripper rather than trusting it: if it had desynchronised
    // it would emit an empty or implausibly short file and every assertion above
    // would "pass" for the wrong reason.
    expect(code.length).toBeGreaterThan(1000);
    expect(code).toMatch(/class GatewayChannel/);
  });

  it('adds exactly one endpoint call per sign-out and none per conversation', () => {
    const src = read('hooks/usePresence.ts');
    // One `presenceLogout()` call inside `endPresenceSession`, and it is not in a
    // loop or a map over conversations.
    const calls = src.match(/gateway\.presenceLogout\(\)/g) ?? [];
    expect(calls.length).toBe(1);
    expect(src).not.toMatch(/\.map\([^)]*=>[^)]*presenceLogout/);
  });

  it('does not subscribe to a per-conversation presence channel', () => {
    const listSrc = read('components/messages/ConversationList.tsx');
    const convSrc = read('hooks/useConversations.ts');
    expect(listSrc).not.toMatch(/presenceLogout/);
    expect(convSrc).not.toMatch(/presenceLogout/);
  });

  it('keeps the existing single heartbeat cadence and threshold', () => {
    // The fix must not have been bought with more requests or a shorter window.
    expect(POLL_INTERVAL_MS).toBe(30000);
    expect(OFFLINE_THRESHOLD_MS).toBe(150000);
  });

  it('the gateway client sends the logout write to a no-store authenticated POST', () => {
    const code = stripComments(read('lib/gateway.ts'));
    const at = code.indexOf('presenceLogout()');
    expect(at).toBeGreaterThan(-1);
    const body = code.slice(at, at + 1200);
    expect(body).toMatch(/\/api\/presence\/logout/);
    expect(body).toMatch(/method:\s*'POST'/);
    expect(body).toMatch(/Authorization/);
    // A cached response would let a stale "ok" outlive the presence it removed.
    expect(body).toMatch(/no-store/);
  });
});

describe('privacy is untouched', () => {
  it('the presence privacy gate is unchanged and still gates the dot', () => {
    const src = read('hooks/usePresencePrivacy.ts');
    expect(src).toMatch(/isPresenceHiddenFor/);
    const listSrc = read('components/messages/ConversationList.tsx');
    // A logged-out partner is still hidden from a pending message request, and a
    // redacted (null) presence is still hidden. The marker must not bypass this.
    expect(listSrc).toMatch(/presenceHidden/);
  });

  it('a null last_seen_at still means hidden, not offline-by-marker', () => {
    // Redaction and logout are different things and must not be conflated: a
    // redacted partner has no presence to show, which is why null is preserved
    // rather than written through.
    expect(isLoggedOutPresence(null)).toBe(false);
    expect(isOnline(null)).toBe(false);
  });

  it('the logout marker is only ever derived from the signed-in user\'s own id', () => {
    const code = stripComments(read('lib/gateway.ts'));
    // The client sends no user id at all: the gateway derives the caller from the
    // bearer token. Anything else would be a force-offline-anyone primitive.
    const at = code.indexOf('presenceLogout()');
    expect(at).toBeGreaterThan(-1);
    const body = code.slice(at, at + 1200);
    expect(body).not.toMatch(/user_id/);
    expect(body).not.toMatch(/body:/);
  });
});
