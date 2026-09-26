import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';

// ProfilePage pulls in the profile shell (header, tabs, sections) and the
// gateway-backed API. These tests only care about URL <-> section behavior, so
// the heavy/network-dependent pieces are stubbed out.
vi.mock('@/hooks/useAuth', () => {
  // Keep the auth value referentially stable; ProfilePage's fetch effect
  // depends on `user`, so a new object each render would loop the fetch.
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
vi.mock('@/components/ScheduledPostsTab', () => ({ default: () => <div /> }));
vi.mock('@/components/FriendsTab', () => ({ default: () => <div /> }));
vi.mock('@/pages/Mentions', () => ({ default: () => <div /> }));

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

// Each content section reads one page at a time from the profile content
// endpoint. An empty page with no cursor is what a profile with no content in
// that section looks like, and it keeps the deep-link assertions off the wire.
const getProfileContentPage = vi.fn();
vi.mock('@/api/profileContent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/profileContent')>();
  return { ...actual, getProfileContentPage: (...args: unknown[]) => getProfileContentPage(...args) };
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
      </Routes>
    </MemoryRouter>
  );
}

function clickSection(id: string) {
  fireEvent.click(screen.getAllByTestId(`profile-section-${id}`)[0]);
}

async function waitForPath(path: string) {
  await waitFor(() => expect(screen.getByTestId('path').textContent).toBe(path));
}

describe('Profile section URL navigation', () => {
  beforeEach(() => {
    getProfileByUsername.mockReset();
    getProfileByUsername.mockResolvedValue({ data: profile, error: null });
    getProfileContentPage.mockReset();
    getProfileContentPage.mockResolvedValue({
      data: { items: [], has_more: false, next_cursor: null, degraded: false },
      error: null,
    });
  });

  it('defaults the bare profile URL to Posts and loads the profile once', async () => {
    renderProfile('/profile/test');

    await screen.findByTestId('profile-header');
    expect(screen.getByTestId('path').textContent).toBe('/profile/test');
    expect(getProfileByUsername).toHaveBeenCalledTimes(1);
  });

  it('navigates to Photos/Reels/Shared/Posts via the URL without refetching or remounting the shell', async () => {
    renderProfile('/profile/test');
    await screen.findByTestId('profile-header');

    clickSection('photos');
    await waitForPath('/profile/test/photos');
    expect(screen.getByTestId('profile-header')).toBeTruthy();

    clickSection('reels');
    await waitForPath('/profile/test/reels');

    clickSection('shared');
    await waitForPath('/profile/test/shared');

    clickSection('all');
    await waitForPath('/profile/test');

    // One fetch on mount; section changes must not trigger the header refetch.
    expect(getProfileByUsername).toHaveBeenCalledTimes(1);
  });

  it('deep-links straight into a section', async () => {
    renderProfile('/profile/test/reels');

    await screen.findByTestId('profile-header');
    expect(screen.getByTestId('path').textContent).toBe('/profile/test/reels');
    // The deep-linked section reads its own first page, rather than the profile
    // shell waiting on a fetch of every section's content.
    expect(getProfileContentPage).toHaveBeenCalledWith(
      'p1',
      'reels',
      expect.objectContaining({ cursor: null, limit: 1 })
    );
    expect(await screen.findByTestId('profile-reels-empty')).toBeTruthy();
    expect(getProfileByUsername).toHaveBeenCalledTimes(1);
  });

  it('supports browser back without remounting the profile', async () => {
    renderProfile('/profile/test');
    await screen.findByTestId('profile-header');

    clickSection('photos');
    await waitForPath('/profile/test/photos');

    fireEvent.click(screen.getByText('go-back'));
    await waitForPath('/profile/test');

    expect(getProfileByUsername).toHaveBeenCalledTimes(1);
  });

  it('redirects the removed Videos section to Reels', async () => {
    renderProfile('/profile/test/videos');

    await screen.findByTestId('profile-header');
    await waitForPath('/profile/test/reels');
    expect(getProfileByUsername).toHaveBeenCalledTimes(1);
  });
});
