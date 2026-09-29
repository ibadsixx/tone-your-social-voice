import { useEffect, useRef } from 'react';
import { gateway } from '@/lib/gateway';

// Presence (do.md "online presence indicator").
//
// The indicator is `profiles.last_seen_at` compared against a freshness window,
// and this file is the WRITE side of that. It used to call the database function
// `update_last_seen()` through `gateway.rpc`, which resolved the row with
// `WHERE id = auth.uid()` and updated zero rows without reporting an error. The
// consequence was silent and total: in production 28 of 29 profiles had
// `last_seen_at` exactly equal to `created_at` (the column's INSERT default), so
// every user has always been "offline" and the conversation dot was permanently
// gray. The write now goes through `POST /api/presence/heartbeat`, which the
// gateway answers from the verified bearer token and a service-role write.
//
// This is deliberately the SAME presence store the reader already uses. There is
// no second presence system, and no parallel `is_online` column: the dot, the
// ChatWindow header, ChatInfoPanel and the existing group-chat count all read
// `last_seen_at`, so repairing the writer repairs all of them at once and the
// group-chat behaviour in `fetchGroupOnlineCounts` is unchanged.

/**
 * How often the signed-in user refreshes their own `last_seen_at`.
 *
 * Unchanged from the original 30s. There is no Realtime presence in Tone to
 * replace it: `GatewayChannel` is a local shim whose `subscribe()` connects to
 * nothing and which implements neither `track()` nor `presenceState()`, so a
 * heartbeat is the architecture that actually exists. One request per 30s per
 * signed-in tab, for a single indexed row, is the whole cost.
 */
export const POLL_INTERVAL_MS = 30000;

/**
 * How stale `last_seen_at` may be before the user counts as offline.
 *
 * Raised from 60s to 150s, and the reason is a real browser behaviour rather
 * than a preference. A background tab has its timers throttled to roughly once
 * per minute by Chrome, and once it has been backgrounded for five minutes,
 * "intensively" throttled to the same rate. A 30s interval therefore fires about
 * every 60s in a background tab, which sits exactly on the old 60s boundary -
 * so a user with the tab simply sitting open in another window would drift
 * across the threshold and flip to a gray dot while genuinely connected. That is
 * the same class of bug as the one being fixed, in the opposite direction, and it
 * is why the threshold has to clear the throttled interval with margin rather
 * than match the foreground one.
 *
 * The cost is a longer worst case for noticing a departure: up to 150s after the
 * last heartbeat instead of 60s. Offline is time-based rather than event-based
 * (there is no disconnect signal to receive, because there is no live
 * connection), so this is the only dial, and 150s is the shortest window that
 * survives throttling without an extra request per minute per tab.
 */
export const OFFLINE_THRESHOLD_MS = 150000;

/**
 * The value `profiles.last_seen_at` is set to when a user explicitly logs out.
 *
 * MUST stay byte-equal to `PRESENCE_LOGGED_OUT_AT` in `gateway/src/features/
 * presence.ts`. The two are in different repositories, so there is no shared
 * constant to import, and there is no runtime negotiation either - the gateway
 * answers the POST with the value it wrote, but the OTHER user's client reads the
 * raw column and has to recognise the marker on its own. A gateway deploy that
 * changed this without the frontend would silently degrade to "logged-out users
 * show as offline only after the freshness window", which is the original bug.
 *
 * It is the Unix epoch rather than `null` for reasons that are spelled out at
 * length on the gateway constant. The two that matter here:
 *
 *   - `null` cannot be used, because the presence refresh in `useConversations`
 *     deliberately keeps the previously held value when the server sends none -
 *     that is the shape a REDACTED presence has for a non-friend with a pending
 *     message request, and overwriting it would leak presence the privacy rules
 *     require be withheld. A null written by logout is dropped by that same
 *     guard, so the dot would stay green.
 *   - `null` also means `formatLastSeen` prints "Offline", discarding the real
 *     last-seen time.
 *
 * Recognition is by PARSED TIME, never by string equality: Postgres renders
 * `TIMESTAMPTZ` as `1970-01-01T00:00:00+00:00`, which is not this string, and
 * every representation of the epoch parses to exactly 0.
 */
export const PRESENCE_LOGGED_OUT_AT = '1970-01-01T00:00:00.000Z';

/**
 * Whether a `last_seen_at` value is the explicit sign-out marker.
 *
 * Separate from `isOnline` so that "offline because they left" stays
 * distinguishable from "offline because they were last seen 4 hours ago", which
 * is the only reason the marker can be recognised at all - a freshness
 * comparison cannot tell those two apart.
 */
export function isLoggedOutPresence(lastSeenAt?: string | null): boolean {
  if (!lastSeenAt) return false;
  const seen = new Date(lastSeenAt).getTime();
  return !Number.isNaN(seen) && seen === new Date(PRESENCE_LOGGED_OUT_AT).getTime();
}

