import { dataClient } from '@/lib/supabase/dataClient';
import type { ApiResult } from '@/lib/supabase/dataClient';
import { readInfraEnv } from '@/lib/supabase/infrastructureClient';
import { parseProfileRouteUsername } from '@/lib/profileRoute';
import { classifyProfileLoadFailure, describeProfileLoadFailure } from '@/lib/profileLoadFailure';
import type { ProfileLoadErrorLike } from '@/lib/profileLoadFailure';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Diagnostics never include error text, only an allow-listed code and kind. */
function warnProfileFailure(label: string, error: ProfileLoadErrorLike | null | undefined): void {
  console.warn(label, describeProfileLoadFailure(classifyProfileLoadFailure(error)));
}

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  profile_pic: string | null;
  cover_pic: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  manual_status: string | null;
  status_visibility: string | null;
  notification_sounds: boolean;
  do_not_disturb_until: string | null;
  dark_mode: boolean;
  show_read_indicator: boolean;
  check_keys_in_conversations: boolean;
  remember_browser: boolean;
  disable_auto_uploads: boolean;
  preview_mode: boolean;
  vault_pin: string | null;
  vault_recovery_code: string | null;
  security_warnings: boolean;
  font_scale: string | null;
  reduce_motion: boolean;
  reduce_transparency: boolean;
  high_contrast: boolean;
  created_at: string;
  [key: string]: unknown;
}

export interface DisplayPreferences {
  font_scale: 'small' | 'normal' | 'large';
  reduce_motion: boolean;
  reduce_transparency: boolean;
  high_contrast: boolean;
}

const DISPLAY_COLUMNS = 'font_scale, reduce_motion, reduce_transparency, high_contrast';

export async function getDisplayPreferences(userId: string): Promise<ApiResult<DisplayPreferences>> {
  return dataClient.from('profiles').select(DISPLAY_COLUMNS).eq('id', userId).maybeSingle() as Promise<ApiResult<DisplayPreferences>>;
}

export async function updateDisplayPreferences(userId: string, data: Partial<DisplayPreferences>): Promise<ApiResult<null>> {
  return dataClient.from('profiles').update(data).eq('id', userId) as Promise<ApiResult<null>>;
}

export async function getProfileById(id: string): Promise<ApiResult<Profile>> {
  return dataClient.from('profiles').select('*').eq('id', id).maybeSingle() as Promise<ApiResult<Profile>>;
}

// PostgREST LIKE/ILIKE treats these as wildcards; usernames are literals here.
function escapeLikeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

/**
 * Look up a profile from a route username.
 *
 * The exact match is authoritative. Only when it finds no row do we try a
 * case-insensitive match, because profile URLs are typed by hand and the
 * database's username uniqueness is case-sensitive. More than one match is
 * reported as ambiguity rather than picking a row: a lookup must never depend
 * on registry/query ordering, and an ambiguous identity is not a 404.
 */
export async function getProfileByUsername(username: string): Promise<ApiResult<Profile>> {
  const parsed = parseProfileRouteUsername(username);
  if (!parsed.valid || !parsed.username) {
    return { data: null, error: { message: 'Invalid profile route', code: 'INVALID_ROUTE' } };
  }

  const exact = await dataClient
    .from('profiles')
    .select('*')
    .eq('username', parsed.username)
    .maybeSingle() as ApiResult<Profile>;
  if (exact.error || exact.data) return exact;

  const { data: candidates, error } = await dataClient
    .from('profiles')
    .select('*')
    .ilike('username', escapeLikeLiteral(parsed.username))
    .limit(2);
  if (error) return { data: null, error };

  const matches = (candidates ?? []) as Profile[];
  if (matches.length > 1) {
    return { data: null, error: { message: 'Ambiguous username', code: 'AMBIGUOUS_USERNAME' } };
  }
  return { data: matches[0] ?? null, error: null };
}

/**
 * Whether this profile's owner permits external search-engine indexing.
 *
 * The Privacy Checkup answer lives in `privacy_settings`, which is not a
 * guest-readable domain and has no foreign key to `profiles`, so it cannot ride
 * along on `getProfileByUsername`'s `select('*')`. The Gateway reads it
 * server-side and answers with a single boolean - see
 * dataClient/src/features/profileIndexing.ts.
 *
 * TRUSTED ANSWER, WITHHELD BY DEFAULT. This is no longer "return true only on an
 * explicit `{ search_engine_indexing: true }`", because the Gateway now resolves
 * the default itself: a profile with no stored preference comes back as
 * `{ search_engine_indexing: true }`. So a 200 body is authoritative and is
 * passed through as-is.
 *
 * Everything that is NOT an authoritative 200 is `false`:
 *
 *   - no dataClient configured, network failure, any non-2xx (including the 404
 *     for a username that does not exist), an unparseable body, a missing field,
 *     or a non-boolean value all resolve to `false`.
 *
 * That stays fail-closed on error even though the product default is now
 * permissive, and the reason is that the two cases are different facts. "The
 * owner never answered" is answered by the default; "we could not reach the
 * answer" is not, and the owner it failed to answer for may be one of the people
 * who explicitly turned indexing off. Publishing them because the Gateway was
 * briefly unreachable is not a recoverable mistake - they cannot see it happen -
 * whereas a profile that is withheld is withheld, and the next crawl fixes it.
 *
 * The asymmetry is the same one the Gateway makes, one layer up: the permissive
 * rule applies to an absent *preference*, never to an unavailable *read*.
 */
