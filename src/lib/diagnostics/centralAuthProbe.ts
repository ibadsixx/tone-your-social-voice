// TEMPORARY DEV-ONLY diagnostic helpers.
//
// This module is imported only by the temporary development probe page. It
// inspects the current Central Auth session entirely in memory and returns
// only allow-listed status strings. It never returns, logs, or persists token
// contents, JWT header/payload JSON, JWKS key material, user identifiers, or
// profile rows.

import { PUBLIC_PROFILE_COLUMNS } from '@/api/profiles';
import { getSession } from '@/lib/supabase/centralAuth';
import { getProjectClient } from '@/lib/supabase/clientFactory';
import { getCurrentAccessToken } from '@/lib/supabase/sessionTokenProvider';
import {
  classifyProfileLoadFailure,
  type ProfileLoadErrorLike,
} from '@/lib/profileLoadFailure';

export const CENTRAL_AUTH_ISSUER = 'https://ojdhztcetykgvrcwlwen.supabase.co/auth/v1';
export const CENTRAL_AUTH_JWKS_URL =
  'https://ojdhztcetykgvrcwlwen.supabase.co/auth/v1/.well-known/jwks.json';
const EXPECTED_AUDIENCE = 'authenticated';

const ASYMMETRIC_ALGORITHMS = new Set([
  'ES256',
  'ES384',
  'ES512',
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'EdDSA',
]);

const SYMMETRIC_ALGORITHMS = new Set(['HS256', 'HS384', 'HS512']);

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PROFILE_NO_ROW_NOTE =
  'A 200 with no row is not an OIDC authentication failure; it can mean RLS filtering or a missing profile row.';
const METADATA_ONLY_NOTE =
  'Decoded JWT header and claims are metadata/shape checks only, not proof of signature validity.';

export type SessionStatus = 'SESSION_FOUND' | 'NO_SESSION' | 'SESSION_ERROR';
export type AlgorithmCategory = 'ASYMMETRIC' | 'SYMMETRIC' | 'UNKNOWN';
export type PresenceStatus = 'PRESENT' | 'MISSING';
export type IssuerStatus = 'EXACT_MATCH' | 'MISMATCH' | 'MISSING';
export type RoleStatus = 'AUTHENTICATED' | 'OTHER' | 'MISSING';
export type SubStatus = 'UUID_SHAPE_VALID' | 'INVALID' | 'MISSING';
export type AudienceStatus = 'EXPECTED' | 'OTHER' | 'MISSING';
export type ExpiryStatus = 'VALID' | 'EXPIRED' | 'MISSING';
export type IssuedAtStatus = 'PRESENT' | 'MISSING';
export type JwksMatchStatus = 'MATCH' | 'NO_MATCH' | 'UNKNOWN';
export type ProfilesHttpStatus =
  | 'HTTP_STATUS_200'
  | 'HTTP_STATUS_401'
  | 'HTTP_STATUS_403'
  | 'HTTP_STATUS_OTHER'
  | 'NETWORK_ERROR';
export type RowVisibility = 'ROW_VISIBLE' | 'ROW_NOT_VISIBLE' | 'UNKNOWN';
export type CheckState = 'PASS' | 'FAIL' | 'UNKNOWN';
export type EvidenceState = 'SUFFICIENT_EVIDENCE' | 'INSUFFICIENT_EVIDENCE';

export interface JwtMetadataResult {
  algorithmCategory: AlgorithmCategory;
  kid: PresenceStatus;
  iss: IssuerStatus;
  role: RoleStatus;
  sub: SubStatus;
  aud: AudienceStatus;
  exp: ExpiryStatus;
  iat: IssuedAtStatus;
}

export interface ProfilesAcceptanceResult {
  httpStatus: ProfilesHttpStatus;
  rowVisibility: RowVisibility;
  errorClass: string | null;
  errorCode: string | null;
  note: string;
}

export interface ProbeInterpretation {
  metadataShape: CheckState;
  jwksMatch: CheckState;
  profilesRequest: CheckState;
  sufficientEvidence: EvidenceState;
  note: string;
}

