// Phase 3G-Q2: unit tests for the allow-listed Profiles identity probe call.
// No token or raw claim is available to this module.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getProjectClientMock, rpcMock } = vi.hoisted(() => ({
  getProjectClientMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('@/lib/supabase/clientFactory', () => ({
  getProjectClient: getProjectClientMock,
}));

import {
  classifyProfilesIdentityProbe,
  runProfilesIdentityProbe,
} from '@/lib/diagnostics/profilesIdentityProbe';

beforeEach(() => {
  getProjectClientMock.mockReset();
  rpcMock.mockReset();
  getProjectClientMock.mockResolvedValue({ client: { rpc: rpcMock } });
});

describe('Phase 3G-Q2 Profiles identity probe module', () => {
  it('classifies three true results as PASS', () => {
    expect(
      classifyProfilesIdentityProbe({
        identity_available: true,
        issuer_matches: true,
        user_id_is_uuid: true,
      })
    ).toEqual({
      identity_available: true,
      issuer_matches: true,
      user_id_is_uuid: true,
      status: 'PASS',
    });
  });

  it('classifies missing identity and issuer mismatch as FAIL', () => {
    expect(
      classifyProfilesIdentityProbe({
        identity_available: false,
        issuer_matches: false,
        user_id_is_uuid: false,
      }).status
    ).toBe('FAIL');

    expect(
      classifyProfilesIdentityProbe({
        identity_available: true,
        issuer_matches: false,
        user_id_is_uuid: true,
      }).status
    ).toBe('FAIL');
  });

  it('calls the zero-argument RPC through the routed profiles client', async () => {
    rpcMock.mockResolvedValue({
      data: [{ identity_available: true, issuer_matches: true, user_id_is_uuid: true }],
      error: null,
    });

    const result = await runProfilesIdentityProbe();

    expect(getProjectClientMock).toHaveBeenCalledWith({ domain: 'profiles', operation: 'read' });
    expect(rpcMock).toHaveBeenCalledWith('tone_identity_probe');
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('PASS');
  });

  it('returns INSUFFICIENT for an RPC error and never exposes the raw error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'secret-db-error-detail' } });

    const result = await runProfilesIdentityProbe();

    expect(result).toEqual({
      identity_available: false,
      issuer_matches: false,
      user_id_is_uuid: false,
      status: 'INSUFFICIENT',
    });
    expect(JSON.stringify(result)).not.toContain('secret-db-error-detail');
  });

  it('returns INSUFFICIENT when the client or RPC throws', async () => {
    getProjectClientMock.mockRejectedValueOnce(new Error('routing-failure'));
    await expect(runProfilesIdentityProbe()).resolves.toMatchObject({ status: 'INSUFFICIENT' });

    getProjectClientMock.mockResolvedValueOnce({ client: { rpc: rpcMock } });
    rpcMock.mockRejectedValueOnce(new Error('rpc-throw-detail'));
    const result = await runProfilesIdentityProbe();
    expect(result.status).toBe('INSUFFICIENT');
    expect(JSON.stringify(result)).not.toContain('rpc-throw-detail');
  });

  it('allow-lists response fields so tokens, claims, ids, and emails cannot leak', () => {
    const result = classifyProfilesIdentityProbe({
      identity_available: true,
      issuer_matches: true,
      user_id_is_uuid: true,
      token: 'synthetic-token-must-not-leak',
      sub: 'synthetic-user-id-must-not-leak',
      email: 'private-person@example.test',
      claims: { iss: 'synthetic-claim-must-not-leak' },
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('synthetic-token-must-not-leak');
    expect(serialized).not.toContain('synthetic-user-id-must-not-leak');
    expect(serialized).not.toContain('private-person@example.test');
    expect(serialized).not.toContain('synthetic-claim-must-not-leak');
    expect(Object.keys(result).sort()).toEqual([
      'identity_available',
      'issuer_matches',
      'status',
      'user_id_is_uuid',
    ]);
  });

  it('contains no token logging or raw error rendering in source', () => {
    const source = readFileSync(
      resolve(__dirname, '..', 'lib', 'diagnostics', 'profilesIdentityProbe.ts'),
      'utf8'
    );
    expect(source).not.toMatch(/console\.(log|error|warn|info)/);
    expect(source).not.toMatch(/getCurrentAccessToken|getSession/);
    expect(source).not.toMatch(/\bemail\b/i);
    expect(source).not.toMatch(/\bjwt\b/i);
  });
});
