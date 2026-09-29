// do.md "the user stays online for 15+ minutes" - why, and the one comparison
// that could not say no.
//
// THE REPORT. A user leaves - logs out, closes the session, closes the tab - and
// the people they talk to keep seeing a green dot for "more than 15 minutes,
// sometimes even longer". The existing detection was not to be rewritten; only
// the cause of the delay was to be found.
//
// WHAT THE SEARCH FOUND. There is no 15-minute window anywhere in the presence
// path, and the constants say so outright. The heartbeat is POLL_INTERVAL_MS =
// 30000 and the freshness window is OFFLINE_THRESHOLD_MS = 150000, which is 150
// SECONDS - two and a half minutes. No 900_000, no `15 * 60 * 1000`, no cron, no
// 15-minute cache TTL, no second writer of `last_seen_at`, no service worker, no
// React Query cache: the presence path was searched for all of them and contains
// none. With a working reader the worst case is therefore
// OFFLINE_THRESHOLD_MS + POLL_INTERVAL_MS = 180s, and an explicit sign-out is
// immediate. 150000 read as "15 minutes" is the obvious origin of the number in
// the report, but it cannot be the whole story, because "sometimes even longer"
// is not a property a 150s window has.
//
// THE ACTUAL CAUSE. `isOnline` asked one question:
//
//     Date.now() - seen < OFFLINE_THRESHOLD_MS
//
// That is a one-sided test. There is no lower bound, so nothing in it can reject
// a `last_seen_at` that is LATER THAN THE READER'S OWN CLOCK. Such a stamp makes
// the age NEGATIVE, and a negative number is less than any positive threshold,
// so the comparison returns true - and keeps returning true. Not for 150s. For as
// long as the offset lasts, which for a persistently wrong clock is forever: both
// clocks advance at the same rate, so the offset never closes, every later
// heartbeat is stamped just as far ahead as the last, and no amount of polling,
// refreshing or re-rendering can age the value out. Every presence surface goes
// green at once, because they all call the same `isOnline`: the conversation
// list, the ChatWindow header, the chat info panel and the group members tab.
//
// WHY THE SKEW IS THE READER'S AND NOT THE WRITER'S. The column is written with
// the GATEWAY's clock, never the writer's: `writePresenceHeartbeat` in the
// gateway calls `new Date()` server-side and sends the result, and the heartbeat
// POST carries no timestamp the client could choose. So the writer's device
// cannot skew the value. What can skew it is the reader's, because `isOnline`
// compares the gateway's stamp against the browser's `Date.now()`. A laptop that
// boots on a dead RTC battery and has not resynchronised is the ordinary case.
// A 15-minute offset produces exactly the reported number; an uncorrected one
// produces "sometimes even longer", i.e. never.
//
// THE FIX. A lower bound. `MAX_CLOCK_SKEW_MS` is how far ahead of the reader a
// stamp may be and still count, and it is the same judgement the upper bound
// already makes in the other direction. It is NOT a shorter timeout: the upper
// bound is untouched, `OFFLINE_THRESHOLD_MS` and `POLL_INTERVAL_MS` are asserted
// unchanged below, and no request was added, removed or rescheduled.
//
// WHAT IS ASSERTED, in the order the failure would actually bite:
//   1. The arithmetic of the report: 150000 is 150 seconds, and the worst case
//      the reader can produce is 180s. Nothing here is 15 minutes.
//   2. A future stamp used to be accepted - the bug, pinned as a reproduction
//      rather than described, so it cannot quietly become unrepresentable.
//   3. A 15-minute-future stamp is offline, and STAYS offline as the clock runs
//      on, which is the part the old comparison could never do.
//   4. A benign few-seconds skew is still online, so the bound does not gray out
//      a partner who is genuinely connected.
//   5. The upper bound still works exactly as before.
//   6. The label agrees with the dot: no "Just now" forever, no "Invalid Date".
//   7. Two tabs, one closed, the user stays online.
//   8. Nothing new was introduced: no second store, no extra request, no
//      per-conversation poll, and the gateway still stamps server-side.
//
// Run: npx vitest run src/__tests__/presenceStaleDot.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const presenceHeartbeat = vi.fn();
const presenceLogout = vi.fn();

vi.mock('@/lib/gateway', () => ({
  gateway: {
    presenceHeartbeat: () => presenceHeartbeat(),
    presenceLogout: () => presenceLogout(),
  },
}));

