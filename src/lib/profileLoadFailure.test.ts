// Phase 3G-A: profile-load failures must be classified by cause and sanitized.
// In particular, PGRST301 is an invalid JWT (authentication), not an RLS denial
// and never a missing profile.
import { describe, expect, it } from 'vitest';
import {
  classifyProfileLoadFailure,
  describeProfileLoadFailure,
  type ProfileLoadFailureKind,
} from './profileLoadFailure';

const cases: Array<{
  label: string;
  error: { message?: unknown; code?: unknown; configCode?: unknown } | null | undefined;
  kind: ProfileLoadFailureKind;
  code: string | null;
}> = [
  {
    label: 'registry domain missing',
    error: { code: 'DOMAIN_NOT_FOUND', message: 'No active project' },
    kind: 'routing-config',
    code: 'DOMAIN_NOT_FOUND',
  },
  {
    label: 'ambiguous project route',
    error: { configCode: 'AMBIGUOUS_ROUTE', message: 'Multiple active projects' },
    kind: 'routing-config',
    code: 'AMBIGUOUS_ROUTE',
  },
  {
    label: 'invalid route segment',
    error: { code: 'INVALID_ROUTE', message: 'Invalid profile route' },
    kind: 'invalid-route',
    code: 'INVALID_ROUTE',
  },
  {
    label: 'ambiguous username',
    error: { code: 'AMBIGUOUS_USERNAME', message: 'Ambiguous username' },
    kind: 'ambiguous-username',
    code: 'AMBIGUOUS_USERNAME',
  },
  {
    label: '401',
    error: { code: '401', message: 'Unauthorized' },
    kind: 'authentication',
    code: '401',
  },
  {
    label: 'UNAUTHORIZED',
    error: { code: 'UNAUTHORIZED', message: 'No active session' },
    kind: 'authentication',
    code: 'UNAUTHORIZED',
  },
  {
    label: 'SESSION_EXPIRED',
    error: { code: 'SESSION_EXPIRED', message: 'Session expired' },
    kind: 'authentication',
    code: 'SESSION_EXPIRED',
  },
  {
    label: 'PGRST301 invalid JWT',
    error: { code: 'PGRST301', message: 'JWT could not be decoded' },
    kind: 'authentication',
    code: 'PGRST301',
  },
  {
    label: 'PGRST302 bearer authentication required',
    error: { code: 'PGRST302', message: 'Bearer authentication required' },
    kind: 'authentication',
    code: 'PGRST302',
  },
  {
    label: 'PGRST303 JWT claims validation failed',
    error: { code: 'PGRST303', message: 'JWT claims validation failed' },
    kind: 'authentication',
    code: 'PGRST303',
  },
  {
    label: 'JWT-shaped message without a code',
    error: { message: 'No suitable key or wrong key type for JWT' },
    kind: 'authentication',
    code: 'AUTH',
  },
  {
    label: '42501 RLS denial',
    error: { code: '42501', message: 'permission denied for table profiles' },
    kind: 'access-denied',
    code: '42501',
  },
  {
    label: '403 forbidden',
    error: { code: '403', message: 'forbidden' },
    kind: 'access-denied',
    code: '403',
  },
  {
    label: 'row-level security message',
    error: { message: 'row-level security policy violated' },
    kind: 'access-denied',
    code: null,
  },
  {
    label: 'unknown query failure',
    error: { code: 'PGRST500', message: 'database is offline' },
    kind: 'query',
    code: 'PGRST500',
  },
  {
    label: 'no error object',
    error: null,
    kind: 'query',
    code: null,
  },
];

describe('classifyProfileLoadFailure', () => {
  it.each(cases)('classifies $label', ({ error, kind, code }) => {
    expect(classifyProfileLoadFailure(error)).toEqual({
      kind,
      code,
      message: expect.any(String),
    });
  });

  it('never emits raw error text or unsafe codes in diagnostics', () => {
    const failure = classifyProfileLoadFailure({
      code: 'PGRST301 with spaces and <script>',
      message: 'JWT Bearer eyJhbGciOi... secret-token-plain-text',
    });

    expect(failure.code).toBe('AUTH');
    expect(describeProfileLoadFailure(failure)).toBe(
      '[profile] load failed: kind=authentication code=AUTH'
    );
    expect(describeProfileLoadFailure(failure)).not.toContain('secret-token');
    expect(describeProfileLoadFailure(failure)).not.toContain('Bearer');

    const unsafeCode = classifyProfileLoadFailure({
      code: 'PGRST301 with spaces and <script>',
      message: 'database offline',
    });
    expect(unsafeCode.code).toBeNull();
  });
});
