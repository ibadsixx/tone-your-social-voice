import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

// do.md: Mentions must NOT be accessible to unauthenticated guests. A guest
// who lands on /profile/:username/mentions (or sees a Mentions link anywhere)
// gets redirected to the Posts feed — no mentions content, no prefetch, no
// hidden mentions elements. Authenticated users keep the existing behavior
// (covered by profileTabSectionsUrl.test.tsx, which runs with a mocked user).
vi.mock('@/hooks/useAuth', () => {
  const authValue = { user: null, loading: false };
  return { useAuth: () => authValue };
});

vi.mock('@/components/ProfileHeader', () => ({
  default: () => <div data-testid="profile-header" />,
}));

vi.mock('@/components/Post', () => ({
  default: () => <div data-testid="post-card" />,
}));

vi.mock('@/components/AboutSection', () => ({ default: () => <div /> }));
vi.mock('@/components/ScheduledPostsTab', () => ({
  default: () => <div data-testid="scheduled-section" />,
}));
vi.mock('@/components/FriendsTab', () => ({
  default: () => <div data-testid="friends-section" />,
}));
vi.mock('@/pages/Mentions', () => ({
  default: () => <div data-testid="mentions-section" />,
}));

const getProfileByUsername = vi.fn();
vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>();
  return {
    ...actual,
    profilesApi: {
      ...actual.profilesApi,
      getProfileByUsername: (...args: unknown[]) => getProfileByUsername(...args),
    },
  };
});

vi.mock('@/hooks/usePosts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/usePosts')>();
  return {
    ...actual,
    useUserPosts: () => ({ posts: [], loading: false }),
  };
});

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import ProfilePage from '@/pages/ProfilePage';

const profile = {
  id: 'p1',
  username: 'test',
  display_name: 'Test User',
  profile_pic: null,
  cover_pic: null,
  bio: null,
  location: null,
  website: null,
  manual_status: null,
  status_visibility: null,
  notification_sounds: false,
  do_not_disturb_until: null,
  dark_mode: false,
  show_read_indicator: false,
  check_keys_in_conversations: false,
  remember_browser: false,
  disable_auto_uploads: false,
  preview_mode: false,
  vault_pin: null,
  vault_recovery_code: null,
  security_warnings: false,
  font_scale: null,
  reduce_motion: false,
  reduce_transparency: false,
  high_contrast: false,
  created_at: '2026-01-01T00:00:00.000Z',
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="path">{location.pathname}</div>;
}

function renderProfile(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LocationProbe />
      <Routes>
        <Route path="/profile/:username" element={<ProfilePage />} />
        <Route path="/profile/:username/:section" element={<ProfilePage />} />
        <Route path="/profile/:username/about" element={<ProfilePage />} />
        <Route path="/profile/:username/about/:aboutSection" element={<ProfilePage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Guest Mentions restriction (do.md)', () => {
  beforeEach(() => {
    getProfileByUsername.mockReset();
    getProfileByUsername.mockResolvedValue({ data: profile, error: null });
  });

  it('redirects a guest away from /mentions to the Posts feed without rendering mentions', async () => {
    renderProfile('/profile/test/mentions');

    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/profile/test'));
    expect(screen.queryByTestId('mentions-section')).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Mentions' })).toBeNull();
    expect(screen.getByTestId('profile-header')).toBeTruthy();
    expect(getProfileByUsername).toHaveBeenCalledTimes(1);
  });

  it('never shows a Mentions tab to a guest on the profile shell', async () => {
    renderProfile('/profile/test');

    await screen.findByTestId('profile-header');
    expect(screen.queryByRole('tab', { name: 'Mentions' })).toBeNull();
    expect(screen.queryByTestId('mentions-section')).toBeNull();
    expect(getProfileByUsername).toHaveBeenCalledTimes(1);
  });
});