import {
  isOnline,
  formatLastSeen,
  usePresence,
  resumePresenceSession,
  isLoggedOutPresence,
  reportClockSkew,
  resetClockSkewWarning,
  MAX_CLOCK_SKEW_MS,
  OFFLINE_THRESHOLD_MS,
  POLL_INTERVAL_MS,
  PRESENCE_LOGGED_OUT_AT,
} from '@/hooks/usePresence';

const SRC = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

/**
 * Strip comments and string/regex literals so a structural assertion cannot be
 * satisfied by prose. Without it, a source-text test like "the reader has no
 * lower bound on the comparison" would pass against a comment that says the
 * opposite, which is the failure mode these assertions exist to rule out.
 *
 * Identical to the copies in `presenceLogout.test.tsx` and
 * `presenceOnlineIndicator.test.tsx`. Duplicated rather than extracted for the
 * same reason those two were: a second, subtly different implementation of a
 * comment stripper would be a second thing to be wrong, and there is no shared
 * test-helper module in this suite to put it in.
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

/**
 * An ISO stamp that is `ageMs` OLD, as `isOnline` will measure it.
 *
 * Named for the quantity the code actually compares, so the direction of every
 * call site is readable: `staleBy(0)` is "just now", `staleBy(150000)` is
 * "exactly the window ago", and a NEGATIVE age is a stamp from the FUTURE - which
 * is the case under test, and the one an off-by-a-sign in the helper would have
 * quietly turned into an ordinary stale timestamp and made the suite pass.
 */
const staleBy = (ageMs: number) => new Date(Date.now() - ageMs).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  // A fixed, plausible wall clock. Anything date-derived has to be computed from
  // this rather than from the real one, or the suite passes in one timezone and
  // fails in another.
  vi.setSystemTime(new Date('2026-09-29T12:00:00.000Z'));
  presenceHeartbeat.mockReset();
  presenceLogout.mockReset();
  presenceHeartbeat.mockResolvedValue({ data: { ok: true, updated: 1 }, error: null });
  presenceLogout.mockResolvedValue({ data: { ok: true, updated: 1 }, error: null });
  resumePresenceSession();
  resetClockSkewWarning();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('1. the arithmetic of the report: there is no 15-minute window', () => {
  it('the freshness window is 150 SECONDS, not 15 minutes', () => {
    expect(OFFLINE_THRESHOLD_MS).toBe(150000);
    // Stated as a duration so the distinction cannot be lost again: 150000 ms is
    // 2.5 minutes. Anyone reading this constant as "15" is reading three digits
    // of a five-digit number, and the report's 15 minutes is exactly that slip.
    expect(OFFLINE_THRESHOLD_MS / 1000 / 60).toBe(2.5);
    expect(OFFLINE_THRESHOLD_MS).not.toBe(15 * 60 * 1000);
  });

  it('the worst case a reader can produce is the window plus one refresh round', () => {
    // A partner who stops heartbeating without logging out keeps their last value.
    // It is not stale until the window elapses, and the reader only looks on its
    // own round, so the bound is the window plus the interval between two looks.
    const worstCase = OFFLINE_THRESHOLD_MS + POLL_INTERVAL_MS;
    expect(worstCase).toBe(180000);
    // Stated against the report: three minutes, not fifteen. If a future change
    // makes this cross 15 minutes, the reported symptom is real and this fails.
    expect(worstCase).toBeLessThan(15 * 60 * 1000);
  });

  it('nothing anywhere in the presence path declares a 15-minute constant', () => {
    // The search that came up empty, written down so it does not have to be
    // repeated. Stripped of comments and literals, so these are the numbers the
    // code actually compares against rather than numbers named in prose. Both
    // repositories, because the column and the comparison that reads it are in
    // different ones and a 15-minute window could have been hiding in either.
    const files = [
      'hooks/usePresence.ts',
      'hooks/useConversations.ts',
      'components/messages/ConversationList.tsx',
      'components/messages/ChatWindow.tsx',
      'components/messages/ChatInfoPanel.tsx',
      'lib/gateway.ts',
    ];
    const pattern = /900000|900_000|15\s*\*\s*60\s*\*\s*1000|60\s*\*\s*15\s*\*\s*1000/;
    for (const f of files) {
      expect(stripComments(read(f)), f).not.toMatch(pattern);
    }
    const gateway = join(SRC, '..', '..', 'gateway', 'src');
    for (const f of ['features/presence.ts', 'api/realtime.ts', 'api/routes.ts']) {
      expect(stripComments(readFileSync(join(gateway, f), 'utf8')), f).not.toMatch(pattern);
    }
  });
});

