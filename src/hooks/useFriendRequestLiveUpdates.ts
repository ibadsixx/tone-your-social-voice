import { useEffect, useRef } from 'react';
import { FRIEND_REQUEST_SENT_EVENT } from '@/hooks/useFriendship';

/**
 * Shared refresh machinery for friend-request reads, refactored (Oct 1, 2026,
 * do.md "Fix the mobile navigation so these two icons display their correct
 * counters in real time").
 *
 * WHAT CHANGED AND WHY IT WAS NECESSARY. This hook used to elect a single
 * "owner" mount: the first component to call it got the 15 s interval, every
 * later mount got only the immediate fetch, the focus listener and the
 * `tone:friend-request-sent` listener. That was a way of avoiding duplicate
 * timers, and it did avoid them - but it made freshness depend on mount ORDER,
 * which is a latent bug now that the pending-request provider
 * (`usePendingFriendRequests`) is mounted above the router and therefore always
 * mounts FIRST. It would take the interval, and the "sent requests" refresh
 * inside `FriendRequestsPage` - which is deliberately still local, because it is
 * not counted by any badge - would silently stop being refreshed every 15 s.
 * Nothing would throw; the tab would just quietly go stale.
 *
 * The fix keeps the property the original was trying to achieve - exactly ONE
 * interval in the app - and drops the part that caused the bug. The interval is
 * now held in a module-level registry keyed by nothing: subscribers register
 * their refetch callback, the first one creates the interval, the last one to
 * unmount tears it down, and everyone in between is called on every tick. Order
 * of mounting no longer decides who stays fresh.
 *
 * NOT ADDED: there is still one `setInterval` in this module, at the same
 * `POLL_INTERVAL_MS`, with the same `document.visibilityState === 'visible'`
 * guard. Two mounts today produce one timer, which is what the old
 * single-owner design produced; the difference is that the second mount is now
 * included in the tick rather than excluded from it.
 */
const POLL_INTERVAL_MS = 15000;

/** Refetch callbacks of every live `useFriendRequestLiveUpdates` mount. */
const subscribers = new Set<() => void>();

/**
 * The one interval, or null when nothing is subscribed. Created by the first
 * subscriber and destroyed by the last, so an interval never outlives its
 * consumers and never runs while the app is signed out.
 */
let pollInterval: ReturnType<typeof setInterval> | null = null;

const stopSharedPolling = () => {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
};

const startSharedPollingIfIdle = () => {
  if (pollInterval) return;
  pollInterval = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    // Iterate a copy: a refetch that unmounts a subscriber must not mutate the
    // set being walked.
    [...subscribers].forEach(refetch => refetch());
  }, POLL_INTERVAL_MS);
};

/**
 * @param refetch      Called immediately on mount, on `window focus`, on the shared
 *                     15 s visible-only tick, and on `tone:friend-request-sent`.
 * @param sessionKey   The signed-in user's id, or a falsy value when signed out.
 *
 * WHY THIS IS THE USER ID AND NOT A BOOLEAN. It used to take `enabled: boolean`
 * and key its effect on that. That is correct for sign-in and sign-out, and wrong
 * for an ACCOUNT SWITCH: `me -> other` leaves `enabled` true, so the effect never
 * re-ran, the immediate `refresh()` never fired for the new account, and its
 * requests stayed un-loaded until something else happened to trigger a refetch (a
 * window focus, the shared interval, or the friend-request event). Passing the id
 * makes the effect identity-aware, so switching accounts re-reads immediately and
 * the previous account's rows cannot survive into the new session.
 */
export const useFriendRequestLiveUpdates = (
  refetch: () => void,
  sessionKey: string | null | undefined | false
) => {
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    if (!sessionKey) return;

    const refresh = () => refetchRef.current();

    refresh();

    subscribers.add(refresh);
    startSharedPollingIfIdle();

    const onFocus = () => refresh();
    const onFriendRequestSent = () => refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener(FRIEND_REQUEST_SENT_EVENT, onFriendRequestSent);

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(FRIEND_REQUEST_SENT_EVENT, onFriendRequestSent);
      subscribers.delete(refresh);
      if (subscribers.size === 0) stopSharedPolling();
    };
  }, [sessionKey]);
};
