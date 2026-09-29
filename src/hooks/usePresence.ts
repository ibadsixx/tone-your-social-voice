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
  const seen = new Date(lastSeenAt).getTime();
  // An unparseable value is treated as offline rather than as "now". Reading
  // NaN in a comparison yields false, so this is already the safe branch, but
  // stating it keeps the intent from being "reversed" by a later edit.
  if (Number.isNaN(seen)) return false;
  return Date.now() - seen < OFFLINE_THRESHOLD_MS;
}

export function formatLastSeen(lastSeenAt?: string | null): string {
  if (!lastSeenAt) return 'Offline';

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

    let cancelled = false;

    const beat = () => {
      if (cancelled) return;
      gateway.presenceHeartbeat().then(({ data, error }) => {
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
    const onUnload = () => {
      if (cancelled) return;
      gateway.presenceHeartbeat().then(() => undefined);
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