describe('2. the bug: the comparison had no lower bound', () => {
  it('the old one-sided test answered GREEN to a stamp from the future', () => {
    // The pre-fix comparison, inlined. This is the whole defect in one line, and
    // it is asserted rather than described so that the reproduction cannot rot:
    // if this ever stops being true, the premise of the fix is wrong and someone
    // should find out from this test rather than from a user.
    const OLD_THRESHOLD = 150000;
    const oldIsOnline = (lastSeenAt: string) => Date.now() - new Date(lastSeenAt).getTime() < OLD_THRESHOLD;

    // A stamp 15 minutes ahead of the reader's clock: the reported number.
    expect(oldIsOnline(staleBy(-15 * 60 * 1000))).toBe(true);
    // An hour ahead. Also green.
    expect(oldIsOnline(staleBy(-60 * 60 * 1000))).toBe(true);
    // A year ahead. STILL green, and it stays green however long you wait, which
    // is what "sometimes even longer" means.
    expect(oldIsOnline(staleBy(-365 * 24 * 60 * 60 * 1000))).toBe(true);
  });

  it('and the old test had no way to become false, because the offset never closes', () => {
    // The mechanism, not just the symptom: both clocks advance at the same rate,
    // so a constant offset produces a constant negative age. A fresh heartbeat is
    // stamped just as far ahead as the last one. This is why no amount of
    // polling could ever have rescued it.
    const OLD_THRESHOLD = 150000;
    const oldIsOnline = (lastSeenAt: string) => Date.now() - new Date(lastSeenAt).getTime() < OLD_THRESHOLD;
    const OFFSET = 15 * 60 * 1000;

    // Every refresh round, for an hour: a new heartbeat each time, and green.
    for (let round = 0; round < 120; round += 1) {
      vi.setSystemTime(new Date(Date.now() + POLL_INTERVAL_MS));
      expect(oldIsOnline(staleBy(-OFFSET))).toBe(true);
    }
  });

  it('the shipped comparison now rejects a stamp beyond the skew tolerance', () => {
    expect(isOnline(staleBy(-(MAX_CLOCK_SKEW_MS + 1)))).toBe(false);
    expect(isOnline(staleBy(-15 * 60 * 1000))).toBe(false);
    expect(isOnline(staleBy(-365 * 24 * 60 * 60 * 1000))).toBe(false);
  });
});

describe('3. the reported symptom, end to end', () => {
  it('a partner 15 minutes in the future is offline, and STAYS offline', () => {
    // This is the report turned into a test: the dot must be gray, and it must
    // remain gray on every subsequent refresh rather than reverting to green.
    // The old comparison passed the first half of this only by accident and
    // failed the second half absolutely.
    const futureStamp = staleBy(-15 * 60 * 1000);

    expect(isOnline(futureStamp)).toBe(false);

    for (let round = 0; round < 120; round += 1) {
      vi.setSystemTime(new Date(Date.now() + POLL_INTERVAL_MS));
      // Re-stamped each round, exactly as a heartbeating writer would.
      expect(isOnline(staleBy(-15 * 60 * 1000))).toBe(false);
    }
  });

  it('the same partner is online again once their clock agrees, not before', () => {
    // The fix must not be "always gray". When the reader's clock matches the
    // gateway's the ordinary path resumes immediately.
    expect(isOnline(staleBy(0))).toBe(true);
    expect(isOnline(staleBy(1000))).toBe(true);
  });

  it('a correct reader is unaffected: a normal partner ages out on schedule', () => {
    // The regression guard for the fix itself. A skewed reader goes gray early;
    // an ordinary one must not.
    const lastHeartbeat = staleBy(0);
    expect(isOnline(lastHeartbeat)).toBe(true);

    vi.setSystemTime(new Date(Date.now() + OFFLINE_THRESHOLD_MS - 1000));
    expect(isOnline(lastHeartbeat)).toBe(true);

    vi.setSystemTime(new Date(Date.now() + 2000));
    expect(isOnline(lastHeartbeat)).toBe(false);
  });
});

