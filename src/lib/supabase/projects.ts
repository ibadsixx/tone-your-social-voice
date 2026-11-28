// Tone frontend — explicit project identities approved for direct Supabase use.
//
// There are two different identifiers here and they are NOT interchangeable:
//   * KNOWN_PROJECT_REFS values are Supabase project references (host identity).
//   * REGISTRY_PROJECT_KEYS values are registry-local `project_key` values.
// The resolver selects by registry key. A project ref is used only as a
// non-secret identity check on the selected row's URL. No URL, anon key,
// service key, or token is stored here.

export const KNOWN_PROJECT_REFS = Object.freeze({
  centralAuth: 'ojdhztcetykgvrcwlwen',
  infrastructure: 'lwtzhnrvobiovdnzbthg',
  posts: 'qxvvjsamqzrwcsnoiwkl',
  liveSessions: 'plpodouushpsuitqmlzy',
  profiles: 'kswqecvwphalmsggtccm',
  blocking: 'kfvixrlseqifcgszgnxm',
} as const);

/**
 * Backwards-compatible alias. The values are Supabase project references, not
 * Registry project keys; new code should use KNOWN_PROJECT_REFS.
 */
export const KNOWN_PROJECT_KEYS = KNOWN_PROJECT_REFS;

/** Registry-local project_key values confirmed by the Phase 3B live snapshot. */
export const REGISTRY_PROJECT_KEYS = Object.freeze({
  users: 'users-1',
  posts: 'posts-1',
  profiles: 'profiles-1',
  blocking: 'blocking-1',
} as const);

/**
 * Domains with an explicitly approved Registry row.
 *
 * A domain absent from this map must be resolved by validated routing metadata
 * from the Infrastructure Registry. The frontend never guesses an assignment
 * from a domain name.
 */
export const DOMAIN_PROJECT_KEYS: Readonly<Record<string, string>> = Object.freeze({
  users: REGISTRY_PROJECT_KEYS.users,
  posts: REGISTRY_PROJECT_KEYS.posts,
  profiles: REGISTRY_PROJECT_KEYS.profiles,
  blocking: REGISTRY_PROJECT_KEYS.blocking,
  // live_streams is deliberately absent: the approved live ref is registered
  // only as `lives`, and Phase 3B did not approve an alias.
});

/** Expected Supabase host identity for each explicitly approved domain. */
export const DOMAIN_PROJECT_REFS: Readonly<Record<string, string>> = Object.freeze({
  users: KNOWN_PROJECT_REFS.centralAuth,
  posts: KNOWN_PROJECT_REFS.posts,
  profiles: KNOWN_PROJECT_REFS.profiles,
  blocking: KNOWN_PROJECT_REFS.blocking,
});

export function knownProjectKeyForDomain(domain: string): string | undefined {
  return DOMAIN_PROJECT_KEYS[domain];
}

export function knownProjectRefForDomain(domain: string): string | undefined {
  return DOMAIN_PROJECT_REFS[domain];
}
