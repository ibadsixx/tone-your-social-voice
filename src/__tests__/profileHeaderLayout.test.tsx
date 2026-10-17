// Regression guard for the profile-header layout (do.md: "Fix Profile Identity
// Alignment, Name Colors, and Bio Edit Button").
//
// The bug: the identity block (name / nickname / @username / joined) sat *on top
// of the cover* because it was aligned to the top of the avatar, whose top edge
// is pulled up into the cover. The requirements under test here are structural,
// so they are asserted on the real rendered DOM (jsdom, no pixels needed):
//
//   1. the name block is a SIBLING of the avatar inside one horizontal row
//      (name beside the avatar — never beneath it);
//   2. only the AVATAR carries the negative top margin, so the name block starts
//      under the cover's bottom edge;
//   3. the primary name uses a high-contrast foreground colour and the nickname
//      a readable, distinct secondary colour;
//   4. the Bio edit pencil is NOT beside the name; it lives in the Bio section
//      below the avatar, is owner-only, and pages never get it.
//
// Every network-touching child of ProfileHeader is mocked; only ProfileHeader's
// own markup is exercised.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { ComponentProps } from 'react';

vi.mock('@/lib/gateway', () => ({
  gateway: { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }), removeChannel: () => undefined },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

let authUser: { id: string } | null = { id: 'viewer-1' };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: authUser }) }));

vi.mock('@/hooks/usePhotoUpload', () => ({ usePhotoUpload: () => ({ uploadPhoto: vi.fn(), uploading: false }) }));

type OtherNameRow = { id: string; user_id: string; type: string; name: string; show_at_top: boolean; visibility: string; created_at: string; updated_at: string };
const DOWMASTER: OtherNameRow = { id: 'n1', user_id: 'u1', type: 'nickname', name: 'Dowmaster', show_at_top: true, visibility: 'public', created_at: '', updated_at: '' };
// Swappable so the suite can cover both "profile WITH an Other Name" and
// "profile WITHOUT one" (do.md: no separators or blank space when empty).
let otherNamesRows: OtherNameRow[] = [DOWMASTER];
vi.mock('@/hooks/useOtherNames', () => ({ useOtherNames: () => ({ otherNames: otherNamesRows }) }));

vi.mock('@/hooks/useFriendship', () => ({
  useFriendship: () => ({ friendship: { status: null, loading: false, isSender: false }, sendRequest: vi.fn(), cancelRequest: vi.fn(), acceptRequest: vi.fn(), rejectRequest: vi.fn(), unfriend: vi.fn() }),
}));
vi.mock('@/hooks/useFollow', () => ({
  useFollow: () => ({ followStatus: { isFollowing: false, refetch: vi.fn() }, follow: vi.fn(), unfollow: vi.fn() }),
}));
vi.mock('@/hooks/useBlocks', () => ({
  useBlocks: () => ({ blockStatus: { isBlocked: false, isBlockedBy: false }, blockUser: vi.fn(), unblockUser: vi.fn() }),
}));
vi.mock('@/hooks/useProfileReports', () => ({ useProfileReports: () => ({ hasReported: false, refreshReportStatus: vi.fn() }) }));
vi.mock('@/hooks/useHasActiveStories', () => ({ useHasActiveStories: () => false }));

vi.mock('@/components/cover/CoverPhotoEditor', () => ({ default: () => <div data-testid="cover" /> }));
vi.mock('@/components/PhotoUploadDialog', () => ({ default: ({ children }: any) => <>{children}</> }));
vi.mock('@/components/MessageButton', () => ({ MessageButton: () => <button type="button">Message</button> }));
vi.mock('@/components/ReportProfileDialog', () => ({ ReportProfileDialog: () => null }));
vi.mock('@/components/BlockButton', () => ({ default: () => null }));
// The pencil is what must move; mock it so its placement is easy to locate.
vi.mock('@/components/EditBioDialog', () => ({
  default: (props: any) => <button type="button" data-testid="bio-pencil" data-expects={props.userId}>edit bio</button>,
}));

import ProfileHeader from '@/components/ProfileHeader';

const PROFILE = {
  id: 'u1',
  username: 'badsi',
  display_name: 'Badsi Islam',
  bio: null as string | null,
  profile_pic: null,
  cover_pic: 'https://cdn/cover.jpg',
  created_at: '2026-09-13T11:35:18.628Z',
};

const renderHeader = (over: Partial<ComponentProps<typeof ProfileHeader>> = {}) =>
  render(<ProfileHeader profile={PROFILE} isOwnProfile={false} {...over} />);

const findAvatarWrap = (): HTMLElement | null =>
  (Array.from(document.querySelectorAll('div')) as HTMLElement[]).find((d) => typeof d.className === 'string' && d.className.includes('flex-shrink-0')) ?? null;

