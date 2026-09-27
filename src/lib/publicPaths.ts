// Which routes a logged-out visitor may open (do.md §13 "Authentication
// separation").
//
// This lives in its own module rather than inside Layout for two reasons. It is
// the rule that decides whether a crawler is redirected to /auth before any
// content renderer runs, so it needs to be directly testable; and the SEO module
// is what a public content page consults, and having the route policy next to
// the metadata policy is what keeps the two from disagreeing about the same URL.
//
// Two behaviors are deliberately kept separate here:
//
//   the Home feed (`/`) requires a session - a guest is sent to /auth. That is
//   the one surface where a read-only guest view was never wanted.
//
//   public content (/post/:id, /reel/:id, /photo/:id) does NOT. A guest and a
//   crawler must be able to open a public post directly, so these paths are
//   public *routes*. That does not make any post readable: the Gateway decides
//   per row, and a friends-only or Only-Me post simply is not returned, so the
//   page renders its not-found state. The route being open and the content being
//   readable are two different questions, and only the second one is about
//   privacy.
//
// Owner/management surfaces under /pages/:id/* (status, archive, activity-log,
// manage) and /hashtag/:tag/analytics stay protected.
const PUBLIC_EXACT = new Set(['/search', '/groups', '/pages', '/profile', '/explore/hashtags']);
const PUBLIC_PREFIXES = ['/profile/', '/post/', '/reel/', '/photo/', '/groups/', '/pages/', '/hashtag/'];
const PROTECTED_SUFFIXES = ['/status', '/archive', '/activity-log', '/manage', '/analytics'];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (!pathname.startsWith(prefix)) continue;
    const rest = pathname.slice(prefix.length);
    if (PROTECTED_SUFFIXES.some((suffix) => rest.endsWith(suffix))) return false;
    return true;
  }
  return false;
}