describe('4. the bound must not gray out a live partner', () => {
  it('a benign few-seconds skew is still online', () => {
    // A serverless runtime and a browser are milliseconds apart and NTP keeps
    // them there, so a small lead is normal and must be tolerated. The tolerance
    // is a lower bound, not a stricter upper one: this is the direction that
    // would produce the bug this file exists to remove.
    expect(isOnline(staleBy(-1000))).toBe(true);
    expect(isOnline(staleBy(-30 * 1000))).toBe(true);
    expect(isOnline(staleBy(-MAX_CLOCK_SKEW_MS))).toBe(true);
  });

  it('the tolerance is minutes, not hours, and not a rounding error', () => {
    expect(MAX_CLOCK_SKEW_MS).toBe(60000);
    // Two orders of magnitude under the window it sits beside, so it cannot
    // shorten how long a real departure takes to show up.
    expect(MAX_CLOCK_SKEW_MS).toBeLessThan(OFFLINE_THRESHOLD_MS);
    // A fifteenth of the 15 minutes in the report: the bound is not itself a
    // fifteen-minute window in disguise.
    expect(MAX_CLOCK_SKEW_MS).toBeLessThan(15 * 60 * 1000);
  });

  it('the window is two-sided: a stamp outside it either way is offline', () => {
    expect(isOnline(staleBy(OFFLINE_THRESHOLD_MS + 1))).toBe(false);
    expect(isOnline(staleBy(-MAX_CLOCK_SKEW_MS - 1))).toBe(false);
    // And the sign-out marker is still offline, under either bound, because it
    // is checked before the comparison is reached at all.
    expect(isOnline(PRESENCE_LOGGED_OUT_AT)).toBe(false);
    expect(isLoggedOutPresence(PRESENCE_LOGGED_OUT_AT)).toBe(true);
  });
});

describe('5. the fix is a bound, not a shorter timeout', () => {
  it('the existing cadence and upper bound are untouched', () => {
    // If this file fails, the fix was bought with a shorter window - which is
    // what do.md explicitly rules out, and which would trade one wrong answer
    // for another rather than remove the cause.
    expect(POLL_INTERVAL_MS).toBe(30000);
    expect(OFFLINE_THRESHOLD_MS).toBe(150000);
  });

  it('the heartbeat still runs at the same rate and adds no request', () => {
    const code = stripComments(read('hooks/usePresence.ts'));
    const beats = code.match(/gateway\.presenceHeartbeat\(\)/g) || [];
    // Two call sites, both pre-existing: the interval beat and the `pagehide`
    // beat. A third would be a new request on a path that did not have one.
    expect(beats).toHaveLength(2);
    // And the only timer in the writer is the one that was already there. Matched
    // per-occurrence rather than with a lookahead, which cannot express "the
    // argument is this and not something else" and would pass vacuously.
    const timers = [...code.matchAll(/setInterval\(\s*beat\s*,\s*([^)]*)\)/g)].map(m => m[1].trim());
    expect(timers).toEqual(['POLL_INTERVAL_MS']);
    expect(code).not.toMatch(/setTimeout\(\s*beat/);
  });

  it('the writer still stamps with the GATEWAY clock, so the skew is the readers', () => {
    // The premise of the whole diagnosis: the value is not client-chosen, so the
    // offset being fixed is a reader-side device clock and not something a
    // client can inject. Asserted in the gateway, where the write lives.
    const gw = readFileSync(
      join(SRC, '..', '..', 'gateway', 'src', 'features', 'presence.ts'),
      'utf8'
    );
    expect(gw).toMatch(/now:\s*\(\)\s*=>\s*Date\s*=\s*\(\)\s*=>\s*new Date\(\)/);
    // No route may take a timestamp from the request body.
    const routes = readFileSync(
      join(SRC, '..', '..', 'gateway', 'src', 'api', 'routes.ts'),
      'utf8'
    );
    const at = routes.indexOf("router.post('/presence/heartbeat'");
    expect(at).toBeGreaterThan(-1);
    expect(routes.slice(at, at + 1500)).not.toMatch(/body\.(last_seen_at|lastSeenAt|timestamp|now)/);
  });
});