/**
 * Whether a `last_seen_at` value means the user is currently connected.
 *
 * Read during render, so it re-evaluates on every render of the conversation
 * list. The list refreshes presence on its own interval and calls
 * `setConversations` with a fresh array each time even when no timestamp moved,
 * which is what guarantees the "ageing out to offline" transition is noticed
 * without a new value arriving from the server.
 */
export function isOnline(lastSeenAt?: string | null): boolean {
  if (!lastSeenAt) return false;
  // The explicit sign-out marker is offline by definition, and is checked before
  // the freshness comparison so the answer does not depend on how
  // OFFLINE_THRESHOLD_MS is tuned at all. With the epoch as the value it would
  // fail the comparison anyway, but stating it makes the independence structural
  // rather than a coincidence between two constants in two repositories.
  if (isLoggedOutPresence(lastSeenAt)) return false;
  const seen = new Date(lastSeenAt).getTime();
  // An unparseable value is treated as offline rather than as "now". Reading
  // NaN in a comparison yields false, so this is already the safe branch, but
  // stating it keeps the intent from being "reversed" by a later edit.
  if (Number.isNaN(seen)) return false;
  return Date.now() - seen < OFFLINE_THRESHOLD_MS;
}

export function formatLastSeen(lastSeenAt?: string | null): string {
  if (!lastSeenAt) return 'Offline';
  // "Last seen a while ago", not the literal date the epoch would otherwise
  // render as: the three call sites all show this text only when the dot is
  // already gray, and one of them prefixes it with "Last seen", where "Last seen
  // 1/1/1970" would be both ugly and wrong. The precision the marker gives up is
  // restored by the first heartbeat after the user signs back in.
  if (isLoggedOutPresence(lastSeenAt)) return 'a while ago';

  const lastSeen = new Date(lastSeenAt);
  const now = new Date();
  const diffMs = now.getTime() - lastSeen.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return lastSeen.toLocaleDateString();
}

/**
 * Module-level switch that stops the heartbeat writing.
 *
 * It is module-level rather than React state on purpose. The logout sequence in
 * `useAuth.signOut` must be able to stop the heartbeat and then await the
 * in-flight requests BEFORE writing the logout marker, and it does that from a
 * plain async function outside React's render/effect cycle. Routing that through
 * state would mean the effect re-runs asynchronously and `signOut` could not know
 * whether the stop had taken effect yet - which is the race that leaves a
 * logged-out user green.
 *
 * The heartbeat's own lifecycle still owns mount/unmount; this only covers the
 * interval between "sign-out requested" and "sign-in again", which is exactly the
 * window in which no presence write may happen.
 */
let presenceWritePaused = false;

/**
 * Remove this session's presence because the user is signing out.
 *
 * Three ordered steps, and the order is the fix:
 *
 *   1. PAUSE, so the heartbeat stops writing.
 *   2. DRAIN, so writes already dispatched have settled. Without this, a
 *      heartbeat sent moments before sign-out can still land at the gateway
 *      AFTER the marker and overwrite it with `now`, putting the green dot
 *      straight back for another full freshness window. Draining makes the marker
 *      provably the last write of the session rather than probably the last.
 *   3. WRITE the marker, while the bearer token is still valid.
 *
 * Step 3 must precede `auth.signOut()`, which removes the token from localStorage
 * and would make this call 401. Hence the whole thing lives here, called from
 * `useAuth.signOut` before the auth call, and not in a `useEffect` cleanup - a
 * cleanup runs after `setUser(null)`, by which point there is no token and no
 * authenticated caller id to write for.
 *
 * There is no `untrack()` to call: Tone has no Realtime presence channel. See the
 * note on `gateway.presenceLogout` for what exists instead.
 *
 * NEVER REJECTS. A presence write that fails must not prevent a sign-out - the
 * user asked to leave, and holding them in the app because a cosmetic row did not
 * update would be a far worse failure than a green dot that outlives its user.
 */
export async function endPresenceSession(): Promise<void> {
  presenceWritePaused = true;
  // Two passes, because `beat()` is re-entrant through the visibility/focus
  // listeners: one drain could observe a set that grew while it awaited. Bounded
  // at two rather than looped, because the pause means the set can only shrink -
  // an unbounded loop here would be a hang on the sign-out path.
  await drainPresenceWrites();
  await drainPresenceWrites();

  try {
    const { error } = await gateway.presenceLogout();
    if (error) {
      // Worth a log but not worth failing the sign-out. This is also the one
      // place a failure is visible at all: previously a logout wrote nothing and
      // reported nothing, which is exactly why the bug was invisible.
      console.warn('[presence] logout marker failed:', error.message);
    }
  } catch (err) {
    console.warn('[presence] logout marker threw:', String(err));
  }
}

/**
 * Re-allow the heartbeat to write. Called when a session starts, so the pause
 * cannot outlive the sign-out that set it and leave the user permanently offline
 * after signing back in.
 */
