// Central Auth client tests.
// Verifies sign in, sign up, sign out, session, get user, refresh session,
// and initialization. The Supabase JS SDK and clientFactory are mocked; no real
// connection is made.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  signInWithPassword,
  signUp,
  signOut,
  getSession,
  getUser,
  refreshSession,
  updateUser,
  initializeCentralAuth,
  resetCentralAuthClient,
  getCentralAuthClient,
  getCentralAuthInitError,
} from '@/lib/supabase/centralAuth';
import {
  getDomainSupabaseClient,
  isInfrastructureConfigured,
} from '@/lib/supabase/clientFactory';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/clientFactory', () => ({
  getDomainSupabaseClient: vi.fn(),
  isInfrastructureConfigured: vi.fn(() => true),
}));

const mockCreateClient = vi.mocked(createClient);
const mockGetDomainSupabaseClient = vi.mocked(getDomainSupabaseClient);
const mockIsInfrastructureConfigured = vi.mocked(isInfrastructureConfigured);

const mockAuth = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
  refreshSession: vi.fn(),
  updateUser: vi.fn(),
  onAuthStateChange: vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  })),
  mfa: {
    listFactors: vi.fn(),
    enroll: vi.fn(),
    challenge: vi.fn(),
    verify: vi.fn(),
    unenroll: vi.fn(),
  },
};

const mockClient = {
  auth: mockAuth,
};

const mockProject = {
  project_key: 'users_1',
  domain: 'users',
  project_url: 'https://users.supabase.co',
  anon_key: 'users-anon-key',
  status: 'active',
  priority: 1,
  region: 'us-east',
  health_status: 'online',
};

beforeEach(() => {
  resetCentralAuthClient();
  vi.resetAllMocks();
  mockCreateClient.mockReturnValue(mockClient);
  mockIsInfrastructureConfigured.mockReturnValue(true);
  mockGetDomainSupabaseClient.mockResolvedValue({
    client: mockClient,
    project: mockProject,
  });
});

afterEach(() => {
  resetCentralAuthClient();
  vi.resetAllMocks();
});

describe('initializeCentralAuth', () => {
  it('initializes the central Auth client when registry returns users project', async () => {
    await initializeCentralAuth();

    expect(getCentralAuthClient()).toBe(mockClient);
    expect(getCentralAuthInitError()).toBeNull();
  });

  it('throws when infrastructure is not configured', async () => {
    mockIsInfrastructureConfigured.mockReturnValue(false);

    await expect(initializeCentralAuth()).rejects.toThrow(
      'Infrastructure Supabase is not configured'
    );
    expect(getCentralAuthInitError()).toContain('not configured');
  });
});

describe('signInWithPassword', () => {
  it('signs in successfully', async () => {
    vi.mocked(mockAuth.signInWithPassword).mockResolvedValue({
      data: {
        user: { id: 'user-1', email: 'test@example.com' },
        session: { access_token: 'token-123' },
      },
      error: null,
    } as any);

    await initializeCentralAuth();
    const result = await signInWithPassword({
      email: 'test@example.com',
      password: 'password123',
    });

    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
    expect(result.data?.user).toEqual({
      id: 'user-1',
      email: 'test@example.com',
    });
    expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    });
  });

  it('returns error on invalid credentials', async () => {
    vi.mocked(mockAuth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    } as any);

    await initializeCentralAuth();
    const result = await signInWithPassword({
      email: 'test@example.com',
      password: 'wrong',
    });

    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.error?.message).toBe('Invalid login credentials');
  });
});

describe('signUp', () => {
  it('signs up successfully', async () => {
    vi.mocked(mockAuth.signUp).mockResolvedValue({
      data: { user: { id: 'user-2', email: 'new@example.com' } },
      error: null,
    } as any);

    await initializeCentralAuth();
    const result = await signUp({
      email: 'new@example.com',
      password: 'password123',
      options: { data: { username: 'newuser' } },
    });

    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
    expect(result.data?.user).toEqual({
      id: 'user-2',
      email: 'new@example.com',
    });
  });
});

describe('signOut', () => {
  it('signs out successfully', async () => {
    vi.mocked(mockAuth.signOut).mockResolvedValue({ error: null } as any);

    await initializeCentralAuth();
    const result = await signOut();

    expect(result.error).toBeNull();
    expect(mockAuth.signOut).toHaveBeenCalled();
  });
});

describe('getSession', () => {
  it('returns the current session', async () => {
    const mockSession = {
      access_token: 'token-123',
      refresh_token: 'refresh-123',
      expires_at: 9999999999,
    };
    vi.mocked(mockAuth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    } as any);

    await initializeCentralAuth();
    const result = await getSession();

    expect(result.error).toBeNull();
    expect(result.data?.session).toEqual(mockSession);
  });

  it('returns null session when not signed in', async () => {
    vi.mocked(mockAuth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as any);

    await initializeCentralAuth();
    const result = await getSession();

    expect(result.error).toBeNull();
    expect(result.data?.session).toBeNull();
  });
});

describe('getUser', () => {
  it('returns the current user', async () => {
    const mockUser = { id: 'user-1', email: 'test@example.com' };
    vi.mocked(mockAuth.getUser).mockResolvedValue({
      data: { user: mockUser },
      error: null,
    } as any);

    await initializeCentralAuth();
    const result = await getUser();

    expect(result.error).toBeNull();
    expect(result.data?.user).toEqual(mockUser);
  });

  it('returns null when no user', async () => {
    vi.mocked(mockAuth.getUser).mockResolvedValue({
      data: { user: null },
      error: null,
    } as any);

    await initializeCentralAuth();
    const result = await getUser();

    expect(result.error).toBeNull();
    expect(result.data?.user).toBeNull();
  });
});

describe('refreshSession', () => {
  it('refreshes the session successfully', async () => {
    vi.mocked(mockAuth.refreshSession).mockResolvedValue({
      data: {
        session: {
          access_token: 'new-token',
          refresh_token: 'new-refresh',
        },
      },
      error: null,
    } as any);

    await initializeCentralAuth();
    const result = await refreshSession();

    expect(result.error).toBeNull();
    expect(result.data?.session).toEqual({
      access_token: 'new-token',
      refresh_token: 'new-refresh',
    });
  });
});

describe('updateUser', () => {
  it('updates user metadata', async () => {
    vi.mocked(mockAuth.updateUser).mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@example.com' } },
      error: null,
    } as any);

    await initializeCentralAuth();
    const result = await updateUser({
      attributes: { display_name: 'New Name' },
    });

    expect(result.error).toBeNull();
    expect(result.data?.user).toEqual({
      id: 'user-1',
      email: 'test@example.com',
    });
  });
});

describe('resetCentralAuthClient', () => {
  it('clears the cached client', async () => {
    await initializeCentralAuth();
    expect(getCentralAuthClient()).toBe(mockClient);

    resetCentralAuthClient();
    expect(getCentralAuthClient()).toBeNull();
    expect(getCentralAuthInitError()).toBeNull();
  });
});
