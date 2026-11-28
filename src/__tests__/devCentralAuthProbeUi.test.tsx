// UI-level guard for the temporary development-only diagnostic.
// Verifies that it never auto-runs and that extra/sensitive fields on a result
// are not rendered.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runMock } = vi.hoisted(() => ({ runMock: vi.fn() }));

vi.mock('@/lib/diagnostics/centralAuthProbe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/diagnostics/centralAuthProbe')>();
  return {
    ...actual,
    runCentralAuthProbe: (...args: unknown[]) => runMock(...args),
  };
});

import DevCentralAuthProbe from '@/pages/DevCentralAuthProbe';

describe('DevCentralAuthProbe UI', () => {
  beforeEach(() => {
    runMock.mockReset();
  });

  it('requires an explicit click and renders only sanitized values', async () => {
    runMock.mockResolvedValue({
      session: 'SESSION_FOUND',
      jwtMetadata: {
        algorithmCategory: 'ASYMMETRIC',
        kid: 'PRESENT',
        iss: 'EXACT_MATCH',
        role: 'AUTHENTICATED',
        sub: 'UUID_SHAPE_VALID',
        aud: 'EXPECTED',
        exp: 'VALID',
        iat: 'PRESENT',
      },
      jwksKeyMatch: 'MATCH',
      profilesAcceptance: {
        httpStatus: 'HTTP_STATUS_200',
        rowVisibility: 'ROW_NOT_VISIBLE',
        errorClass: null,
        errorCode: null,
        note: 'note',
      },
      interpretation: {
        metadataShape: 'PASS',
        jwksMatch: 'PASS',
        profilesRequest: 'PASS',
        sufficientEvidence: 'SUFFICIENT_EVIDENCE',
        note: 'note',
      },
      // Extra fields must never reach the DOM.
      token: 'synthetic-token-value-must-not-appear',
      email: 'private-person@example.test',
    });

    render(<DevCentralAuthProbe />);

    expect(screen.getByText('Development only — temporary diagnostic')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Run Central Auth / Profiles Compatibility Check' })
    ).toBeTruthy();
    expect(runMock).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Run Central Auth / Profiles Compatibility Check' })
    );

    await waitFor(() => expect(runMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('SESSION_FOUND')).toBeTruthy();

    const rendered = document.body.textContent ?? '';
    expect(rendered).not.toContain('synthetic-token-value-must-not-appear');
    expect(rendered).not.toContain('private-person@example.test');
    expect(screen.getByText('SUFFICIENT_EVIDENCE')).toBeTruthy();
  });
});
