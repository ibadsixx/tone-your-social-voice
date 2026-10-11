// The Groups listing page must show real numbers: distinct member counts, the
// groups the viewer actually joined, and the groups the viewer owns
// (`groups.created_by`). These tests pin the hook's mapping and the card's
// cover behaviour, including the duplicate-membership and duplicate-row cases
// the task calls out.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useGroups } from '@/hooks/useGroups';
import { GroupCard } from '@/components/groups/GroupCard';

const authState = vi.hoisted(() => ({ user: null as { id: string } | null }));
const toastSpy = vi.fn();

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastSpy }) }));

const groupFns = vi.hoisted(() => ({
  getGroupsWithMembers: vi.fn(),
  getUserPinnedGroups: vi.fn(),
  joinGroupSecure: vi.fn(),
  leaveGroupSecure: vi.fn(),
  createGroupSecure: vi.fn(),
}));
vi.mock('@/api/groups', () => ({ ...groupFns }));
const groupsApi = groupFns;

const VIEWER = 'u1';

const GROUP_ROWS = [
  {
    id: 'g1',
    name: 'Owned with members',
    description: 'mine',
    privacy: 'public',
    created_by: VIEWER,
    cover_image: 'https://cdn.example/cover-g1.jpg',
    created_at: '2026-01-03',
    group_members: [
      { group_id: 'g1', user_id: VIEWER, role: 'admin' },
      { group_id: 'g1', user_id: 'u2', role: 'member' },
      // Duplicate membership row for u2: must count once.
      { group_id: 'g1', user_id: 'u2', role: 'member' },
      { group_id: 'g1', user_id: 'u3', role: 'member' },
    ],
  },
  {
    id: 'g2',
    name: 'Joined group',
    description: 'their group',
    privacy: 'public',
    created_by: 'u2',
    cover_image: null,
    cover_image_unused: null,
    group_members: [
      { group_id: 'g2', user_id: VIEWER, role: 'member' },
      { group_id: 'g2', user_id: 'u4', role: 'member' },
    ],
  },
  // Same group returned twice by the API: must be listed and counted once.
  {
    id: 'g2',
    name: 'Owned with members',
    description: 'duplicate row',
    privacy: 'public',
    created_by: VIEWER,
    cover_image: null,
    group_members: [],
  },
  {
    id: 'g3',
    name: 'Owned empty',
    description: null,
    privacy: 'private',
    created_by: VIEWER,
    cover_image: null,
    group_members: [],
  },
];

beforeEach(() => {
  authState.user = { id: VIEWER };
  toastSpy.mockClear();
  groupsApi.getGroupsWithMembers.mockReset();
  groupsApi.getUserPinnedGroups.mockReset();
  groupsApi.joinGroupSecure.mockReset();
  groupsApi.leaveGroupSecure.mockReset();
  groupsApi.getGroupsWithMembers.mockResolvedValue({ data: GROUP_ROWS, error: null });
  groupsApi.getUserPinnedGroups.mockResolvedValue({ data: [], error: null });
  groupsApi.joinGroupSecure.mockResolvedValue({ data: { status: 'ok' }, error: null });
  groupsApi.leaveGroupSecure.mockResolvedValue({ data: { status: 'ok' }, error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderGroups() {
  return renderHook(() => useGroups(), {
    wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
  });
}

describe('useGroups: real counts, cover and ownership', () => {
  it('counts distinct members and never inflates from duplicate rows', async () => {
    const { result } = renderGroups();
    await waitFor(() => expect(result.current.loading).toBe(false));

    const byId = new Map(result.current.groups.map((g) => [g.id, g]));
    expect(byId.get('g1')?.member_count).toBe(3); // u1, u2, u3 — not 4
    expect(byId.get('g2')?.member_count).toBe(2);
    expect(byId.get('g3')?.member_count).toBe(0); // genuinely empty stays 0
  });

  it('dedupes groups returned twice by the API', async () => {
    const { result } = renderGroups();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups.map((g) => g.id)).toEqual(['g1', 'g2', 'g3']);
  });

  it('maps cover_image and created_by from the API rows', async () => {
    const { result } = renderGroups();
    await waitFor(() => expect(result.current.loading).toBe(false));

    const byId = new Map(result.current.groups.map((g) => [g.id, g]));
    expect(byId.get('g1')?.cover_image).toBe('https://cdn.example/cover-g1.jpg');
    expect(byId.get('g1')?.created_by).toBe(VIEWER);
    expect(byId.get('g3')?.cover_image).toBeNull();
  });

  it('lists joined groups by membership, excluding admin-owned groups', async () => {
    const { result } = renderGroups();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.getJoinedGroups().map((g) => g.id)).toEqual(['g2']);
  });

  it('lists owned groups by created_by, not by membership', async () => {
    const { result } = renderGroups();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.getManagedGroups().map((g) => g.id)).toEqual(['g1', 'g3']);
  });

  it('does not treat a viewer who is only a member as an owner', async () => {
    const { result } = renderGroups();
    await waitFor(() => expect(result.current.loading).toBe(false));

    const managedIds = result.current.getManagedGroups().map((g) => g.id);
    expect(managedIds).not.toContain('g2');
  });
});

describe('useGroups: join/leave go through the authorized Gateway routes', () => {
  it('joins through the secure endpoint (never the blocked generic insert)', async () => {
    const { result } = renderGroups();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.joinGroup('g2');

    expect(groupsApi.joinGroupSecure).toHaveBeenCalledWith('g2', VIEWER);
    // The list is refreshed so the new membership is reflected immediately.
    expect(groupsApi.getGroupsWithMembers.mock.calls.length).toBeGreaterThan(1);
  });

  it('leaves through the secure endpoint and surfaces a join failure', async () => {
    groupsApi.leaveGroupSecure.mockResolvedValueOnce({ data: null, error: new Error('Leave failed') });
    const { result } = renderGroups();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.leaveGroup('g2');
    expect(groupsApi.leaveGroupSecure).toHaveBeenCalledWith('g2', VIEWER);
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Leave failed', variant: 'destructive' })
    );
  });
});

