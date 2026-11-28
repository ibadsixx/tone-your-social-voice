// Phase 3G-Q2: UI tests for the temporary DEV-only Profiles identity probe.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { identityMock } = vi.hoisted(() => ({ identityMock: vi.fn() }));

vi.mock('@/lib/diagnostics/centralAuthProbe', () => ({
  runCentralAuthProbe: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/diagnostics/profilesIdentityProbe', () => ({
  runProfilesIdentityProbe: (...args: unknown[]) => identityMock(...args),
}));

import DevCentralAuthProbe from '@/pages/DevCentralAuthProbe';

const BUTTON = 'Run Profiles Identity Probe';

beforeEach(() => {
  identityMock.mockReset();
});

describe('DevCentralAuthProbe Profiles identity button', () => {
  it('does not run automatically and displays three true results as PASS', async () => {
    identityMock.mockResolvedValue({
      identity_available: true,
      issuer_matches: true,
      user_id_is_uuid: true,
      status: 'PASS',
    });

    render(<DevCentralAuthProbe />);
    expect(identityMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: BUTTON }));

    expect(await screen.findByTestId('profiles-identity-result')).toBeTruthy();
    expect(identityMock).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('true')).toHaveLength(3);
    expect(screen.getByText('PASS')).toBeTruthy();
  });

  it('displays missing identity and issuer mismatch as FAIL', async () => {
    identityMock.mockResolvedValue({
      identity_available: false,
      issuer_matches: false,
      user_id_is_uuid: false,
      status: 'FAIL',
    });

    render(<DevCentralAuthProbe />);
    fireEvent.click(screen.getByRole('button', { name: BUTTON }));

    expect(await screen.findByTestId('profiles-identity-result')).toBeTruthy();
    expect(screen.getAllByText('false')).toHaveLength(3);
    expect(screen.getByText('FAIL')).toBeTruthy();
  });

  it('displays an unavailable function as INSUFFICIENT', async () => {
    identityMock.mockResolvedValue({
      identity_available: false,
      issuer_matches: false,
      user_id_is_uuid: false,
      status: 'INSUFFICIENT',
    });

    render(<DevCentralAuthProbe />);
    fireEvent.click(screen.getByRole('button', { name: BUTTON }));

    expect(await screen.findByText('INSUFFICIENT')).toBeTruthy();
  });

  it('never renders token, claim, user id, or email fields from a result', async () => {
    identityMock.mockResolvedValue({
      identity_available: true,
      issuer_matches: true,
      user_id_is_uuid: true,
      status: 'PASS',
      token: 'synthetic-token-must-not-appear',
      sub: 'synthetic-user-id-must-not-appear',
      email: 'private-person@example.test',
      claims: { iss: 'synthetic-claim-must-not-appear' },
    });

    render(<DevCentralAuthProbe />);
    fireEvent.click(screen.getByRole('button', { name: BUTTON }));

    expect(await screen.findByTestId('profiles-identity-result')).toBeTruthy();
    const rendered = document.body.textContent ?? '';
    for (const secret of [
      'synthetic-token-must-not-appear',
      'synthetic-user-id-must-not-appear',
      'private-person@example.test',
      'synthetic-claim-must-not-appear',
    ]) {
      expect(rendered).not.toContain(secret);
    }
  });
});

describe('Phase 3G-Q2 DEV-only availability', () => {
  it('keeps the probe route and page behind import.meta.env.DEV', () => {
    const root = resolve(__dirname, '..');
    const app = readFileSync(resolve(root, 'App.tsx'), 'utf8');
    const page = readFileSync(resolve(root, 'pages', 'DevCentralAuthProbe.tsx'), 'utf8');

    expect(app).toContain('import.meta.env.DEV');
    expect(app).toContain('path="/dev/central-auth-probe"');
    expect(page).toContain('if (!import.meta.env.DEV) return null;');
    expect(page).toContain(BUTTON);
  });
});
