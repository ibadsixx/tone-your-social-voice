// TEMPORARY DEV-ONLY diagnostic helper.
//
// Calls the temporary Profiles-side identity probe through the existing routed
// Profiles client. The client forwards the real Central Auth session; this
// module never reads, logs, renders, persists, or transmits a token or raw
// claim. Only three boolean values are accepted from the response.

import { getProjectClient } from '@/lib/supabase/clientFactory';

export type ProfilesIdentityProbeStatus = 'PASS' | 'FAIL' | 'INSUFFICIENT';

export interface ProfilesIdentityProbeResult {
  identity_available: boolean;
  issuer_matches: boolean;
  user_id_is_uuid: boolean;
  status: ProfilesIdentityProbeStatus;
}

const INSUFFICIENT: ProfilesIdentityProbeResult = Object.freeze({
  identity_available: false,
  issuer_matches: false,
  user_id_is_uuid: false,
  status: 'INSUFFICIENT',
});

interface IdentityRpcClient {
  rpc(name: string): PromiseLike<{ data: unknown; error: unknown }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

/** Allow-list the RPC response to exactly three booleans plus a status. */
export function classifyProfilesIdentityProbe(raw: unknown): ProfilesIdentityProbeResult {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!isRecord(row)) return INSUFFICIENT;

  const identityAvailable = readBoolean(row.identity_available);
  const issuerMatches = readBoolean(row.issuer_matches);
  const userIdIsUuid = readBoolean(row.user_id_is_uuid);
  if (identityAvailable === null || issuerMatches === null || userIdIsUuid === null) {
    return INSUFFICIENT;
  }

  const allTrue = identityAvailable && issuerMatches && userIdIsUuid;
  return {
    identity_available: identityAvailable,
    issuer_matches: issuerMatches,
    user_id_is_uuid: userIdIsUuid,
    status: allTrue ? 'PASS' : 'FAIL',
  };
}

export async function runProfilesIdentityProbe(): Promise<ProfilesIdentityProbeResult> {
  try {
    const { client } = await getProjectClient({ domain: 'profiles', operation: 'read' });
    // Generated types do not yet know this temporary function. The runtime
    // client still routes by name to the Profiles project.
    const rpcClient = client as unknown as IdentityRpcClient;
    const { data, error } = await rpcClient.rpc('tone_identity_probe');

    // Never surface or log the raw error; an unavailable function is
    // INSUFFICIENT, not a failed identity assertion.
    if (error) return INSUFFICIENT;
    return classifyProfilesIdentityProbe(data);
  } catch {
    return INSUFFICIENT;
  }
}
