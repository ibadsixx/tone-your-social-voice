// Friends-only search + invitations in the "Invite friends to this group"
// dialog (message.md).
//
// The dialog must search ONLY the viewer's accepted friends (reusing the
// existing Friends API / Gateway), exclude people already in the group, and
// never fall back to a global user search, a follower list, or a pending
// request. Frontend filtering is a convenience; the Gateway re-verifies the
// friendship server-side (see gateway groupMembersTest.ts TEST 8c-8e).
//
// Run: npx vitest run src/__tests__/inviteToGroupFriendsOnly.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';

// jsdom has no ResizeObserver; Radix ScrollArea measures with one.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

const toastSpy = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({ user: { id: 'viewer-1' } as { id: string } | null }));

const api = vi.hoisted(() => ({
  getFriendsByUser: vi.fn(),
  getProfileById: vi.fn(),
  addGroupMembersSecure: vi.fn(),
  // Kept so the tests can prove the dialog never reaches for a global user
  // search or a follower list.
  searchUsers: vi.fn(),
  getFollowersByUser: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastSpy }) }));
vi.mock('@/api', () => ({
  usersApi: {
    getFriendsByUser: (...a: unknown[]) => api.getFriendsByUser(...a),
    searchUsers: (...a: unknown[]) => api.searchUsers(...a),
    getFollowersByUser: (...a: unknown[]) => api.getFollowersByUser(...a),
  },
  profilesApi: {
    getProfileById: (...a: unknown[]) => api.getProfileById(...a),
  },
  groupsApi: {
    addGroupMembersSecure: (...a: unknown[]) => api.addGroupMembersSecure(...a),
  },
}));

import InviteToGroupDialog from '@/components/groups/InviteToGroupDialog';

const VIEWER = 'viewer-1';
const EXISTING = 'member-exist';

// Rows shaped like the `friends` table. `getFriendsByUser` is documented to
// return accepted friendships only; a pending row is included so the dialog is
// proven to filter it out defensively rather than trusting the source blindly.
const FRIEND_ROWS = [
  { id: 'fr-1', requester_id: VIEWER, receiver_id: 'friend-ada', status: 'accepted' },
  { id: 'fr-2', requester_id: 'friend-grace', receiver_id: VIEWER, status: 'accepted' },
  { id: 'fr-3', requester_id: VIEWER, receiver_id: EXISTING, status: 'accepted' },
  { id: 'fr-4', requester_id: 'pending-pat', receiver_id: VIEWER, status: 'pending' },
];

const PROFILES: Record<string, { id: string; username: string; display_name: string; profile_pic: string | null }> = {
  'friend-ada': { id: 'friend-ada', username: 'ada', display_name: 'Ada Lovelace', profile_pic: null },
  'friend-grace': { id: 'friend-grace', username: 'grace', display_name: 'Grace Hopper', profile_pic: null },
  [EXISTING]: { id: EXISTING, username: 'existing', display_name: 'Existing Member', profile_pic: null },
  'pending-pat': { id: 'pending-pat', username: 'pat', display_name: 'Pat Pending', profile_pic: null },
  'follower-lin': { id: 'follower-lin', username: 'lin', display_name: 'Lin Follower', profile_pic: null },
};

const renderDialog = (existingMemberIds: string[] = [EXISTING]) =>
  render(
    <InviteToGroupDialog
      open
      onOpenChange={() => {}}
      groupId="group-1"
      existingMemberIds={existingMemberIds}
      onInvitesSent={() => {}}
    />
  );

const searchBox = () => screen.getByPlaceholderText('Choose friends');

beforeEach(() => {
  toastSpy.mockReset();
  api.getFriendsByUser.mockReset().mockResolvedValue({ data: FRIEND_ROWS, error: null });
  api.getProfileById
    .mockReset()
    .mockImplementation((id: string) => Promise.resolve({ data: PROFILES[id] ?? null, error: null }));
  api.addGroupMembersSecure
    .mockReset()
    .mockResolvedValue({ data: { status: 'ok', added: 1 }, error: null });
  api.searchUsers.mockReset();
  api.getFollowersByUser
    .mockReset()
    .mockResolvedValue({ data: [{ id: 'fol', follower_id: VIEWER, following_id: 'follower-lin' }], error: null });
});

