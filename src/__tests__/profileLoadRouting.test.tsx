// Profile 404 regression suite (Phase B).
//
// The old ProfilePage navigated to /404 for ANY failed request: an ambiguous
// project route, a registry outage, a missing central Auth token and an RLS
// denial were all indistinguishable from "no such username". These tests pin
// the separation while preserving the genuine missing-profile 404.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const authState = vi.hoisted(() => ({
  user: null as { id: string } | null,
  token: null as string | null,
  loading: false,
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const profileApi = vi.hoisted(() => ({
  getProfileByUsername: vi.fn(),
  getProfileById: vi.fn(),
  findAuthUserByUsernameResult: vi.fn(),
  ensureProfile: vi.fn(),
  getProfileSearchEngineIndexing: vi.fn(async (_username: string = '') => false),
}));

vi.mock('@/api/profiles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/profiles')>();
  return {
    ...actual,
    getProfileSearchEngineIndexing: (username?: string) =>
      profileApi.getProfileSearchEngineIndexing(username),
  };
});

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>();
  return {
    ...actual,
    profilesApi: {
      ...actual.profilesApi,
      getProfileByUsername: (...args: unknown[]) => profileApi.getProfileByUsername(...args),
      getProfileById: (...args: unknown[]) => profileApi.getProfileById(...args),
      findAuthUserByUsernameResult: (...args: unknown[]) =>
        profileApi.findAuthUserByUsernameResult(...args),
      ensureProfile: (...args: unknown[]) => profileApi.ensureProfile(...args),
    },
  };
});

vi.mock('@/api/profileContent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/profileContent')>();
  return {
    ...actual,
    getProfileContentPage: vi.fn(async () => ({
      data: { items: [], has_more: false, next_cursor: null },
      error: null,
    })),
  };
});

vi.mock('@/lib/supabase/sessionTokenProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supabase/sessionTokenProvider')>();
  return {
    ...actual,
    getCurrentAccessToken: vi.fn(async () => authState.token),
  };
});

vi.mock('@/components/ProfileHeader', () => ({
  default: ({ profile, isOwnProfile }: { profile: { username: string }; isOwnProfile: boolean }) => (
    <div data-testid="profile-header" data-own={String(isOwnProfile)}>@{profile.username}</div>
  ),
}));

vi.mock('@/components/ProfileTabs', () => ({ default: () => <div data-testid="profile-tabs" /> }));

import ProfilePage from '@/pages/ProfilePage';

const PROFILE = {
  id: 'owner-1',
  username: 'Ada',
  display_name: 'Ada',
  profile_pic: null,
  cover_pic: null,
  bio: null,
  created_at: '2026-01-01T00:00:00Z',
};

function ProfileRoutes() {
  return (
    <Routes>
      <Route path="/profile/:username" element={<ProfilePage />} />
      <Route path="/profile/:username/:section" element={<ProfilePage />} />
      <Route path="/404" element={<div data-testid="notfound">not found</div>} />
    </Routes>
  );
}

function renderProfile(path = '/profile/Ada') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ProfileRoutes />
    </MemoryRouter>
  );
}

async function expectNotfound() {
  expect(await screen.findByTestId('notfound')).toBeTruthy();
  expect(screen.queryByTestId('profile-load-error')).toBeNull();
  expect(screen.queryByTestId('profile-header')).toBeNull();
}

async function expectFailure(expectedMessage: string) {
  const notice = await screen.findByTestId('profile-load-error');
  expect(notice.textContent).toContain(expectedMessage);
  expect(screen.queryByTestId('notfound')).toBeNull();
  expect(screen.queryByTestId('profile-header')).toBeNull();
}

