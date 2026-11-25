// Sanitized classification of profile-load failures.
//
// The profile page used to send every failed request to /404. That made a
// registry outage, an ambiguous project route, a missing central Auth session
// or an RLS denial indistinguishable from "this user does not exist". These
// helpers keep those outcomes separate in application behavior and diagnostics.
//
// Only an allow-listed code and a fixed public message leave this module: raw
// query text, URLs, headers, JWTs and row data are never logged or displayed.

export type ProfileLoadFailureKind =
  | 'invalid-route'
  | 'routing-config'
  | 'authentication'
  | 'access-denied'
  | 'ambiguous-username'
  | 'query';

export interface ProfileLoadFailure {
  kind: ProfileLoadFailureKind;
  /** Allow-listed machine code, or null. Never a raw error string. */
  code: string | null;
  message: string;
}

export interface ProfileLoadErrorLike {
  message?: unknown;
  code?: unknown;
  configCode?: unknown;
}

const ROUTING_CODES = new Set([
  'DOMAIN_NOT_FOUND',
  'PROJECT_NOT_FOUND',
  'AMBIGUOUS_ROUTE',
  'INVALID_CONFIG',
  'INIT_ERROR',
  'LOAD_ERROR',
  'NO_PROJECTS',
]);

const AUTH_CODES = new Set(['401', 'UNAUTHORIZED', 'NO_SESSION', 'SESSION_EXPIRED']);
const ACCESS_CODES = new Set(['42501', '403', 'FORBIDDEN', 'PGRST301']);
const SAFE_CODE = /^[A-Za-z0-9_-]{1,40}$/;

const MESSAGES: Record<ProfileLoadFailureKind, string> = {
  'invalid-route': 'That profile link is not valid. Check the username in the address bar.',
  'routing-config': 'The profile service is not configured correctly. Please try again later.',
  authentication: 'Your session could not be verified. Please sign in again.',
  'access-denied': 'This profile is not available to you.',
  'ambiguous-username': 'That username is ambiguous. Check the profile link.',
  query: 'We could not load this profile. Please try again later.',
};

function safeCode(value: unknown): string | null {
  if (typeof value !== 'string' || !SAFE_CODE.test(value)) return null;
  return value;
}

function failure(kind: ProfileLoadFailureKind, code: unknown = null): ProfileLoadFailure {
  return { kind, code: safeCode(code), message: MESSAGES[kind] };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

/**
 * Classify an error returned by the profile API/data client.
 * `null` means the error is not recognized; callers still treat it as a query
 * failure, never as a missing profile.
 */
export function classifyProfileLoadFailure(error: ProfileLoadErrorLike | null | undefined): ProfileLoadFailure {
  if (!error) return failure('query');

  const configCode = safeCode(error.configCode);
  if (configCode && (ROUTING_CODES.has(configCode) || configCode === 'AMBIGUOUS_USERNAME')) {
    return configCode === 'AMBIGUOUS_USERNAME'
      ? failure('ambiguous-username', configCode)
      : failure('routing-config', configCode);
  }

  const code = safeCode(error.code);
  const message = text(error.message);

  if (code === 'INVALID_ROUTE') return failure('invalid-route', code);
  if (code === 'AMBIGUOUS_USERNAME') return failure('ambiguous-username', code);
  if (
    (code && ROUTING_CODES.has(code)) ||
    /failed to load infrastructure project registry|infrastructure (?:supabase )?(?:is not configured|configuration)|not configured\. set vite_infra|infrastructure registry view not found|registry access denied/.test(message)
  ) {
    return failure('routing-config', code);
  }
  if (
    (code && AUTH_CODES.has(code)) ||
    /no active session|not authenticated|authentication required|auth client not initialized|central auth|access token|session (?:expired|could not|failed)|jwt/.test(message)
  ) {
    return failure('authentication', code ?? 'AUTH');
  }
  if ((code && ACCESS_CODES.has(code)) || /permission denied|row-level security|rls|forbidden/.test(message)) {
    return failure('access-denied', code);
  }
  return failure('query', code);
}

/** Log-only description: codes are allow-listed and messages are fixed strings. */
export function describeProfileLoadFailure(failure: ProfileLoadFailure): string {
  return `[profile] load failed: kind=${failure.kind} code=${failure.code ?? 'none'}`;
}