afterEach(() => {
  cleanup();
});

describe('InviteToGroupDialog friends-only list', () => {
  it('lists confirmed friends who are not already group members', async () => {
    renderDialog();

    await screen.findByText('Ada Lovelace');
    expect(screen.getByText('Grace Hopper')).toBeTruthy();
    // An accepted friend who is already in the group is excluded.
    expect(screen.queryByText('Existing Member')).toBeNull();
    // A pending request never qualifies.
    expect(screen.queryByText('Pat Pending')).toBeNull();
    // The friends API is the only source consulted.
    expect(api.getFriendsByUser).toHaveBeenCalledWith(VIEWER);
    expect(api.searchUsers).not.toHaveBeenCalled();
    expect(api.getFollowersByUser).not.toHaveBeenCalled();
  });

  it('filters locally by display name without triggering a global search', async () => {
    renderDialog();
    await screen.findByText('Ada Lovelace');

    fireEvent.change(searchBox(), { target: { value: 'grace' } });

    expect(screen.getByText('Grace Hopper')).toBeTruthy();
    expect(screen.queryByText('Ada Lovelace')).toBeNull();
    expect(api.searchUsers).not.toHaveBeenCalled();
  });

  it('filters locally by username', async () => {
    renderDialog();
    await screen.findByText('Ada Lovelace');

    fireEvent.change(searchBox(), { target: { value: 'ada' } });

    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.queryByText('Grace Hopper')).toBeNull();
  });

  it('never surfaces a non-friend or a follower, even when their name matches', async () => {
    // Pretend a follower lookup would return Lin if it were ever called.
    renderDialog();
    await screen.findByText('Ada Lovelace');

    fireEvent.change(searchBox(), { target: { value: 'pat' } });
    expect(screen.queryByText('Pat Pending')).toBeNull();
    expect(screen.getByText('No matching friends found')).toBeTruthy();

    fireEvent.change(searchBox(), { target: { value: 'lin' } });
    expect(screen.queryByText('Lin Follower')).toBeNull();
    expect(screen.getByText('No matching friends found')).toBeTruthy();

    expect(api.searchUsers).not.toHaveBeenCalled();
    expect(api.getFollowersByUser).not.toHaveBeenCalled();
  });

  it('shows the no-eligible-friends empty state', async () => {
    api.getFriendsByUser.mockResolvedValue({
      data: [{ id: 'fr-3', requester_id: VIEWER, receiver_id: EXISTING, status: 'accepted' }],
      error: null,
    });
    renderDialog();

    await screen.findByText('You have no eligible friends to invite');
  });

  it('shows a no-matching-friends message when the search has no hits', async () => {
    renderDialog();
    await screen.findByText('Ada Lovelace');

    fireEvent.change(searchBox(), { target: { value: 'zzzz' } });

    expect(screen.getByText('No matching friends found')).toBeTruthy();
  });
});

describe('InviteToGroupDialog submission', () => {
  const selectAda = async () => {
    const row = (await screen.findByText('Ada Lovelace')).closest('label');
    if (!row) throw new Error('friend row not found');
    fireEvent.click(within(row).getByRole('checkbox'));
  };

  it('sends only the selected friend ids to the group-members API', async () => {
    renderDialog();
    await selectAda();

    fireEvent.click(screen.getByText('Send invites'));

    await waitFor(() =>
      expect(api.addGroupMembersSecure).toHaveBeenCalledWith('group-1', ['friend-ada'])
    );
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: 'Invites sent' }));
  });

  it('surfaces the Gateway rejection when the backend refuses a non-friend', async () => {
    api.addGroupMembersSecure.mockResolvedValue({
      data: null,
      error: { message: 'You can only invite your friends to this group.' },
    });
    renderDialog();
    await selectAda();

    fireEvent.click(screen.getByText('Send invites'));

    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'You can only invite your friends to this group.',
          variant: 'destructive',
        })
      )
    );
  });
});
