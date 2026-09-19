import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';

// ProfilePage pulls in the profile shell and the gateway-backed API. These
// tests only care that the Friends/Mentions/Scheduled sections are URL-driven,
// so the heavy/network-dependent pieces are stubbed out per-section testids.
vi.mock('@/hooks/useAuth', () => {
  const authValue = { user: { id: 'viewer' }, loading: false };
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

// Same profile but owned by the viewer, used to exercise the owner-only
// Scheduled section.
const ownProfile = { ...profile, id: 'viewer' };

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <div data-testid="path">{location.pathname}</div>
      <button onClick={() => navigate(-1)}>go-back</button>
    </>
  );
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

function clickTab(name: string) {
  // Radix tabs activate on mousedown, not click.
  fireEvent.mouseDown(screen.getByRole('tab', { name }));
}

async function waitForPath(path: string) {
  await waitFor(() => expect(screen.getByTestId('path').textContent).toBe(path));
}

describe('Profile tab-section URL navigation', () => {
  beforeEach(() => {
    getProfileByUsername.mockReset();
    getProfileByUsername.mockResolvedValue({ data: profile, error: null });
  });

  it('deep-links straight into Friends', async () => {
    renderProfile('/profile/test/friends');

    await screen.findByTestId('friends-section');
    expect(screen.getByTestId('path').textContent).toBe('/profile/test/friends');
    expect(screen.getByTestId('profile-header')).toBeTruthy();
    expect(getProfileByUsername).toHaveBeenCalledTimes(1);
  });

  it('deep-links straight into Mentions for the viewed user', async () => {
    renderProfile('/profile/test/mentions');

    await screen.findByTestId('mentions-section');
    expect(screen.getByTestId('path').textContent).toBe('/profile/test/mentions');
    expect(screen.getByTestId('profile-header')).toBeTruthy();
    expect(getProfileByUsername).toHaveBeenCalledTimes(1);
  });

  it('navigates between Friends/Mentions via the URL without refetching or remounting the shell', async () => {
    renderProfile('/profile/test');
    await screen.findByTestId('profile-header');

    clickTab('Friends');
    await waitForPath('/profile/test/friends');
    expect(screen.getByTestId('friends-section')).toBeTruthy();

    clickTab('Mentions');
    await waitForPath('/profile/test/mentions');
    expect(screen.getByTestId('mentions-section')).toBeTruthy();

    clickTab('Posts');
    await waitForPath('/profile/test');
    expect(screen.getByTestId('profile-header')).toBeTruthy();

    expect(getProfileByUsername).toHaveBeenCalledTimes(1);
  });

  it('supports browser back from a section without remounting the profile', async () => {
    renderProfile('/profile/test');
    await screen.findByTestId('profile-header');

    clickTab('Friends');
    await waitForPath('/profile/test/friends');

    fireEvent.click(screen.getByText('go-back'));
    await waitForPath('/profile/test');
    expect(screen.queryByTestId('friends-section')).toBeNull();
    expect(screen.getByTestId('profile-header')).toBeTruthy();
    expect(getProfileByUsername).toHaveBeenCalledTimes(1);
  });

  it('redirects a non-owner away from /scheduled to their Posts feed', async () => {
    renderProfile('/profile/test/scheduled');

    await waitForPath('/profile/test');
    expect(screen.queryByTestId('scheduled-section')).toBeNull();
    expect(getProfileByUsername).toHaveBeenCalledTimes(1);
  });

  it('keeps the Scheduled section for the profile owner', async () => {
    getProfileByUsername.mockResolvedValue({ data: ownProfile, error: null });
    renderProfile('/profile/test/scheduled');

    await screen.findByTestId('scheduled-section');
    expect(screen.getByTestId('path').textContent).toBe('/profile/test/scheduled');
    expect(getProfileByUsername).toHaveBeenCalledTimes(1);
  });
});