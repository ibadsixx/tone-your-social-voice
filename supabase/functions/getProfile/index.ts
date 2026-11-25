// Authenticated read of the caller's own profile from the profiles project.
//
// Identity comes only from the verified central Auth JWT. A client-supplied
// profileId is accepted solely as a self-check and can never select another
// user's row. The service-role client is built from Function secrets only.
//
// Function secrets: CENTRAL_AUTH_URL, CENTRAL_AUTH_ANON_KEY,
// PROFILES_PROJECT_URL, PROFILES_SERVICE_ROLE_KEY.
//
// Assumed table/columns: profiles(id, email, username, display_name,
// profile_pic, created_at, updated_at) in the profiles project.

import { serviceClient } from '../_shared/crossProject.ts';
import {
  assertFields,
  forbidden,
  handleRequest,
  notFound,
  ok,
  optionalUuid,
  type VerifiedContext,
} from '../_shared/operation.ts';

Deno.serve((req) => handleRequest(req, ['POST'], async (ctx: VerifiedContext) => {
  assertFields(ctx.body, ['profileId']);
  const requested = optionalUuid(ctx.body.profileId, 'profileId');
  if (requested && requested !== ctx.callerId) forbidden('Cannot read another user\'s profile');

  const profiles = serviceClient('PROFILES_PROJECT_URL', 'PROFILES_SERVICE_ROLE_KEY');
  const { data, error } = await profiles
    .from('profiles')
    .select('*')
    .eq('id', ctx.callerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) notFound('Profile not found');
  return ok(data);
}));