export interface CentralAuthProbeResult {
  session: SessionStatus;
  jwtMetadata: JwtMetadataResult;
  jwksKeyMatch: JwksMatchStatus;
  profilesAcceptance: ProfilesAcceptanceResult;
  interpretation: ProbeInterpretation;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeJwtSegment(segment: string | undefined): Record<string, unknown> | null {
  if (!segment) return null;
  try {
    if (typeof atob !== 'function') return null;
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const parsed: unknown = JSON.parse(atob(padded));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function classifyAlgorithm(alg: unknown): AlgorithmCategory {
  if (typeof alg !== 'string') return 'UNKNOWN';
  if (ASYMMETRIC_ALGORITHMS.has(alg)) return 'ASYMMETRIC';
  if (SYMMETRIC_ALGORITHMS.has(alg)) return 'SYMMETRIC';
  return 'UNKNOWN';
}

function classifyIssuer(iss: unknown): IssuerStatus {
  if (typeof iss !== 'string' || iss.length === 0) return 'MISSING';
  return iss === CENTRAL_AUTH_ISSUER ? 'EXACT_MATCH' : 'MISMATCH';
}

function classifyRole(role: unknown): RoleStatus {
  if (typeof role !== 'string' || role.length === 0) return 'MISSING';
  return role === 'authenticated' ? 'AUTHENTICATED' : 'OTHER';
}

function classifySub(sub: unknown): SubStatus {
  if (typeof sub !== 'string' || sub.length === 0) return 'MISSING';
  return UUID_SHAPE.test(sub) ? 'UUID_SHAPE_VALID' : 'INVALID';
}

function classifyAudience(aud: unknown): AudienceStatus {
  if (aud == null || (typeof aud === 'string' && aud.length === 0)) return 'MISSING';
  if (typeof aud === 'string') return aud === EXPECTED_AUDIENCE ? 'EXPECTED' : 'OTHER';
  if (Array.isArray(aud)) {
    return aud.includes(EXPECTED_AUDIENCE) ? 'EXPECTED' : 'OTHER';
  }
  return 'OTHER';
}

function classifyExpiry(exp: unknown, nowMs: number): ExpiryStatus {
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return 'MISSING';
  return exp * 1000 > nowMs ? 'VALID' : 'EXPIRED';
}

function classifyIssuedAt(iat: unknown): IssuedAtStatus {
  if (typeof iat !== 'number' || !Number.isFinite(iat)) return 'MISSING';
  return 'PRESENT';
}

export function createUnknownJwtMetadata(): JwtMetadataResult {
  return {
    algorithmCategory: 'UNKNOWN',
    kid: 'MISSING',
    iss: 'MISSING',
    role: 'MISSING',
    sub: 'MISSING',
    aud: 'MISSING',
    exp: 'MISSING',
    iat: 'MISSING',
  };
}

export function decodeJwtMetadata(token: string | null, nowMs = Date.now()): JwtMetadataResult {
  if (!token) return createUnknownJwtMetadata();

  const segments = token.split('.');
  if (segments.length !== 3) return createUnknownJwtMetadata();

  const header = decodeJwtSegment(segments[0]);
  const payload = decodeJwtSegment(segments[1]);
  if (!header || !payload) return createUnknownJwtMetadata();

  return {
    algorithmCategory: classifyAlgorithm(header.alg),
    kid: typeof header.kid === 'string' && header.kid.length > 0 ? 'PRESENT' : 'MISSING',
    iss: classifyIssuer(payload.iss),
    role: classifyRole(payload.role),
    sub: classifySub(payload.sub),
    aud: classifyAudience(payload.aud),
    exp: classifyExpiry(payload.exp, nowMs),
    iat: classifyIssuedAt(payload.iat),
  };
}

function extractKid(token: string | null): string | null {
  if (!token) return null;
  const header = decodeJwtSegment(token.split('.')[0]);
  if (!header || typeof header.kid !== 'string' || header.kid.length === 0) return null;
  return header.kid;
}

export async function checkJwksKeyMatch(token: string | null): Promise<JwksMatchStatus> {
  const kid = extractKid(token);
  if (!kid) return 'UNKNOWN';

  try {
    // Public metadata only. The access token is never sent to this endpoint.
    const response = await fetch(CENTRAL_AUTH_JWKS_URL, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!response.ok) return 'UNKNOWN';

    const jwks: unknown = await response.json();
    if (!isRecord(jwks) || !Array.isArray(jwks.keys)) return 'UNKNOWN';

    const matched = jwks.keys.some(
      (key) => isRecord(key) && typeof key.kid === 'string' && key.kid === kid
    );
    return matched ? 'MATCH' : 'NO_MATCH';
  } catch {
    return 'UNKNOWN';
  }
}

export function classifyProfilesProbeError(error: unknown): Pick<
  ProfilesAcceptanceResult,
  'httpStatus' | 'errorClass' | 'errorCode'
> {
  const failure = classifyProfileLoadFailure(error as ProfileLoadErrorLike | null | undefined);

  if (failure.kind === 'authentication') {
    return { httpStatus: 'HTTP_STATUS_401', errorClass: failure.kind, errorCode: failure.code };
  }
  if (failure.kind === 'access-denied') {
    return { httpStatus: 'HTTP_STATUS_403', errorClass: failure.kind, errorCode: failure.code };
  }
  return { httpStatus: 'HTTP_STATUS_OTHER', errorClass: failure.kind, errorCode: failure.code };
}

export function createUnknownProfilesAcceptance(): ProfilesAcceptanceResult {
  return {
    httpStatus: 'HTTP_STATUS_OTHER',
    rowVisibility: 'UNKNOWN',
    errorClass: null,
    errorCode: null,
    note: PROFILE_NO_ROW_NOTE,
  };
}

export function buildInterpretation(
  session: SessionStatus,
  jwtMetadata: JwtMetadataResult,
  jwksKeyMatch: JwksMatchStatus,
  profilesAcceptance: ProfilesAcceptanceResult
): ProbeInterpretation {
  if (session !== 'SESSION_FOUND') {
    return {
      metadataShape: 'UNKNOWN',
      jwksMatch: 'UNKNOWN',
      profilesRequest: 'UNKNOWN',
      sufficientEvidence: 'INSUFFICIENT_EVIDENCE',
      note: METADATA_ONLY_NOTE,
    };
  }

  const metadataShape: CheckState =
    jwtMetadata.algorithmCategory === 'ASYMMETRIC' &&
    jwtMetadata.kid === 'PRESENT' &&
    jwtMetadata.iss === 'EXACT_MATCH' &&
    jwtMetadata.role === 'AUTHENTICATED' &&
    jwtMetadata.sub === 'UUID_SHAPE_VALID' &&
    jwtMetadata.aud === 'EXPECTED' &&
    jwtMetadata.exp === 'VALID' &&
    jwtMetadata.iat === 'PRESENT'
      ? 'PASS'
      : 'FAIL';

  const jwksMatch: CheckState =
    jwksKeyMatch === 'MATCH' ? 'PASS' : jwksKeyMatch === 'NO_MATCH' ? 'FAIL' : 'UNKNOWN';

  const profilesRequest: CheckState =
    profilesAcceptance.httpStatus === 'HTTP_STATUS_200' ? 'PASS' : 'FAIL';

  const sufficientEvidence: EvidenceState =
    metadataShape === 'PASS' && jwksMatch === 'PASS' && profilesRequest === 'PASS'
      ? 'SUFFICIENT_EVIDENCE'
      : 'INSUFFICIENT_EVIDENCE';

  return {
    metadataShape,
    jwksMatch,
    profilesRequest,
    sufficientEvidence,
    note: METADATA_ONLY_NOTE,
  };
}

async function probeProfilesAcceptance(userId: string): Promise<ProfilesAcceptanceResult> {
  try {
    const { client } = await getProjectClient({ domain: 'profiles', operation: 'read' });
    // Existing routed client + existing allowlist. Only the row count is used;
    // returned values are never inspected, rendered, or logged.
    const { data, error } = await client
      .from('profiles')
      .select(PUBLIC_PROFILE_COLUMNS)
      .eq('id', userId)
      .limit(1);

    if (error) {
      return {
        ...classifyProfilesProbeError(error),
        rowVisibility: 'UNKNOWN',
        note: PROFILE_NO_ROW_NOTE,
      };
    }

    return {
      httpStatus: 'HTTP_STATUS_200',
      rowVisibility: Array.isArray(data) && data.length > 0 ? 'ROW_VISIBLE' : 'ROW_NOT_VISIBLE',
      errorClass: null,
      errorCode: null,
      note: PROFILE_NO_ROW_NOTE,
    };
  } catch {
    return {
      httpStatus: 'NETWORK_ERROR',
      rowVisibility: 'UNKNOWN',
      errorClass: 'network',
      errorCode: null,
      note: PROFILE_NO_ROW_NOTE,
    };
  }
}

export async function runCentralAuthProbe(): Promise<CentralAuthProbeResult> {
  let session: SessionStatus = 'NO_SESSION';
  let token: string | null = null;
  let userId: string | null = null;

  try {
    const sessionResult = await getSession();
    if (sessionResult.error) {
      session = 'SESSION_ERROR';
    } else if (!sessionResult.data?.session) {
      session = 'NO_SESSION';
    } else {
      session = 'SESSION_FOUND';
      token = await getCurrentAccessToken();
      userId = sessionResult.data.session.user?.id ?? null;
    }
  } catch {
    session = 'SESSION_ERROR';
  }

  const jwtMetadata = decodeJwtMetadata(token);
  const jwksKeyMatch = await checkJwksKeyMatch(token);
  const profilesAcceptance = userId
    ? await probeProfilesAcceptance(userId)
    : createUnknownProfilesAcceptance();

  return {
    session,
    jwtMetadata,
    jwksKeyMatch,
    profilesAcceptance,
    interpretation: buildInterpretation(session, jwtMetadata, jwksKeyMatch, profilesAcceptance),
  };
}
