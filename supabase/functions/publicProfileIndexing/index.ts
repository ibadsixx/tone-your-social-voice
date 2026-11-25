// Public, unauthenticated search-engine indexing directive for one username.
//
// The caller is a crawler or a public profile page: there is no central Auth
// session to verify, so this function deliberately returns ONE boolean and no
// profile rows. The privacy preference lives in `privacy_settings`, which has
// no FK to `profiles` and is not guest-readable, so it is resolved here with a
// service-role client held only in Function secrets. Fail-closed on read
// errors: the frontend treats anything other than a 200 with `true` as off.
//
// Function secrets:
//   PROFILES_PROJECT_URL, PROFILES_SERVICE_ROLE_KEY
//   PRIVACY_SETTINGS_PROJECT_URL, PRIVACY_SETTINGS_SERVICE_ROLE_KEY
//
// Assumed tables/columns (confirm externally):
//   profiles(id, username)
//   privacy_settings(user_id, setting_name, setting_value) with a unique
//   (user_id, setting_name) pair and TEXT values 'true' / 'false'.
// Semantics: absent preference and any value other than the literal 'false'
// resolve to ON; only an explicit 'false' withholds the profile.

import { errorResponse, jsonResponse, serviceClient } from '../_shared/crossProject.ts';
import { handlePublicRequest } from '../_shared/operation.ts';

const USERNAME_RE = /^[A-Za-z0-9_]{1,64}$/;

Deno.serve((req) => handlePublicRequest(req, async (url) => {
  const username = url.searchParams.get('username');
  if (!username || !USERNAME_RE.test(username)) return errorResponse('Profile not found', 404);

  const profiles = serviceClient('PROFILES_PROJECT_URL', 'PROFILES_SERVICE_ROLE_KEY');
  const { data: profile, error: profileError } = await profiles
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) return errorResponse('Profile not found', 404);

  const privacy = serviceClient('PRIVACY_SETTINGS_PROJECT_URL', 'PRIVACY_SETTINGS_SERVICE_ROLE_KEY');
  const { data: preference, error: preferenceError } = await privacy
    .from('privacy_settings')
    .select('setting_value')
    .eq('user_id', profile.id)
    .eq('setting_name', 'search_engine_indexing')
    .maybeSingle();
  if (preferenceError) throw preferenceError;

  return jsonResponse({ search_engine_indexing: preference?.setting_value !== 'false' });
}));