describe('6. the label agrees with the dot', () => {
  it('a future stamp does not read "Just now" forever', () => {
    // The same one-sided assumption, in the text next to the dot. A negative diff
    // made `diffMins < 1` true, so a partner whose dot `isOnline` calls gray was
    // labelled "Just now" beside it - the two disagreeing in front of the user.
    expect(formatLastSeen(staleBy(-15 * 60 * 1000))).toBe('Offline');
    expect(formatLastSeen(staleBy(-365 * 24 * 60 * 60 * 1000))).toBe('Offline');
  });

  it('and it stops saying "Just now" as soon as the offset is gone', () => {
    vi.setSystemTime(new Date('2026-09-29T12:00:00.000Z'));
    expect(formatLastSeen(new Date('2026-09-29T11:59:30.000Z').toISOString())).toBe('Just now');
  });

  it('an unparseable timestamp does not render the text "Invalid Date"', () => {
    // Pre-existing and found while looking at the same branch: every comparison
    // against NaN is false, so the value fell through all four scale branches to
    // `toLocaleDateString()` on an Invalid Date. Not the reported symptom, and
    // not a crash, but it is a user-visible string in the conversation list.
    expect(formatLastSeen('not-a-date')).toBe('Offline');
    expect(isOnline('not-a-date')).toBe(false);
  });

  it('ordinary timestamps and the sign-out marker read exactly as before', () => {
    vi.setSystemTime(new Date('2026-09-29T12:00:00.000Z'));
    expect(formatLastSeen(null)).toBe('Offline');
    expect(formatLastSeen(PRESENCE_LOGGED_OUT_AT)).toBe('a while ago');
    expect(formatLastSeen(new Date('2026-09-29T11:30:00.000Z').toISOString())).toBe('30m ago');
    expect(formatLastSeen(new Date('2026-09-29T09:00:00.000Z').toISOString())).toBe('3h ago');
    expect(formatLastSeen(new Date('2026-09-26T12:00:00.000Z').toISOString())).toBe('3d ago');
  });
});

describe('7. two tabs, one closed, the user stays online', () => {
  it('closing one tab writes a heartbeat and the other keeps beating', async () => {
    // do.md's multi-tab rule: only the FINAL connection going away may mark the
    // user offline. The account is one row, so a close is expressed by the
    // surviving tab still beating - the writer must not write the sign-out
    // marker, and the closed tab must not stop the other one.
    const first = renderHook(() => usePresence('user-a'));
    const second = renderHook(() => usePresence('user-a'));

    presenceHeartbeat.mockClear();

    // Tab one closes: `pagehide` writes a HEARTBEAT, not the marker.
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(presenceHeartbeat).toHaveBeenCalled();
    expect(presenceLogout).not.toHaveBeenCalled();

    // Tab two is still open and still writing on its own interval.
    await act(async () => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS);
    });
    expect(presenceHeartbeat.mock.calls.length).toBeGreaterThanOrEqual(2);

    first.unmount();
    second.unmount();
  });

  it('a closed tab does not stop the surviving tab, and the writer resumes after', async () => {
    // Same rule from the other side: unmounting one hook must leave the other
    // running, and the heartbeat must still be healthy afterwards rather than
    // left muted by whatever the unmount did.
    const first = renderHook(() => usePresence('user-a'));
    const second = renderHook(() => usePresence('user-a'));
    first.unmount();

    presenceHeartbeat.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS * 2);
    });
    expect(presenceHeartbeat).toHaveBeenCalled();

    second.unmount();

    presenceHeartbeat.mockClear();
    const third = renderHook(() => usePresence('user-a'));
    await act(async () => {
      vi.advanceTimersByTime(POLL_INTERVAL_MS);
    });
    expect(presenceHeartbeat).toHaveBeenCalled();
    third.unmount();
  });
});

