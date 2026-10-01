// Global "a friend of mine is online" indicator (do.md "green online-friends
// indicator on the mobile Messages icon").
//
// The dot on the mobile Messages icon means:
//
//   at least one of MY ACCEPTED FRIENDS is currently online
//
// and nothing weaker. Being signed in yourself is not a friend. A pending message
// request is not a friend. A blocked user is not a friend. An arbitrary Tone user
// is not a friend. All of those are decided server-side, in
// gateway/src/features/onlineFriends.ts, out of the app's existing
// accepted-friendship and blocking logic - so this file cannot drift from the rules
// the rest of the product uses by deciding friendship differently.
//
// WHY THIS IS A PROVIDER AND NOT A HOOK IN THE NAVBAR.
//
// The four things do.md rules out are all the things a component-local effect does:
// a read on every render, a read the moment you navigate, a poll to keep the dot
// fresh, and a subscription per component. Worse, the navigation component
// unmounts on route changes, so a local effect would make the dot correct only on
// whichever pages happened to render it. Presence is a property of the session -
// exactly the argument that moved `PresenceHeartbeat` above the router in an
// earlier round - so this lives in one provider mounted above `<Routes>` and every
// consumer, on any route, reads the same value.
//
// WHAT IS REUSED, and what is deliberately NOT added:
//
//   - Presence: `profiles.last_seen_at`, the one column every green dot in the app
//     already reads. No `is_online` column, no presence table, no second store.
//   - Realtime: the SAME shared, ref-counted `user:<myId>` SSE channel the unread
//     badge already holds open for the whole session. `presence.updated` is one
//     more listener on that one connection - not a second subscription, and not a
//     new channel namespace. `subscribeToMessages` ref-counts, so this provider
//     adding a listener cannot create a connection the badge is not already paying
//     for.
//   - Polling: there is none. Every refresh below is caused by an EVENT - a friend
//     coming online (realtime), the stream reconnecting (realtime `init`), the tab
//     coming back (visibility/focus), or the one expiry countdown below.
//
// WHY THERE IS EXACTLY ONE TIMEOUT, AND IT IS NOT A POLL.
//
// A friend who closes the app emits nothing. Their presence ages out by becoming
// stale, and staleness is not an event, so a client that only listens can never
// notice it - which is the reason the obvious implementations end up polling.
//
// The server solves this by also returning `offlineAt`: the earliest instant at
// which its own answer can become false, derived from the soonest online friend's
// stamp plus the same freshness window `isOnline()` applies. So this arms a single
// timeout for that instant, and when it fires it re-reads once. If the friend beat
// again in the meantime the response carries a new `offlineAt` and the countdown
// simply restarts; if nobody is online any more, `offlineAt` is null and there is
// no timer at all. A single scheduled wake-up at a known instant is not polling:
// the alternative is asking again on a schedule the client picked and hoping.
//
// ACCOUNT SWITCHING. Every effect run is a new session generation and in-flight
// reads for a previous one are discarded, so a slow response for user A can never
// paint A's friend status onto user B's nav - the same guard the unread badge uses.
// The state starts empty, so a logged-out session renders no dot at all and there is
// nothing to leak.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/hooks/useAuth';
import { gateway } from '@/lib/gateway';
import { getMessageRealtime, subscribeToMessages } from '@/lib/messageRealtime';

/** Coalesce a burst of wake-ups into one read. */
const REFRESH_DEBOUNCE_MS = 300;

/**
 * The realtime event the gateway publishes when a user's presence TRANSITIONS to
 * online. Its payload is intentionally empty - see
 * gateway/src/features/onlineFriends.ts - so it carries no information beyond "your
 * cached answer may now be stale" and this listener never learns who came online.
 */
const PRESENCE_UPDATED_EVENT = 'presence.updated';

interface OnlineFriendsValue {
  /**
   * Whether at least one accepted friend of the current user is online. False
   * whenever the answer is unknown, which includes logged out - a dot that cannot be
   * justified is worse than a missing one.
   */
  hasOnlineFriend: boolean;
}

const OnlineFriendsContext = createContext<OnlineFriendsValue>({ hasOnlineFriend: false });

interface ServerAnswer {
  hasOnlineFriend: boolean;
  offlineAt: string | null;
}

/**
 * The server's authoritative answer, or null to keep the previous one.
 *
 * On any kind of failure the PREVIOUS answer is kept, for the same reason the
 * unread badge keeps its previous set: a transient gateway or network blip must not
 * make a dot the user is already looking at disappear, and it certainly must not be
 * reported as "nobody is online".
 */