describe('useGroups: membership resolves against the latest viewer', () => {
  // On a real page load the hook fetches while auth is still resolving, so an
  // early call starts with `user === null` and a later call starts with the
  // signed-in viewer. If the signed-out call resolves last it used to recompute
  // every `is_member` as false and wipe the Joined list — even though the API
  // returned the membership rows. The fix reads the viewer at resolution time.
  it('does not let an earlier signed-out fetch overwrite the joined list', async () => {
    const resolvers: Array<(value: { data: unknown; error: null }) => void> = [];
    groupsApi.getGroupsWithMembers.mockImplementation(
      () => new Promise((resolve) => { resolvers.push(resolve); })
    );
    authState.user = null;

    const { result, rerender } = renderGroups();
    await waitFor(() => expect(resolvers.length).toBe(1));

    // Auth resolves and a second fetch starts with the viewer.
    authState.user = { id: VIEWER };
    rerender();
    await waitFor(() => expect(resolvers.length).toBe(2));

    // The viewer-aware response lands first…
    await act(async () => { resolvers[1]({ data: GROUP_ROWS, error: null }); });
    await waitFor(() => expect(result.current.getJoinedGroups().map((g) => g.id)).toEqual(['g2']));

    // …then the stale signed-out fetch resolves last and must not clear it.
    await act(async () => { resolvers[0]({ data: GROUP_ROWS, error: null }); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.getJoinedGroups().map((g) => g.id)).toEqual(['g2']);
  });
});

describe('useGroups: a failed fetch is surfaced, not shown as empty', () => {
  it('exposes the API error instead of silently returning an empty list', async () => {
    groupsApi.getGroupsWithMembers.mockResolvedValueOnce({ data: null, error: new Error('Network down') });
    const { result } = renderGroups();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Network down');
    expect(result.current.getJoinedGroups()).toEqual([]);
    expect(result.current.groups).toEqual([]);
  });
});

describe('GroupCard cover thumbnail', () => {
  const baseGroup = {
    id: 'g1',
    name: 'Ada Fans',
    description: 'desc',
    privacy: 'public',
    cover_image: 'https://cdn.example/cover.jpg',
    created_by: 'u1',
    created_at: '2026-01-01',
    member_count: 3,
    is_member: false,
  };

  it('renders the actual cover URL with object-cover', () => {
    render(
      <MemoryRouter>
        <GroupCard group={baseGroup} />
      </MemoryRouter>
    );

    const img = screen.getByAltText('Ada Fans cover') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('https://cdn.example/cover.jpg');
    expect(img.className).toContain('object-cover');
  });

  it('shows a neutral fallback when there is no cover image', () => {
    render(
      <MemoryRouter>
        <GroupCard group={{ ...baseGroup, cover_image: null }} />
      </MemoryRouter>
    );

    expect(screen.queryByAltText('Ada Fans cover')).toBeNull();
  });

  it('falls back instead of showing a broken image when the URL fails', () => {
    render(
      <MemoryRouter>
        <GroupCard group={baseGroup} />
      </MemoryRouter>
    );

    fireEvent.error(screen.getByAltText('Ada Fans cover'));
    expect(screen.queryByAltText('Ada Fans cover')).toBeNull();
  });
});