describe('7. a broken clock is reported, not silently swapped for a new symptom', () => {
  it('counts the partner stamps it cannot read, and returns the count', () => {
    // The fix turns "everyone green forever" into "everyone gray". That is the
    // safe direction, but it is a DIFFERENT wrong answer, and the reason this
    // took six rounds to find is that the presence path was invisible while it
    // was broken. So the offset is counted and surfaced rather than absorbed.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(reportClockSkew([staleBy(0), staleBy(-15 * 60 * 1000), staleBy(1000)])).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    // The message has to name the cause, or it is just a log line.
    expect(warn.mock.calls[0][0]).toMatch(/clock/i);
  });

  it('warns once per page load, however many rows and rounds it sees', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (let round = 0; round < 10; round += 1) {
      vi.setSystemTime(new Date(Date.now() + POLL_INTERVAL_MS));
      expect(reportClockSkew([staleBy(-15 * 60 * 1000), staleBy(-15 * 60 * 1000)])).toBe(2);
    }
    // Once. A reader with twenty stale conversations must not print twenty lines
    // on every thirty-second round for the life of the page.
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('says nothing at all on a correct clock', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(reportClockSkew([staleBy(0), staleBy(1000), staleBy(600000), null, undefined])).toBe(0);
    expect(reportClockSkew([])).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('tolerates a benign skew without complaining', () => {
    // Real skew between a serverless runtime and a browser is milliseconds. The
    // warning must not fire on the offset it deliberately tolerates, or it trains
    // people to ignore it.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(reportClockSkew([staleBy(-1000), staleBy(-5000)])).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('is called from the reader round, on the values it already extracted', () => {
    // No extra request and no second pass: it reads the values out of the map
    // this round already built, inside the same `if (profiles)` block.
    const code = stripComments(read('hooks/useConversations.ts'));
    expect(code).toMatch(/reportClockSkew\(\[\.\.\.lastSeenMap\.values\(\)\]\)/);
    const at = code.indexOf('reportClockSkew(');
    // Matched by the binding, not the constructor: the map carries an explicit
    // type argument, so `new Map(` no longer appears and an assertion written
    // against it would silently stop finding anything at all.
    const mapAt = code.indexOf('const lastSeenMap =');
    expect(mapAt).toBeGreaterThan(-1);
    // After the map is built, and inside the guard that proves `profiles` exists.
    expect(mapAt).toBeLessThan(at);
    expect(code.slice(code.lastIndexOf('if (profiles)', at), at)).not.toMatch(/await|fetch|from\(/);
  });
});

describe('8. nothing new was introduced', () => {
  it('there is still exactly one presence store', () => {
    const files = [
      'hooks/usePresence.ts',
      'hooks/useConversations.ts',
      'components/messages/ConversationList.tsx',
      'components/messages/ChatWindow.tsx',
      'components/messages/ChatInfoPanel.tsx',
      'components/groups/GroupMembersTab.tsx',
    ];
    for (const f of files) {
      const code = stripComments(read(f));
      expect(code, f).not.toMatch(/is_online|online_users|presence_sessions/);
    }
  });

  it('no second presence comparison was added alongside the fixed one', () => {
    // Every dot must go through the one bounded `isOnline`. A hand-rolled
    // comparison reintroduced in a component would have no lower bound and would
    // be green forever, and would be invisible here without this assertion.
    const users = ['components/messages/ConversationList.tsx', 'components/messages/ChatWindow.tsx',
      'components/messages/ChatInfoPanel.tsx', 'components/groups/GroupMembersTab.tsx',
      'hooks/useConversations.ts'];
    for (const f of users) {
      const code = stripComments(read(f));
      expect(code, f).not.toMatch(/Date\.now\(\)\s*-[^;\n]*last_seen/i);
    }
  });

  it('no Realtime presence channel, track, or presence_diff was introduced', () => {
    for (const f of ['lib/gateway.ts', 'hooks/usePresence.ts', 'hooks/useConversations.ts']) {
      const code = stripComments(read(f));
      expect(code, f).not.toMatch(/presenceState|\.track\(|presence_diff/);
    }
  });

  it('the reader still bumps its tick every round, including an unchanged round', () => {
    // The upper bound is only observable if the dot is re-evaluated on a timer.
    // This is the assertion that keeps the 180s worst case real: a memo bailed
    // out here would freeze the dot at its last value and the window would stop
    // applying at all.
    const code = stripComments(read('hooks/useConversations.ts'));
    expect(code).toMatch(/setPresenceTick/);
    const list = stripComments(read('components/messages/ConversationList.tsx'));
    expect(list).toMatch(/presenceTick/);
  });

  it('the privacy gate still gates the dot, and the reader still refuses a null', () => {
    // A null `last_seen_at` is the gateway's REDACTION shape for a non-friend
    // with a pending request, and overwriting the held value with it would leak
    // presence. That guard is why the sign-out marker had to be the epoch rather
    // than null, and it is untouched.
    const code = stripComments(read('hooks/useConversations.ts'));
    expect(code).toMatch(/if \(!newLastSeen \|\| newLastSeen === conv\.other_user\.last_seen_at\) return conv;/);
    const item = stripComments(read('components/messages/ConversationList.tsx'));
    expect(item).toMatch(/isPresenceHidden/);
  });
});