export async function getProfileSearchEngineIndexing(username: string): Promise<boolean> {
  if (!username) return false;
  try {
    // Public, unauthenticated privacy directive. The Edge Function reads only
    // the declared indexing preference and never exposes other profile fields.
    const { url } = readInfraEnv();
    if (!url) return false;
    const res = await fetch(
      `${url.replace(/\/$/, '')}/functions/v1/publicProfileIndexing?username=${encodeURIComponent(username)}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' }, cache: 'no-store' }
    );
    if (!res.ok) return false;
    const json = await res.json();
    return isRecord(json) && json.search_engine_indexing === true;
  } catch {
    return false;
  }
}

export async function updateProfile(id: string, data: Partial<Profile>): Promise<ApiResult<null>> {
  return dataClient.from('profiles').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function searchProfiles(query: string, excludeUserId?: string): Promise<ApiResult<Profile[]>> {
  const term = query.trim().replace(/^@/, '');
  let q = dataClient
    .from('profiles')
    .select('id, username, display_name, profile_pic')
    .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`);
  if (excludeUserId) q = q.neq('id', excludeUserId);
  return q.limit(20) as Promise<ApiResult<Profile[]>>;
}

export async function getProfilesByIds(ids: string[]): Promise<ApiResult<Profile[]>> {
  if (ids.length === 0) return { data: [], error: null };
  return dataClient.from('profiles').select('id, username, display_name, profile_pic').in('id', ids) as Promise<ApiResult<Profile[]>>;
}

/**
 * An auth.users row as exposed via the dataClient's `users` domain. Every signed-up
 * account exists here, even when it has no `profiles` row yet (legacy sign-ups
 * predate profile auto-creation), so this is the canonical "all existing users"
 * source.
 */
export interface AuthUserRow {
  id: string;
  email?: string | null;
  raw_user_meta_data?: Record<string, unknown> | null;
  created_at?: string;
}

export async function getAuthUsers(): Promise<ApiResult<AuthUserRow[]>> {
  return dataClient.from('users').select('id, email, raw_user_meta_data, created_at') as Promise<ApiResult<AuthUserRow[]>>;
}

export async function findAuthUserByUsernameResult(
  username: string
): Promise<ApiResult<AuthUserRow | null>> {
  const parsed = parseProfileRouteUsername(username);
  if (!parsed.valid || !parsed.username) {
    return { data: null, error: { message: 'Invalid profile route', code: 'INVALID_ROUTE' } };
  }
  const { data, error } = await getAuthUsers();
  if (error) return { data: null, error };
  const q = parsed.username.toLowerCase();
  return {
    data:
      (data ?? []).find((row) =>
        String(row.raw_user_meta_data?.username ?? '').toLowerCase() === q
      ) ?? null,
    error: null,
  };
}

export async function findAuthUserByUsername(username: string): Promise<AuthUserRow | null> {
  const { data, error } = await findAuthUserByUsernameResult(username);
  if (error) {
    warnProfileFailure('[profiles] findAuthUserByUsername failed:', error);
    return null;
  }
  return data;
}

export interface EnsureProfileUser {
  id: string;
  email?: string | null;
  user_metadata?: {
    username?: unknown;
    display_name?: unknown;
  } | null;
}

function sanitizeUsername(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '')
    .slice(0, 30);
}

/**
 * Guarantees a `profiles` row exists for the given auth user.
 *
 * New accounts never get a profile row created server-side (the dataClient's
 * auth endpoint only calls `admin.createUser`, and the legacy
 * `on_auth_user_created` trigger was dropped on the live users project), so
 * without this the profile page would hang on "Loading profile..." forever.
 *
 * Best-effort and idempotent: reads first, inserts only when missing, and
 * re-reads if a concurrent tab wins the race. Never overwrites an existing
 * row. Returns the profile (created or pre-existing) or `null` on failure.
 */
export async function ensureProfile(user: EnsureProfileUser): Promise<Profile | null> {
  if (!user?.id) return null;

  const { data: existing, error: lookupError } = await getProfileById(user.id);
  if (lookupError) {
    warnProfileFailure('[ensureProfile] Profile lookup failed:', lookupError);
  }
  if (existing) return existing;

  const metadata = user.user_metadata || {};
  const rawUsername = typeof metadata.username === 'string' ? metadata.username.trim() : '';
  const rawDisplayName = typeof metadata.display_name === 'string' ? metadata.display_name.trim() : '';
  const emailPrefix = sanitizeUsername(user.email?.split('@')[0] ?? '');
  const username = rawUsername || emailPrefix || `user_${user.id.slice(0, 8)}`;
  const displayName = rawDisplayName || rawUsername || emailPrefix || 'Tone User';

  const { data: created, error: insertError } = await dataClient
    .from('profiles')
    .insert({ id: user.id, username, display_name: displayName })
    .select('*')
    .maybeSingle();

  if (insertError) {
    const { data: after } = await getProfileById(user.id);
    if (after) return after;
    warnProfileFailure('[ensureProfile] Could not create profile:', insertError);
    return null;
  }

  return created ?? null;
}
