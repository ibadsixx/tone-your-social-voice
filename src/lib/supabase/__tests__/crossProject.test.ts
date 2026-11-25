// Cross-project module tests.
// Verifies getMyProfile calls the Edge Function with the central Auth JWT
// and handles success, not-authenticated, and not-found cases.
// The Supabase JS SDK and client factory are mocked; no real connection is made.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { getMyProfile } from '@/lib/supabase/crossProject';
import {
  resetCentralAuthClient,
  initializeCentralAuth,
  getCentralAuthClient,
  getCentralAuthInitError,
} from '@/lib/supabase/centralAuth';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/clientFactory', () => ({
  getProjectClient: vi.fn(),
  getDomainSupabaseClient: vi.fn(),
  getDomainProjectConfig: vi.fn(),
  isInfrastructureConfigured: vi.fn(() => true),
}));

import {
  getProjectClient,
  getDomainSupabaseClient,
  isInfrastructureConfigured,
} from '@/lib/supabase/clientFactory';

const mockCreateClient = vi.mocked(createClient);
const mockGetProjectClient = vi.mocked(getProjectClient);
const mockGetDomainSupabaseClient = vi.mocked(getDomainSupabaseClient);
const mockIsInfrastructureConfigured = vi.mocked(isInfrastructureConfigured);
const mockGetCentralAuthClient = vi.mocked(getCentralAuthClient);
const mockGetCentralAuthInitError = vi.mocked(getCentralAuthInitError);

const mockAuthClient = {
  auth: {
    getSession: vi.fn(),
  },
};

const mockProfile = {
  id: 'user-1',
  email: 'test@example.com',
  username: 'testuser',
  display_name: 'Test User',
  profile_pic: null,
};

beforeEach(async () => {
  resetCentralAuthClient();
  vi.resetAllMocks();
  mockCreateClient.mockReturnValue(mockAuthClient as any);
  mockIsInfrastructureConfigured.mockReturnValue(true);
  mockGetProjectClient.mockResolvedValue({
    route: {
      project: {
        project_key: 'users_1',
        domain: 'users',
        project_url: 'https://users.supabase.co',
        anon_key: 'users-anon-key',
        status: 'active',
        priority: 1,
        region: 'us-east',
        health_status: 'online',
      },
    },
  } as any);
  // Initialize central auth so getCentralAuthClient() returns a client
  await initializeCentralAuth();
});

afterEach(() => {
  resetCentralAuthClient();
  vi.resetAllMocks();
});

describe('getMyProfile', () => {
  it('returns the profile when authenticated and profile exists', async () => {
    vi.mocked(mockAuthClient.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'token-123' } },
      error: null,
    } as any);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: mockProfile,
        error: null,
      }),
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const result = await getMyProfile();

    expect(result.error).toBeNull();
    expect(result.data).toEqual(mockProfile);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/functions/v1/getProfile'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
      })
    );
  });

  it('returns an error when not authenticated', async () => {
    vi.mocked(mockAuthClient.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as any);

    const result = await getMyProfile();

    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.error?.message).toBe('No active session');
  });

  it('returns an error when the profile is not found', async () => {
    vi.mocked(mockAuthClient.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'token-123' } },
      error: null,
    } as any);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: null,
        error: 'Profile not found',
      }),
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const result = await getMyProfile();

    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.error?.message).toBe('Profile not found');
  });

  it('returns an error when the Edge Function returns 401', async () => {
    vi.mocked(mockAuthClient.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'token-123' } },
      error: null,
    } as any);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({
        error: 'Authentication required',
      }),
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const result = await getMyProfile();

    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.error?.message).toBe('Authentication required');
  });

  it('returns an error when auth client is not initialized', async () => {
    resetCentralAuthClient();

    const result = await getMyProfile();

    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain('not initialized');
  });
});
