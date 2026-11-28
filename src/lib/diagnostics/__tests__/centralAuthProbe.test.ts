// Focused tests for the temporary Central Auth / Profiles compatibility probe.
// These use synthetic, non-real values only. The assertions verify that only
// allow-listed status strings leave the sanitization/classification helpers.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CENTRAL_AUTH_ISSUER,
  CENTRAL_AUTH_JWKS_URL,
  buildInterpretation,
  checkJwksKeyMatch,
  classifyProfilesProbeError,
  decodeJwtMetadata,
  type CentralAuthProbeResult,
} from '@/lib/diagnostics/centralAuthProbe';

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function makeToken(header: Record<string, unknown>, payload: Record<string, unknown>): string {
  return `${encodeSegment(header)}.${encodeSegment(payload)}.synthetic-signature`;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('decodeJwtMetadata sanitization', () => {
  it('returns only allow-listed status values and no identifying metadata', () => {
    const nowMs = 1_800_000_000_000;
    const fakeKid = 'fake-kid-value-must-not-appear';
    const fakeSub = '550e8400-e29b-41d4-a716-446655440000';
    const fakeEmail = 'private-person@example.test';
    const fakeUsername = 'private-username-value';

    const token = makeToken(
      { alg: 'ES256', kid: fakeKid },
      {
        iss: CENTRAL_AUTH_ISSUER,
        role: 'authenticated',
        sub: fakeSub,
        aud: 'authenticated',
        exp: Math.floor(nowMs / 1000) + 600,
        iat: Math.floor(nowMs / 1000) - 60,
        email: fakeEmail,
        username: fakeUsername,
      }
    );

    const result = decodeJwtMetadata(token, nowMs);

    expect(result).toEqual({
      algorithmCategory: 'ASYMMETRIC',
      kid: 'PRESENT',
      iss: 'EXACT_MATCH',
      role: 'AUTHENTICATED',
      sub: 'UUID_SHAPE_VALID',
      aud: 'EXPECTED',
      exp: 'VALID',
      iat: 'PRESENT',
    });

    const serialized = JSON.stringify(result);
    for (const sensitive of [fakeKid, fakeSub, fakeEmail, fakeUsername]) {
      expect(serialized).not.toContain(sensitive);
    }
  });

  it('classifies symmetric and unknown algorithms without exposing alg text', () => {
    const symmetric = decodeJwtMetadata(
      makeToken({ alg: 'HS256' }, { iss: CENTRAL_AUTH_ISSUER }),
      1_800_000_000_000
    );
    expect(symmetric.algorithmCategory).toBe('SYMMETRIC');
    expect(JSON.stringify(symmetric)).not.toContain('HS256');

    const unknown = decodeJwtMetadata(
      makeToken({ alg: 'MADE_UP' }, { iss: CENTRAL_AUTH_ISSUER }),
      1_800_000_000_000
    );
    expect(unknown.algorithmCategory).toBe('UNKNOWN');
    expect(JSON.stringify(unknown)).not.toContain('MADE_UP');
  });

  it('reports missing and expired claim values using only allowed labels', () => {
    const nowMs = 1_800_000_000_000;
    const result = decodeJwtMetadata(
      makeToken(
        { alg: 'ES256' },
        {
          iss: 'https://wrong-issuer.example.test/auth/v1',
          role: 'anon',
          sub: 'not-a-uuid',
          aud: ['other'],
          exp: Math.floor(nowMs / 1000) - 10,
        }
      ),
      nowMs
    );

    expect(result).toEqual({
      algorithmCategory: 'ASYMMETRIC',
      kid: 'MISSING',
      iss: 'MISMATCH',
      role: 'OTHER',
      sub: 'INVALID',
      aud: 'OTHER',
      exp: 'EXPIRED',
      iat: 'MISSING',
    });
  });
});

describe('checkJwksKeyMatch', () => {
  it('fetches only public JWKS metadata and does not send the token', async () => {
    const fakeKid = 'fake-kid-value-must-not-appear';
    const token = makeToken({ alg: 'ES256', kid: fakeKid }, {});
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [{ kid: fakeKid }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkJwksKeyMatch(token);

    expect(result).toBe('MATCH');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      CENTRAL_AUTH_JWKS_URL,
      expect.objectContaining({ method: 'GET' })
    );
    const init = fetchMock.mock.calls[0][1] as Record<string, unknown>;
    expect(init.headers).toBeUndefined();
    expect(JSON.stringify(init)).not.toContain(fakeKid);
    expect(JSON.stringify(init)).not.toContain(token);
  });
});

describe('classifyProfilesProbeError', () => {
  it('maps authentication errors to 401 with only an allow-listed code', () => {
    const result = classifyProfilesProbeError({
      code: 'PGRST301',
      message: 'JWT could not be decoded with private details',
    });
    expect(result).toEqual({
      httpStatus: 'HTTP_STATUS_401',
      errorClass: 'authentication',
      errorCode: 'PGRST301',
    });
    expect(JSON.stringify(result)).not.toContain('private details');
  });

  it('maps RLS/permission errors to 403', () => {
    expect(
      classifyProfilesProbeError({ code: '42501', message: 'permission denied for table profiles' })
    ).toEqual({
      httpStatus: 'HTTP_STATUS_403',
      errorClass: 'access-denied',
      errorCode: '42501',
    });
  });
});

describe('buildInterpretation', () => {
  const validMetadata = decodeJwtMetadata(
    makeToken(
      { alg: 'ES256', kid: 'fake-kid' },
      {
        iss: CENTRAL_AUTH_ISSUER,
        role: 'authenticated',
        sub: '550e8400-e29b-41d4-a716-446655440000',
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 600,
        iat: Math.floor(Date.now() / 1000) - 10,
      }
    ),
    Date.now()
  );

  it('treats a 200 with no visible row as Profiles acceptance, not authentication failure', () => {
    const result = buildInterpretation(
      'SESSION_FOUND',
      validMetadata,
      'MATCH',
      {
        httpStatus: 'HTTP_STATUS_200',
        rowVisibility: 'ROW_NOT_VISIBLE',
        errorClass: null,
        errorCode: null,
        note: 'note',
      }
    );

    expect(result.profilesRequest).toBe('PASS');
    expect(result.sufficientEvidence).toBe('SUFFICIENT_EVIDENCE');
  });

  it('withholds sufficiency when JWKS matching fails', () => {
    const result = buildInterpretation(
      'SESSION_FOUND',
      validMetadata,
      'NO_MATCH',
      {
        httpStatus: 'HTTP_STATUS_200',
        rowVisibility: 'ROW_VISIBLE',
        errorClass: null,
        errorCode: null,
        note: 'note',
      }
    );

    expect(result.jwksMatch).toBe('FAIL');
    expect(result.sufficientEvidence).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('reports all checks unknown when there is no session', () => {
    const result = buildInterpretation(
      'NO_SESSION',
      validMetadata,
      'MATCH',
      {
        httpStatus: 'HTTP_STATUS_200',
        rowVisibility: 'ROW_VISIBLE',
        errorClass: null,
        errorCode: null,
        note: 'note',
      }
    );

    expect(result).toMatchObject({
      metadataShape: 'UNKNOWN',
      jwksMatch: 'UNKNOWN',
      profilesRequest: 'UNKNOWN',
      sufficientEvidence: 'INSUFFICIENT_EVIDENCE',
    } satisfies Partial<CentralAuthProbeResult['interpretation']>);
  });
});
