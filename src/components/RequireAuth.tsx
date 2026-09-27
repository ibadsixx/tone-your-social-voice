// Route guard for surfaces that require a signed-in viewer (do.md — "Update the
// Tone app so that the Home/Feed page is strictly restricted to authenticated
// users").
//
// The decision comes from the verified Supabase session that `useAuth` already
// holds, and from nothing else. In particular it never reads a `user_id` from
// the URL, from query state or from localStorage, because every one of those is
// under the visitor's control: a guard that trusts a client-supplied identity is
// not a guard. Reusing `useAuth` also means this is not a second authentication
// system — it is the same session the Gateway verifies, so the client and the
// server always agree on who the visitor is.
//
// It is a wrapper rather than a check inside the page, and that is the whole
// point. A page-level `if (!user) return <Navigate to="/auth" />` still MOUNTS
// the page first, and mounting is what runs its effects — so the Home feed
// request has already gone out by the time the redirect happens. Here the
// children are not rendered at all until the session says otherwise, so there is
// no request to make, no feed loading state to hide, and no protected content to
// flash and then take away.
//
// The three states, and the middle one is the one that is easy to get wrong:
//
//   * session still resolving -> render NOTHING. "Unknown" is not "signed out":
//     redirecting on the first render would bounce a signed-in visitor off Home
//     on every refresh, before their session has been read.
//   * resolved with no session -> redirect to /auth, replacing the history entry
//     so the Back button does not walk a guest straight back into a protected
//     route (and does not strand them in a redirect loop).
//   * resolved with a session -> render the children.
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, session, loading } = useAuth();
  const location = useLocation();

  // Nothing at all while the answer is unknown: no page chrome, no skeleton,
  // and — because the children never mount — none of their effects run.
  if (loading) return null;

  // Both halves of the session are required. `session` is the signed token the
  // Gateway verifies and `user` is the identity decoded from it; treating them
  // as interchangeable would let a half-populated auth state through.
  if (!session || !user) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

export default RequireAuth;
