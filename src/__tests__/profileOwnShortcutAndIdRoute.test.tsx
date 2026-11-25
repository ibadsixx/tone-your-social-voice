// Runtime-level regressions for the two reported routes:
//   /profile          -> the signed-in user's own-profile shortcut (no id param)
//   /profile/:id      -> a profile-id URL, which must query `id`, not `username`
//
// Both routes render the real components; only data seams and unrelated heavy
// children are mocked. A routing/config/auth failure must surface as a load
// error, while only a readable empty result may become the 404 page.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const state = vi.hoisted(() => ({
  user: null as {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  } | null,
  token: null as string | null,
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => state }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useProfileSeo', () => ({ useProfileSeo: () => {} }));

const profileApi = vi.hoisted(() => ({
  getProfileById: vi.fn(),
  getProfileByUsername: vi.fn(),
  ensureProfile: vi.fn(),
  findAuthUserByUsernameResult: vi.fn(),
}));

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>();
  return {
    ...actual,
    profilesApi: {
      ...actual.profilesApi,
      getProfileById: (...args: unknown[]) => profileApi.getProfileById(...args),
      getProfileByUsername: (...args: unknown[]) => profileApi.getProfileByUsername(...args),
      ensureProfile: (...args: unknown[]) => profileApi.ensureProfile(...args),
      findAuthUserByUsernameResult: (...args: unknown[]) =>
        profileApi.findAuthUserByUsernameResult(...args),
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
  return { ...actual, getCurrentAccessToken: vi.fn(async () => state.token) };
});

vi.mock('@/components/ProfileHeader', () => ({
  default: ({
    profile,
    isOwnProfile,
  }: {
    profile: { id: string; username: string };
    isOwnProfile: boolean;
  }) => (
    <div
      data-testid="profile-header"
      data-own={String(isOwnProfile)}
      data-profile-id={profile.id}
    >
      @{profile.username}
    </div>
  ),
}));

vi.mock('@/components/ProfileTabs', () => ({ default: () => <div data-testid="profile-tabs" /> }));

import Profile from '@/pages/Profile';
import ProfilePage from '@/pages/ProfilePage';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const owner = {
  id: OWNER_ID,
  username: 'Ada',
  display_name: 'Ada',
  profile_pic: null,
  cover_pic: null,
  bio: null,
  created_at: '2026-01-01T00:00:00Z',
};

const other = {
  id: OTHER_ID,
  username: 'Grace',
  display_name: 'Grace',
  profile_pic: null,
  cover_pic: null,
  bio: null,
  created_at: '2026-01-01T00:00:00Z',
};

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="route-location" data-path={location.pathname} />;
};

function renderRoutes(initialEntries: string[]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <LocationProbe />
      <Routes>
        <Route path="/profile" element={<Profile />} />
        <Route path="/profile/:username" element={<ProfilePage />} />
        <Route path="/404" element={<div data-testid="notfound">not found</div>} />
      </Routes>
    </MemoryRouter>
  );
}

async function expectLoadError(message: string) {
  const notice = await screen.findByTestId('profile-load-error');
  expect(notice.textContent).toContain(message);
  expect(screen.queryByTestId('notfound')).toBeNull();
  expect(screen.queryByTestId('profile-header')).toBeNull();
}