async function fetchServerAnswer(previous: ServerAnswer | null): Promise<ServerAnswer | null> {
  try {
    const { data, error } = await gateway.presenceOnlineFriends();
    if (error) return null;
    if (!data || typeof data.hasOnlineFriend !== 'boolean') return null;
    return {
      hasOnlineFriend: data.hasOnlineFriend,
      // Anything unparseable is treated as "no countdown" rather than as an instant
      // in the past, which would spin the timer at once.
      offlineAt: typeof data.offlineAt === 'string' && Number.isFinite(Date.parse(data.offlineAt))
        ? data.offlineAt
        : null,
    };
  } catch {
    return null;
  }
}

export function OnlineFriendsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;

  const [answer, setAnswer] = useState<ServerAnswer>({ hasOnlineFriend: false, offlineAt: null });
  const answerRef = useRef<ServerAnswer>({ hasOnlineFriend: false, offlineAt: null });
  /**
   * Bumped on every effect run (i.e. every sign-in / sign-out) so an in-flight read
   * for a previous account can never land on the current one.
   */
  const generationRef = useRef(0);

  const applyAnswer = useCallback((next: ServerAnswer) => {
    answerRef.current = next;
    setAnswer(next);
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) {
      applyAnswer({ hasOnlineFriend: false, offlineAt: null });
      return;
    }
    const generation = generationRef.current;
    const next = await fetchServerAnswer(answerRef.current);
    if (next === null) return;
    // A newer session has superseded this response; applying it now would resurrect
    // a previous account's friend status.
    if (generation !== generationRef.current) return;
    applyAnswer(next);
  }, [userId, applyAnswer]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void refresh();
    }, REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  useEffect(() => {
    // Every effect run is a new session generation.
    generationRef.current += 1;

    if (!userId) {
      applyAnswer({ hasOnlineFriend: false, offlineAt: null });
      return;
    }

    // Start empty, then read the server truth. Starting empty matters: the previous
    // account's dot must be gone before the first response, not merely corrected
    // after it.
    applyAnswer({ hasOnlineFriend: false, offlineAt: null });
    void refresh();

    // A friend came online. Payload-free, so this only means "re-read"; who it was
    // is not on the wire and never reaches this client.
    const unsubPresence = subscribeToMessages(userId, PRESENCE_UPDATED_EVENT, scheduleRefresh);

    // SSE (re)connect: presence changes that happened while the stream was down are
    // not recoverable from events, so the answer is re-read rather than patched.
    const channel = getMessageRealtime(userId);
    const unsubReconnect = channel?.onReconnect(() => {
      void refresh();
    });

    // Tab refocus: the first heartbeat after a hidden tab may be minutes old.
    const handleVisibility = () => {
      if (!document.hidden) void refresh();
    };
    const handleFocus = () => {
      void refresh();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      unsubPresence();
      unsubReconnect?.();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      applyAnswer({ hasOnlineFriend: false, offlineAt: null });
    };
  }, [userId, applyAnswer, refresh, scheduleRefresh]);

  /**
   * The ageing-out countdown. Re-armed from every answer, and only ever ONE timer.
   *
   * `setTimeout` rather than `setInterval` is the point rather than a detail: an
   * interval would be polling by another name, re-reading on a cadence this client
   * invented, long after the server had told it the answer could not possibly have
   * changed. A timeout at the instant the server named is one request at the one
   * moment a request can matter.
   */
  useEffect(() => {
    if (!userId || !answer.hasOnlineFriend || !answer.offlineAt) return;
    const delay = Date.parse(answer.offlineAt) - Date.now();
    // The floor is small on purpose. A near-term expiry is a NORMAL answer, not a
    // malformed one: a friend who closed the app two and a half minutes ago is due
    // to age out in a millisecond, and making the user wait a second for the dot to
    // go away would be its own visible bug. The floor exists only so a server that
    // keeps returning an expiry already in the past cannot spin this into a tight
    // read loop - and even then it bounds that loop to a few reads a second rather
    // than eliminating it, because a correct answer is never past: a friend who is
    // still online beats every 30s, so their expiry is always at least the freshness
    // window minus one heartbeat away.
    const timer = setTimeout(() => {
      void refresh();
    }, Math.max(delay, 250));
    return () => clearTimeout(timer);
  }, [userId, answer, refresh]);

  const value = useMemo(() => ({ hasOnlineFriend: answer.hasOnlineFriend }), [answer]);

  return <OnlineFriendsContext.Provider value={value}>{children}</OnlineFriendsContext.Provider>;
}

export function useOnlineFriends(): OnlineFriendsValue {
  return useContext(OnlineFriendsContext);
}
