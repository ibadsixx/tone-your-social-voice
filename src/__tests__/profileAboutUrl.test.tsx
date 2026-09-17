import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';

// The About section composes many gateway-backed editors. These tests only care
// that the subsection navigation is URL-driven, so the data layer and the heavy
// section bodies are stubbed.
vi.mock('@/lib/gateway', () => {
  const makeBuilder = () => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      delete: () => builder,
      update: () => builder,
      insert: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: null, error: { code: 'PGRST116' } }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return builder;
  };
  return { gateway: { from: () => makeBuilder() } };
});

vi.mock('@/hooks/useProfile', () => {
  const profile = { id: 'p1', username: 'test', display_name: 'Test User' };
  const refetch = vi.fn();
  return { useProfile: () => ({ profile, loading: false, refetch }) };
});

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

vi.mock('@/components/ScheduledPostsTab', () => ({ default: () => <div /> }));
vi.mock('@/components/FriendsTab', () => ({ default: () => <div /> }));
vi.mock('@/pages/Mentions', () => ({ default: () => <div /> }));

vi.mock('@/components/OverviewSection', () => ({
  default: () => <div data-testid="about-overview" />,
}));
vi.mock('@/components/ContactBasicInfoForm', () => ({
  ContactBasicInfoForm: () => <div data-testid="about-contact" />,
}));
vi.mock('@/components/FamilyAndRelationships', () => ({
  FamilyAndRelationships: () => <div data-testid="about-family" />,
}));
vi.mock('@/components/LifeEventsSection', () => ({
  LifeEventsSection: () => <div data-testid="about-events" />,
}));
vi.mock('@/components/DetailsAboutYouSection', () => ({
  DetailsAboutYouSection: () => <div data-testid="about-details" />,
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
  return { ...actual, useUserPosts: () => ({ posts: [], loading: false }) };
});

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import ProfilePage from '@/pages/ProfilePage';
import { ABOUT_SECTIONS } from '@/lib/profileAbout';

const profile = {
  id: 'p1',
  username: 'test',
  display_name: 'Test User',
  profile_pic: null,
  cover_pic: null,
  bio: null,
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
        <Route path="/profile/:username/about" element={<ProfilePage />} />
        <Route path="/profile/:username/about/:aboutSection" element={<ProfilePage />} />
      </Routes>
    </MemoryRouter>
  );
}

async function waitForPath(path: string) {
  await waitFor(() => expect(screen.getByTestId('path').textContent).toBe(path));
}

describe('About subsection URL navigation', () => {
  beforeEach(() => {
    getProfileByUsername.mockReset();
    getProfileByUsername.mockResolvedValue({ data: profile, error: null });
  });

  it('renders every required label at the /about URL', async () => {
    renderProfile('/profile/test/about');

    await screen.findByTestId('about-overview');
    expect(screen.getByTestId('path').textContent).toBe('/profile/test/about');
    for (const { label } of ABOUT_SECTIONS) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(getProfileByUsername).toHaveBeenCalledTimes(1);
  });

  it('changes the URL and only the About content, without refetching', async () => {
    renderProfile('/profile/test/about');
    await screen.findByTestId('about-overview');

    fireEvent.click(screen.getByRole('button', { name: 'Contact Information' }));
    await waitForPath('/profile/test/about/contactInformation');
    expect(screen.getByTestId('about-contact')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Details About You' }));
    await waitForPath('/profile/test/about/details');
    expect(screen.getByTestId('about-details')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Overview' }));
    await waitForPath('/profile/test/about');
    expect(screen.getByTestId('about-overview')).toBeTruthy();

    expect(screen.getByTestId('profile-header')).toBeTruthy();
    expect(getProfileByUsername).toHaveBeenCalledTimes(1);
  });

  it('deep-links straight into a subsection', async () => {
    renderProfile('/profile/test/about/relationships');

    await screen.findByTestId('about-family');
    expect(screen.getByTestId('path').textContent).toBe('/profile/test/about/relationships');
    expect(getProfileByUsername).toHaveBeenCalledTimes(1);
  });

  it('keeps URL and content in sync on browser back', async () => {
    renderProfile('/profile/test/about');
    await screen.findByTestId('about-overview');

    fireEvent.click(screen.getByRole('button', { name: 'Contact Information' }));
    await waitForPath('/profile/test/about/contactInformation');

    fireEvent.click(screen.getByRole('button', { name: 'Details About You' }));
    await waitForPath('/profile/test/about/details');

    fireEvent.click(screen.getByText('go-back'));
    await waitForPath('/profile/test/about/contactInformation');
    expect(screen.getByTestId('about-contact')).toBeTruthy();

    fireEvent.click(screen.getByText('go-back'));
    await waitForPath('/profile/test/about');
    expect(screen.getByTestId('about-overview')).toBeTruthy();

    expect(getProfileByUsername).toHaveBeenCalledTimes(1);
  });

  it('redirects an unknown subsection back to Overview', async () => {
    renderProfile('/profile/test/about/bogus');

    await screen.findByTestId('about-overview');
    await waitForPath('/profile/test/about');
  });

  it('opens About (Overview) when the main About tab is clicked', async () => {
    renderProfile('/profile/test');
    await screen.findByTestId('profile-header');

    // Radix tabs activate on mousedown, not click.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'About' }));

    await waitForPath('/profile/test/about');
    expect(screen.getByTestId('about-overview')).toBeTruthy();
    expect(getProfileByUsername).toHaveBeenCalledTimes(1);
  });
});
