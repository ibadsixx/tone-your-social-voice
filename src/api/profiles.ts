import { gateway } from './client';
import type { ApiResult } from './client';

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
  return gateway.from('profiles').select(DISPLAY_COLUMNS).eq('id', userId).maybeSingle() as Promise<ApiResult<DisplayPreferences>>;
}

export async function updateDisplayPreferences(userId: string, data: Partial<DisplayPreferences>): Promise<ApiResult<null>> {
  return gateway.from('profiles').update(data).eq('id', userId) as Promise<ApiResult<null>>;
}

export async function getProfileById(id: string): Promise<ApiResult<Profile>> {
  return gateway.from('profiles').select('*').eq('id', id).maybeSingle() as Promise<ApiResult<Profile>>;
}

export async function getProfileByUsername(username: string): Promise<ApiResult<Profile>> {
  return gateway.from('profiles').select('*').eq('username', username).maybeSingle() as Promise<ApiResult<Profile>>;
}

export async function updateProfile(id: string, data: Partial<Profile>): Promise<ApiResult<null>> {
  return gateway.from('profiles').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function searchProfiles(query: string, excludeUserId?: string): Promise<ApiResult<Profile[]>> {
  const term = query.trim().replace(/^@/, '');
  let q = gateway
    .from('profiles')
    .select('id, username, display_name, profile_pic')
    .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`);
  if (excludeUserId) q = q.neq('id', excludeUserId);
  return q.limit(20) as Promise<ApiResult<Profile[]>>;
}

export async function getProfilesByIds(ids: string[]): Promise<ApiResult<Profile[]>> {
  if (ids.length === 0) return { data: [], error: null };
  return gateway.from('profiles').select('id, username, display_name, profile_pic').in('id', ids) as Promise<ApiResult<Profile[]>>;
}

/**
 * An auth.users row as exposed via the gateway's `users` domain. Every signed-up
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
  return gateway.from('users').select('id, email, raw_user_meta_data, created_at') as Promise<ApiResult<AuthUserRow[]>>;
}

export async function findAuthUserByUsername(username: string): Promise<AuthUserRow | null> {
  const q = username?.toLowerCase();
  if (!q) return null;
  const { data, error } = await getAuthUsers();
  if (error) {
    console.warn('[profiles] findAuthUserByUsername failed:', error);
    return null;
  }
  return (
    (data || []).find((r) => String(r.raw_user_meta_data?.username ?? '').toLowerCase() === q) ?? null
  );
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
 * New accounts never get a profile row created server-side (the gateway's
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
    console.warn('[ensureProfile] Profile lookup failed:', lookupError);
  }
  if (existing) return existing;

  const metadata = user.user_metadata || {};
  const rawUsername = typeof metadata.username === 'string' ? metadata.username.trim() : '';
  const rawDisplayName = typeof metadata.display_name === 'string' ? metadata.display_name.trim() : '';
  const emailPrefix = sanitizeUsername(user.email?.split('@')[0] ?? '');
  const username = rawUsername || emailPrefix || `user_${user.id.slice(0, 8)}`;
  const displayName = rawDisplayName || rawUsername || emailPrefix || 'Tone User';

  const { data: created, error: insertError } = await gateway
    .from('profiles')
    .insert({ id: user.id, username, display_name: displayName })
    .select('*')
    .maybeSingle();

  if (insertError) {
    const { data: after } = await getProfileById(user.id);
    if (after) return after;
    console.warn('[ensureProfile] Could not create profile:', insertError);
    return null;
  }

  return created ?? null;
}