beforeEach(() => {
  authState.user = null;
  authState.token = null;
  authState.loading = false;
  vi.clearAllMocks();
  profileApi.getProfileByUsername.mockResolvedValue({ data: PROFILE, error: null });
  profileApi.getProfileById.mockResolvedValue({ data: PROFILE, error: null });
  profileApi.findAuthUserByUsernameResult.mockResolvedValue({ data: null, error: null });
  profileApi.ensureProfile.mockResolvedValue(null);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('profile lookup outcomes', () => {
  it('loads the signed-in owner’s own profile', async () => {
    authState.user = { id: 'owner-1' };
    authState.token = 'central-session-token';

    renderProfile();

    const header = await screen.findByTestId('profile-header');
    expect(header.getAttribute('data-own')).toBe('true');
    expect(header.textContent).toContain('@Ada');
    expect(screen.queryByTestId('notfound')).toBeNull();
    expect(profileApi.getProfileByUsername).toHaveBeenCalledWith('Ada');
    expect(profileApi.findAuthUserByUsernameResult).not.toHaveBeenCalled();
  });

  it('loads a public profile for a guest', async () => {
    renderProfile();

    const header = await screen.findByTestId('profile-header');
    expect(header.getAttribute('data-own')).toBe('false');
    expect(screen.queryByTestId('notfound')).toBeNull();
    expect(screen.queryByTestId('profile-load-error')).toBeNull();
  });

  it('loads another user’s public profile for an authenticated viewer', async () => {
    authState.user = { id: 'viewer-1' };
    authState.token = 'central-session-token';

    renderProfile();

    expect((await screen.findByTestId('profile-header')).getAttribute('data-own')).toBe('false');
    expect(screen.queryByTestId('profile-load-error')).toBeNull();
  });

  it('waits for central Auth initialization instead of treating a signed-in viewer as a guest', async () => {
    authState.loading = true;
    authState.user = { id: 'viewer-1' };
    authState.token = 'central-session-token';

    const view = renderProfile();

    expect(profileApi.getProfileByUsername).not.toHaveBeenCalled();
    expect(screen.queryByTestId('notfound')).toBeNull();
    expect(screen.queryByTestId('profile-load-error')).toBeNull();

    act(() => {
      authState.loading = false;
    });
    view.rerender(
      <MemoryRouter initialEntries={['/profile/Ada']}>
        <ProfileRoutes />
      </MemoryRouter>
    );

    expect((await screen.findByTestId('profile-header')).textContent).toContain('@Ada');
    expect(profileApi.getProfileByUsername).toHaveBeenCalledWith('Ada');
    expect(screen.queryByTestId('notfound')).toBeNull();
  });

  it('keeps an RLS denial distinct from a missing profile and logs sanitized diagnostics', async () => {
    profileApi.getProfileByUsername.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied for table profiles id=secret' },
    });

    renderProfile();

    await expectFailure('This profile is not available to you.');
    expect(console.warn).toHaveBeenCalledWith(
      '[profile] load failed: kind=access-denied code=42501'
    );
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('secret');
  });

  it('does not expose a profile hidden by RLS: the readable empty result is a real 404', async () => {
    profileApi.getProfileByUsername.mockResolvedValue({ data: null, error: null });

    renderProfile();

    await expectNotfound();
  });

  it('404s an unknown username without creating a profile for a signed-in viewer', async () => {
    authState.user = { id: 'viewer-1' };
    authState.token = 'central-session-token';
    profileApi.getProfileByUsername.mockResolvedValue({ data: null, error: null });
    profileApi.findAuthUserByUsernameResult.mockResolvedValue({ data: null, error: null });

    renderProfile('/profile/nobody');

    await expectNotfound();
    expect(profileApi.findAuthUserByUsernameResult).toHaveBeenCalledWith('nobody');
    expect(profileApi.ensureProfile).not.toHaveBeenCalled();
  });

  it('treats an invalid username segment as a route error, not a missing profile', async () => {
    renderProfile('/profile/%2Fbad');

    await expectFailure('That profile link is not valid.');
    expect(profileApi.getProfileByUsername).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      '[profile] load failed: kind=invalid-route code=INVALID_ROUTE'
    );
  });

  it('normalizes an @-prefixed route segment before lookup', async () => {
    renderProfile('/profile/@Ada');

    expect((await screen.findByTestId('profile-header')).textContent).toContain('@Ada');
    expect(profileApi.getProfileByUsername).toHaveBeenCalledWith('Ada');
  });

  it('does not disguise an ambiguous project route as a 404', async () => {
    profileApi.getProfileByUsername.mockResolvedValue({
      data: null,
      error: {
        configCode: 'AMBIGUOUS_ROUTE',
        message: 'Multiple active projects for domain profiles',
      },
    });

    renderProfile();

    await expectFailure('The profile service is not configured correctly.');
    expect(console.warn).toHaveBeenCalledWith(
      '[profile] load failed: kind=routing-config code=AMBIGUOUS_ROUTE'
    );
  });

  it('does not disguise a registry load failure as a 404', async () => {
    profileApi.getProfileByUsername.mockResolvedValue({
      data: null,
      error: { message: 'Failed to load infrastructure project registry: network down' },
    });

    renderProfile();

    await expectFailure('The profile service is not configured correctly.');
  });

  it('does not disguise an ambiguous username as a 404', async () => {
    profileApi.getProfileByUsername.mockResolvedValue({
      data: null,
      error: { code: 'AMBIGUOUS_USERNAME', message: 'Ambiguous username' },
    });

    renderProfile();

    await expectFailure('That username is ambiguous.');
  });

  it('reports a missing central Auth token instead of 404ing the signed-in viewer', async () => {
    authState.user = { id: 'viewer-1' };
    authState.token = null;
    profileApi.getProfileByUsername.mockResolvedValue({ data: null, error: null });

    renderProfile();

    await expectFailure('Your session could not be verified.');
    expect(profileApi.findAuthUserByUsernameResult).not.toHaveBeenCalled();
  });

  it('reports an authentication error returned by the profile API', async () => {
    authState.user = { id: 'viewer-1' };
    authState.token = 'central-session-token';
    profileApi.getProfileByUsername.mockResolvedValue({
      data: null,
      error: { message: 'No active session' },
    });

    renderProfile();

    await expectFailure('Your session could not be verified.');
  });

  it('reports a failed auth-user lookup instead of treating it as unknown', async () => {
    authState.user = { id: 'viewer-1' };
    authState.token = 'central-session-token';
    profileApi.getProfileByUsername.mockResolvedValue({ data: null, error: null });
    profileApi.findAuthUserByUsernameResult.mockResolvedValue({
      data: null,
      error: { configCode: 'DOMAIN_NOT_FOUND', message: 'No active project for domain: users' },
    });

    renderProfile();

    await expectFailure('The profile service is not configured correctly.');
    expect(profileApi.ensureProfile).not.toHaveBeenCalled();
  });

  it('does not turn a failed profile creation into a 404', async () => {
    authState.user = { id: 'viewer-1' };
    authState.token = 'central-session-token';
    profileApi.getProfileByUsername.mockResolvedValue({ data: null, error: null });
    profileApi.findAuthUserByUsernameResult.mockResolvedValue({
      data: {
        id: 'viewer-1',
        email: 'viewer@example.test',
        raw_user_meta_data: { username: 'viewer' },
      },
      error: null,
    });
    profileApi.ensureProfile.mockResolvedValue(null);

    renderProfile();

    await expectFailure('We could not load this profile. Please try again later.');
    expect(screen.queryByTestId('notfound')).toBeNull();
  });

  it('can retry a transient failure without leaving the profile route', async () => {
    profileApi.getProfileByUsername
      .mockResolvedValueOnce({ data: null, error: { message: 'network down' } })
      .mockResolvedValueOnce({ data: PROFILE, error: null });

    renderProfile();

    await expectFailure('We could not load this profile.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.getByTestId('profile-header')).toBeTruthy());
    expect(screen.queryByTestId('notfound')).toBeNull();
  });
});
