// Profile URL parameter handling.
//
// React Router already decodes a `:username` segment, but hand-written links,
// bookmarks and pasted @mentions can still carry an @ prefix, stray whitespace
// or an over-encoded escape. A parsing problem of that kind is NOT evidence
// that the profile is missing, so callers must reject it explicitly instead of
// issuing a doomed lookup and treating the empty result as a 404.

export interface ParsedProfileRoute {
  /** The username to pass to the profile API, or null when the segment is invalid. */
  username: string | null;
  valid: boolean;
}

const INVALID_SEGMENT_CHARS = /[\u0000-\u001f\u007f/\\?#]/;

function decodeOnce(value: string): string {
  if (!value.includes('%')) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    // An invalid escape is a parsing failure, not a username to look up.
    return value;
  }
}

export type ProfileRouteIdentifier =
  | { kind: 'username'; username: string }
  | { kind: 'id'; id: string }
  | { kind: 'invalid' };

/** Canonical UUID form; a profile id route uses this, not a username column. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Decide which column a `/profile/:identifier` segment addresses.
 *
 * Profile URLs have always used usernames, but users also follow links built
 * from a profile id. An exact UUID shape is unambiguous (generated usernames
 * contain no hyphens), so it is looked up by `id`; everything else is a
 * username. Parsing failures are reported as such, never as a missing row.
 */
export function parseProfileRouteIdentifier(raw: string | undefined): ProfileRouteIdentifier {
  const parsed = parseProfileRouteUsername(raw);
  if (!parsed.valid || !parsed.username) return { kind: 'invalid' };
  if (UUID.test(parsed.username)) return { kind: 'id', id: parsed.username.toLowerCase() };
  return { kind: 'username', username: parsed.username };
}

export function parseProfileRouteUsername(raw: string | undefined): ParsedProfileRoute {
  if (typeof raw !== 'string') return { username: null, valid: false };

  let username = decodeOnce(raw).trim();
  while (username.startsWith('@')) username = username.slice(1).trim();
  // A double-encoded @ is a common form in pasted profile links.
  if (username.startsWith('%40')) {
    const decoded = decodeOnce(username.slice(3)).trim();
    username = decoded.startsWith('@') ? decoded.slice(1).trim() : decoded;
  }

  if (!username || INVALID_SEGMENT_CHARS.test(username)) {
    return { username: null, valid: false };
  }
  return { username, valid: true };
}
