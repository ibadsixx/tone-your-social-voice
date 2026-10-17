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

const OTHER_NAMES = [{ id: 'n1', user_id: 'u1', type: 'nickname', name: 'Dowmaster', show_at_top: true, visibility: 'public', created_at: '', updated_at: '' }];
vi.mock('@/hooks/useOtherNames', () => ({ useOtherNames: () => ({ otherNames: OTHER_NAMES }) }));

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

  it('gives the primary name a foreground colour and the nickname a distinct muted colour', () => {
    renderHeader();
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.className).toContain('text-foreground');

    const nickname = screen.getByText(/Dowmaster/);
    expect(nickname.className).toContain('text-muted-foreground');
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
