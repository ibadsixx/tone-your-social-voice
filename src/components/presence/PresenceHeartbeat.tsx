import { useAuth } from '@/hooks/useAuth';
import { usePresence } from '@/hooks/usePresence';

/**
 * App-level presence mount (do.md "online presence indicator").
 *
 * This renders nothing. It exists so the presence heartbeat has exactly one
 * owner that lives above the router.
 *
 * The heartbeat used to be called from `pages/Messages.tsx`, which tied presence
 * to a screen: leave Messages and the heartbeat stopped, so the user began ageing
 * out of every other user's green dot while still signed in and still connected.
 * Presence is a property of the session, not of the route, so it belongs where the
 * session is - inside `AuthProvider`, above the `<Routes>`.
 *
 * One mount, one heartbeat, one row written per interval: there is still no
 * per-conversation subscription or per-conversation request anywhere in the
 * presence path.
 */
export function PresenceHeartbeat() {
  const { user } = useAuth();
  usePresence(user?.id ?? null);
  return null;
}
