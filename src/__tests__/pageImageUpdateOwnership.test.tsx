// do.md "Page Profile/Cover Photo Updates Must Never Post to the Owner's
// Personal Profile".
//
// THE ROOT CAUSE this guards. A Page is rendered through the shared
// `ProfileHeader` with `isOwnProfile` true for its admin, but the page only
// hands the header an avatar editor while the admin is in "acting as page"
// mode. In every other state the slot was `undefined`, so the header fell back
// to the PERSONAL editor — which uploads to the admin's own `profiles.profile_pic`
// and creates a `profile_picture_update` post authored by that user. A Page
// avatar change therefore published to (and overwrote) the owner's personal
// profile.
//
// The rule enforced here: the personal editors belong to a PERSON. For a PAGE,
// an absent slot renders nothing instead of the personal control.
//
// Every network-touching child of ProfileHeader is mocked; the personal
// controls are mocked to render identifiable markers so their presence (or
// absence) is unambiguous.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { ComponentProps } from 'react';

vi.mock('@/lib/gateway', () => ({
  gateway: {
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
    removeChannel: () => undefined,
  },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'admin-1' } }) }));
vi.mock('@/hooks/usePhotoUpload', () => ({ usePhotoUpload: () => ({ uploadPhoto: vi.fn(), uploading: false }) }));
vi.mock('@/hooks/useOtherNames', () => ({ useOtherNames: () => ({ otherNames: [] }) }));
vi.mock('@/hooks/useFriendship', () => ({
  useFriendship: () => ({
    friendship: { status: null, loading: false, isSender: false },
    sendRequest: vi.fn(),
    cancelRequest: vi.fn(),
    acceptRequest: vi.fn(),
    rejectRequest: vi.fn(),
    unfriend: vi.fn(),
  }),
}));
vi.mock('@/hooks/useFollow', () => ({
  useFollow: () => ({ followStatus: { isFollowing: false, refetch: vi.fn() }, follow: vi.fn(), unfollow: vi.fn() }),
}));
vi.mock('@/hooks/useBlocks', () => ({
  useBlocks: () => ({ blockStatus: { isBlocked: false, isBlockedBy: false }, blockUser: vi.fn(), unblockUser: vi.fn() }),
}));
vi.mock('@/hooks/useProfileReports', () => ({
  useProfileReports: () => ({ hasReported: false, refreshReportStatus: vi.fn() }),
}));
vi.mock('@/hooks/useHasActiveStories', () => ({ useHasActiveStories: () => false }));

// The personal controls — the ones a Page must never fall back to.
vi.mock('@/components/PhotoUploadDialog', () => ({
  default: ({ children }: any) => <div data-testid="personal-avatar-editor">{children}</div>,
}));
vi.mock('@/components/cover/CoverPhotoEditor', () => ({
  default: () => <div data-testid="personal-cover-editor" />,
}));

vi.mock('@/components/EditBioDialog', () => ({ default: () => null }));
vi.mock('@/components/MessageButton', () => ({ MessageButton: () => null }));
vi.mock('@/components/ReportProfileDialog', () => ({ ReportProfileDialog: () => null }));
vi.mock('@/components/BlockButton', () => ({ default: () => null }));

import ProfileHeader from '@/components/ProfileHeader';

const PROFILE = {
  id: 'page-1',
  username: 'goldoil',
  display_name: 'Gold Oil Daily',
  bio: null as string | null,
  profile_pic: null,
  cover_pic: null,
  created_at: '2026-01-01T00:00:00.000Z',
};

const renderHeader = (over: Partial<ComponentProps<typeof ProfileHeader>> = {}) =>
  render(<ProfileHeader profile={PROFILE} isOwnProfile {...over} />);

describe('a Page image update never falls back to the personal editors', () => {
  beforeEach(() => cleanup());

  it('renders NO personal editors on a Page when the slots are absent', () => {
    // This is the exact state a page owner is in when they have not switched to
    // "acting as page": `isOwnProfile` is true but the page passes no editor.
    renderHeader({ profileKind: 'page' });
    expect(screen.queryByTestId('personal-avatar-editor')).toBeNull();
    expect(screen.queryByTestId('personal-cover-editor')).toBeNull();
  });

  it('renders the page editors it is handed through the slots', () => {
    renderHeader({
      profileKind: 'page',
      cover: <div data-testid="page-cover-editor" />,
      avatarEditor: <div data-testid="page-avatar-editor" />,
    });
    expect(screen.getByTestId('page-cover-editor')).toBeTruthy();
    expect(screen.getByTestId('page-avatar-editor')).toBeTruthy();
    // …and still never the personal ones.
    expect(screen.queryByTestId('personal-avatar-editor')).toBeNull();
    expect(screen.queryByTestId('personal-cover-editor')).toBeNull();
  });

  it('still renders the personal editors for a personal profile (behavior preserved)', () => {
    renderHeader({ profileKind: 'person' });
    expect(screen.getByTestId('personal-avatar-editor')).toBeTruthy();
    expect(screen.getByTestId('personal-cover-editor')).toBeTruthy();
  });
});