beforeEach(() => {
  state.user = null;
  state.token = null;
  vi.clearAllMocks();
  profileApi.getProfileById.mockResolvedValue({ data: owner, error: null });
  profileApi.getProfileByUsername.mockResolvedValue({ data: owner, error: null });
  profileApi.ensureProfile.mockResolvedValue(owner);
  profileApi.findAuthUserByUsernameResult.mockResolvedValue({ data: null, error: null });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the /profile own-profile shortcut', () => {
  it('resolves from the authenticated session, not a route id, and loads the owner profile', async () => {
    state.user = { id: OWNER_ID, email: 'ada@example.test', user_metadata: { username: 'Ada' } };
    state.token = 'central-session-token';

    renderRoutes(['/profile']);

    await waitFor(() =>
      expect(screen.getByTestId('route-location').getAttribute('data-path')).toBe('/profile/Ada')
    );
    expect(profileApi.getProfileById).toHaveBeenCalledWith(OWNER_ID);
    expect(profileApi.getProfileById).toHaveBeenCalledTimes(1);
    expect(profileApi.ensureProfile).not.toHaveBeenCalled();

    const header = await screen.findByTestId('profile-header');
    expect(header.getAttribute('data-own')).toBe('true');
    expect(header.textContent).toContain('@Ada');
    expect(screen.queryByTestId('notfound')).toBeNull();
    expect(screen.queryByTestId('profile-load-error')).toBeNull();
  });

  it('creates the lazily provisioned row before redirecting a new account', async () => {
    state.user = { id: OWNER_ID, email: 'ada@example.test', user_metadata: { username: 'Ada' } };
    state.token = 'central-session-token';
    profileApi.getProfileById.mockResolvedValueOnce({ data: null, error: null });
    profileApi.ensureProfile.mockResolvedValueOnce(owner);

    renderRoutes(['/profile']);

    await waitFor(() =>
      expect(screen.getByTestId('route-location').getAttribute('data-path')).toBe('/profile/Ada')
    );
    expect(profileApi.ensureProfile).toHaveBeenCalledWith({
      id: OWNER_ID,
      email: 'ada@example.test',
      user_metadata: { username: 'Ada' },
    });
    expect(screen.queryByTestId('profile-load-error')).toBeNull();
  });

  it('surfaces a missing propagated session as a load error, never a 404 or generic failure', async () => {
    state.user = { id: OWNER_ID };
    state.token = null;

    renderRoutes(['/profile']);

    await expectLoadError('Your session could not be verified.');
    expect(profileApi.getProfileById).not.toHaveBeenCalled();
  });

  it('surfaces an ambiguous project route as a load error, never a 404', async () => {
    state.user = { id: OWNER_ID };
    state.token = 'central-session-token';
    profileApi.getProfileById.mockResolvedValueOnce({
      data: null,
      error: { configCode: 'AMBIGUOUS_ROUTE', message: 'Multiple active projects' },
    });

    renderRoutes(['/profile']);

    await expectLoadError('The profile service is not configured correctly.');
    expect(console.warn).toHaveBeenCalledWith(
      '[profile] load failed: kind=routing-config code=AMBIGUOUS_ROUTE'
    );
  });
});

describe('the /profile/:id route', () => {
  it('loads another user by normalized id instead of querying username', async () => {
    state.user = { id: OWNER_ID };
    state.token = 'central-session-token';
    profileApi.getProfileById.mockResolvedValueOnce({ data: other, error: null });

    renderRoutes([`/profile/${OTHER_ID.toUpperCase()}`]);

    const header = await screen.findByTestId('profile-header');
    expect(header.textContent).toContain('@Grace');
    expect(header.getAttribute('data-own')).toBe('false');
    expect(header.getAttribute('data-profile-id')).toBe(OTHER_ID);
    expect(profileApi.getProfileById).toHaveBeenCalledWith(OTHER_ID);
    expect(profileApi.getProfileByUsername).not.toHaveBeenCalled();
    expect(screen.queryByTestId('notfound')).toBeNull();
    expect(screen.queryByTestId('profile-load-error')).toBeNull();
  });

  it('loads a public id profile for a guest', async () => {
    profileApi.getProfileById.mockResolvedValueOnce({ data: other, error: null });

    renderRoutes([`/profile/${OTHER_ID}`]);

    expect((await screen.findByTestId('profile-header')).textContent).toContain('@Grace');
    expect(screen.queryByTestId('notfound')).toBeNull();
  });

  it('surfaces an auth/query failure as a load error, never a fake 404', async () => {
    state.user = { id: OWNER_ID };
    state.token = null;
    profileApi.getProfileById.mockResolvedValueOnce({
      data: null,
      error: { message: 'Central Auth client not initialized' },
    });

    renderRoutes([`/profile/${OTHER_ID}`]);

    await expectLoadError('Your session could not be verified.');
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('central-session-token');
  });

  it('shows the 404 page only for a readable missing id', async () => {
    profileApi.getProfileById.mockResolvedValueOnce({ data: null, error: null });

    renderRoutes([`/profile/${OTHER_ID}`]);

    expect(await screen.findByTestId('notfound')).toBeTruthy();
    expect(screen.queryByTestId('profile-load-error')).toBeNull();
    expect(screen.queryByTestId('profile-header')).toBeNull();
  });
});