describe('ProfileHeader identity layout (name beside avatar, under the cover)', () => {
  beforeEach(() => {
    cleanup();
    authUser = { id: 'viewer-1' };
    otherNamesRows = [DOWMASTER];
  });

  it('renders the name block as a sibling of the avatar in one horizontal row', () => {
    renderHeader();
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toBe('Badsi Islam');

    const identity = h1.closest('div.space-y-2') as HTMLElement;
    const avatarWrap = findAvatarWrap();
    expect(identity).toBeTruthy();
    expect(avatarWrap).toBeTruthy();

    // Same parent => one row (the old bug put the identity block in a *different*
    // block beneath the avatar row).
    expect(identity.parentElement).toBe(avatarWrap!.parentElement);
    expect((identity.parentElement as HTMLElement).className).toContain('flex-row');
    // The name must come after the avatar (to its right, not above/below).
    expect(avatarWrap!.compareDocumentPosition(identity) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('pulls ONLY the avatar up into the cover (so the name starts under the cover edge)', () => {
    renderHeader();
    const avatarWrap = findAvatarWrap();
    expect(avatarWrap!.className).toContain('-mt-16');
    expect(avatarWrap!.className).toContain('md:-mt-20');
    // The row itself must not be shifted up, and the identity block must not be
    // top-aligned into the cover.
    const row = avatarWrap!.parentElement as HTMLElement;
    expect(row.className).not.toMatch(/-mt-/);
  });

  it('gives the primary name a foreground colour and the Other Names value a subtle muted one', () => {
    renderHeader();
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.className).toContain('text-foreground');

    // The muted colour now lives on the inline group holding the value.
    const otherName = screen.getByText('Dowmaster');
    expect(otherName.closest('.text-muted-foreground')).toBeTruthy();
  });

  // do.md: "Display the primary profile name and the value of Other Names on the
  // same horizontal line … Do not display labels such as Nickname … Do not place
  // Other Names on a separate line below the primary name."
  it('shows Other Names inline beside the primary name with no type label', () => {
    renderHeader();
    const h1 = screen.getByRole('heading', { level: 1 });
    const nameRow = h1.parentElement as HTMLElement;
    const otherName = screen.getByText('Dowmaster');

    // Beside, not beneath: the value sits inside the very same flex row as the h1.
    expect(nameRow.contains(otherName)).toBe(true);

    // The real `other_names` value with the separator flush against it (do.md's
    // `Badsi Islam •Badsi`), no "Nickname"/type label, exactly one separator.
    expect(otherName.textContent).toBe('•Dowmaster');
    expect(screen.queryByText(/Nickname/)).toBeNull();
    expect(screen.queryByText(/Other Name/)).toBeNull();
    expect(nameRow.textContent.replace(/\s+/g, '')).toBe('BadsiIslam•Dowmaster');
  });

  // do.md: "If Other Names is empty or unavailable, display only the primary name
  // without empty parentheses, extra separators, or blank space."
  it('shows only the primary name when the profile has no Other Names', () => {
    otherNamesRows = [];
    renderHeader();
    const h1 = screen.getByRole('heading', { level: 1 });
    const nameRow = h1.parentElement as HTMLElement;

    expect(screen.queryByText('Dowmaster')).toBeNull();
    expect(nameRow.textContent.replace(/\s+/g, '')).toBe('BadsiIslam');
  });

  it('separates several Other Names with bullets, still inline and unlabeled', () => {
    otherNamesRows = [DOWMASTER, { ...DOWMASTER, id: 'n2', name: 'Dow Islam', type: 'birth_name' }];
    renderHeader();
    const h1 = screen.getByRole('heading', { level: 1 });
    const nameRow = h1.parentElement as HTMLElement;

    expect(screen.queryByText(/Birth name/)).toBeNull();
    expect(nameRow.textContent.replace(/\s+/g, '')).toBe('BadsiIslam•Dowmaster•DowIslam');
  });

  it('keeps the bio edit pencil OUT of the name row and INSIDE the Bio section below the avatar', () => {
    renderHeader({ isOwnProfile: true });
    const h1 = screen.getByRole('heading', { level: 1 });
    const identity = h1.closest('div.space-y-2') as HTMLElement;

    // Not beside the name…
    expect(identity.querySelector('[data-testid="bio-pencil"]')).toBeNull();
    // …but present, beside the bio, in a section outside the identity block.
    const pencil = screen.getByTestId('bio-pencil');
    expect(pencil).toBeTruthy();
    expect(identity.contains(pencil)).toBe(false);
    expect(screen.getByText(/No bio yet\./)).toBeTruthy();
    // The bio section sits after the identity row.
    expect(identity.compareDocumentPosition(pencil) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders the existing bio text below the avatar with the pencil beside it (owner)', () => {
    renderHeader({ isOwnProfile: true, profile: { ...PROFILE, bio: 'Daily oil, delivered.' } });
    const bio = screen.getByText('Daily oil, delivered.');
    const pencil = screen.getByTestId('bio-pencil');
    expect(bio.parentElement).toBe(pencil.parentElement);
  });

  it('shows the bio pencil only to the owner (guests never see it)', () => {
    authUser = { id: 'viewer-2' };
    renderHeader({ isOwnProfile: false, profile: { ...PROFILE, bio: 'Daily oil, delivered.' } });
    expect(screen.queryByTestId('bio-pencil')).toBeNull();
    // …but the bio itself is public.
    expect(screen.getByText('Daily oil, delivered.')).toBeTruthy();
  });

  it('never shows the bio section or pencil on a Page (hideBio)', () => {
    renderHeader({ isOwnProfile: true, profileKind: 'page', hideBio: true, hideJoined: true, profile: { ...PROFILE, bio: 'page desc' } });
    expect(screen.queryByTestId('bio-pencil')).toBeNull();
    expect(screen.queryByText('page desc')).toBeNull();
  });
});