export function resumePresenceSession(): void {
  presenceWritePaused = false;
}

/** Whether the heartbeat is currently paused. Exported for assertions. */
export function isPresenceWritePaused(): boolean {
  return presenceWritePaused;
}

const inFlightPresenceWrites = new Set<Promise<unknown>>();

function trackPresenceWrite<T>(p: Promise<T>): Promise<T> {
  inFlightPresenceWrites.add(p);
  const forget = () => inFlightPresenceWrites.delete(p);
  p.then(forget, forget);
  return p;
}

async function drainPresenceWrites(): Promise<void> {
  // `Promise.all` over the live set, with a per-item catch: a write that rejects
  // must not stop the drain.
  await Promise.all(
    [...inFlightPresenceWrites].map((p) => p.catch(() => undefined))
  );
}

/**
 * Keep the signed-in user's `last_seen_at` fresh for as long as they are
 * connected to Tone. Mounted once, above the router (see
 * `components/presence/PresenceHeartbeat.tsx`) rather than inside a page,
 * because presence describes the session and not the screen: with the old
 * page-scoped mount, navigating from Messages to Home stopped the heartbeat and
 * made the user go gray to everyone while they were plainly still there.
 *
 * The userId argument is retained so the hook stays independent of `useAuth`
 * and directly testable; the mount point supplies it.
 */
export function usePresence(userId?: string | null) {
  // Guards against logging the same failure on every tick, and records the last
  // outcome so a broken heartbeat is diagnosable rather than silent. The previous
  // implementation discarded the result entirely, which is why a write path that
  // had never once succeeded produced no signal anywhere.
  const lastResultRef = useRef<'ok' | 'no-profile-row' | 'error' | null>(null);

  useEffect(() => {
    if (!userId) return;

    // A session starting clears any pause left behind by a previous sign-out.
    // Without this, signing back in would leave the heartbeat permanently muted
    // and the user would never go green again - the exact regression that makes
    // it tempting to gate the heartbeat on a flag in the first place. Placed here
    // rather than in the render body so that React's render phase stays free of
    // side effects, and before the first `beat()` below so the very first
    // heartbeat of a new session is not suppressed by a stale flag.
    presenceWritePaused = false;

    let cancelled = false;

    const beat = () => {
      if (cancelled) return;
      // Checked again here, not only at mount: `endPresenceSession` runs while
      // this effect is still live, and the interval is still ticking until
      // React tears the effect down after the auth state change propagates.
      if (presenceWritePaused) return;
      const write = trackPresenceWrite(gateway.presenceHeartbeat());
      write.then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // 401 is the expected outcome right after sign-out or an expired
          // session, and is not a fault worth logging every 30 seconds.
          if (error.code !== '401') {
            if (lastResultRef.current !== 'error') {
              console.warn('[presence] heartbeat failed:', error.message);
              lastResultRef.current = 'error';
            }
          }
          return;
        }
        if (data?.updated === 0) {
          if (lastResultRef.current !== 'no-profile-row') {
            console.warn('[presence] heartbeat matched no profile row; presence will read as offline');
            lastResultRef.current = 'no-profile-row';
          }
          return;
        }
        lastResultRef.current = 'ok';
      }).catch((err) => {
        // `gateway.presenceHeartbeat()` resolves rather than rejecting today, so
        // this arm is defensive. It is here because a rejection with no handler
        // becomes an unhandled rejection, which in a browser surfaces as a global
        // error event - so a single failed beat would be reported as an
        // application crash rather than as the presence fault it is.
        if (cancelled) return;
        if (lastResultRef.current !== 'error') {
          console.warn('[presence] heartbeat threw:', String(err));
          lastResultRef.current = 'error';
        }
      });
    };

    const onVisible = () => {
      // Re-beat the moment the tab comes back. A tab that was throttled in the
      // background may be minutes past the threshold, and the first heartbeat
      // after returning is what makes the user green again immediately.
      if (!document.hidden) beat();
    };

    beat();
    const interval = setInterval(beat, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    // Fires when the browser regains connectivity after a suspend. Without it a
    // laptop that sleeps through a heartbeat interval only recovers on the next
    // timer tick, which a throttled tab may delay for a minute.
    window.addEventListener('online', onVisible);
    // The original registered this and never removed it, so every mount of the
    // owning page leaked a listener; the cleanup below removes all of them.
    //
    // This is a HEARTBEAT, not the logout marker, and the distinction is the
    // whole of the multi-tab requirement: closing one tab must never mark the
    // account offline while another tab is still connected. Its disappearance is
    // left to the freshness window, which is the correct outcome for a close.
    const onUnload = () => {
      if (cancelled) return;
      if (presenceWritePaused) return;
      trackPresenceWrite(gateway.presenceHeartbeat()).then(() => undefined);
    };
    window.addEventListener('pagehide', onUnload);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onVisible);
      window.removeEventListener('pagehide', onUnload);
    };
  }, [userId]);
}
