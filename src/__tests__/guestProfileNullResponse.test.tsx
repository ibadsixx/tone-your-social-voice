// Guest public-profile reads must never crash (do.md: "Cannot destructure
// property 'data' of '(intermediate value)' as it is null.").
//
// The reported error was not in the profile read at all. It came from
// `useGroups`, reached through every rendered `Post`:
//
//   Post.tsx renders <SharePostModal isOpen={showShareModal} … /> unconditionally
//     → SharePostModal calls useGroups()
//       → const pinsPromise = user ? getUserPinnedGroups(user.id)
//                                 : Promise.resolve(null);
//       → if (pinsPromise) { const { data: pinRows } = await pinsPromise; … }
//
// `if (pinsPromise)` tests a *promise*, and a promise object is always truthy,
// so the guard was true for everyone. For a guest `user` is null, so the
// sentinel resolved to `null` and the line inside the guard destructured `.data`
// out of it:
//
//   TypeError: Cannot destructure property 'data' of '(intermediate value)' as it is null.
//
// That is why the failure tracked the profile rather than the viewer: it
// required a post to render, and a public profile with no posts rendered clean.
// Reproduced against production, 12/12 profiles: every profile whose posts tab
// rendered at least one post threw, every profile with none did not.
//
// The share modal being *closed* is irrelevant — the hooks run on mount, so a
// guest loading a feed of posts got the error with no interaction at all.
//
// The fix is in the hook: "no viewer" is a null request, never a promise that
// resolves to null, and the awaited value is read defensively. No guest-scoped
// read here is authorized anyway — the pins are keyed on the viewer's own id.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useGroups } from '@/hooks/useGroups';
import ProfilePage from '@/pages/ProfilePage';

const authState = vi.hoisted(() => ({ user: null as { id: string } | null }));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));

// The profile-level mocks below replace only the profile reads. Every other
// module (including useGroups and the Post card) stays real.
const profileFns = vi.hoisted(() => ({
  getProfileByUsername: vi.fn(),
  findAuthUserByUsernameResult: vi.fn(),
  ensureProfile: vi.fn(),
  getProfileContentPage: vi.fn(),
}));

vi.mock('@/api/profiles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/profiles')>();
  return { ...actual, getProfileSearchEngineIndexing: vi.fn(async () => false) };
});

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>();
  return {
    ...actual,
    profilesApi: {
      ...actual.profilesApi,
      getProfileByUsername: (...args: unknown[]) => profileFns.getProfileByUsername(...args),
      findAuthUserByUsernameResult: (...args: unknown[]) =>
        profileFns.findAuthUserByUsernameResult(...args),
      ensureProfile: (...args: unknown[]) => profileFns.ensureProfile(...args),
    },
  };
});

vi.mock('@/api/profileContent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/profileContent')>();
  return {
    ...actual,
    getProfileContentPage: (...args: unknown[]) => profileFns.getProfileContentPage(...args),
  };
});

// The header owns unrelated domain reads; this suite exercises the guest post
// path, so a minimal header keeps it focused without fabricating profile data.
vi.mock('@/components/ProfileHeader', () => ({
  default: ({ profile }: { profile: { username: string } }) => <div>@{profile.username}</div>,
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastSpy }) }));

const toastSpy = vi.fn();

const groupFns = vi.hoisted(() => ({
  getGroupsWithMembers: vi.fn(),
  getUserPinnedGroups: vi.fn(),
}));
// Mock the group module only. `src/api/groups.ts` exports named functions and
// `@/api` re-exports the module namespace as `groupsApi` via
// `import * as groupsApi from './groups'`, so overriding the two functions here
// reaches the hook while every other API namespace (profilesApi, postsApi, ...)
// stays real — the end-to-end cases below need the genuine profile and post
// reads.
vi.mock('@/api/groups', () => ({ ...groupFns }));
const groupsApi = groupFns;

const GROUP_ROWS = [
  { id: 'g1', name: 'Open Circle', description: 'public one', privacy: 'public', created_at: '2026-01-01', group_members: [] },
  { id: 'g2', name: 'Inner Circle', description: 'secret one', privacy: 'private', created_at: '2026-01-02', group_members: [] },
];

beforeEach(() => {
  authState.user = null;
  toastSpy.mockClear();
  groupsApi.getGroupsWithMembers.mockReset();
  groupsApi.getUserPinnedGroups.mockReset();
  groupsApi.getGroupsWithMembers.mockResolvedValue({ data: GROUP_ROWS, error: null });
  profileFns.getProfileByUsername.mockReset();
  profileFns.findAuthUserByUsernameResult.mockReset();
  profileFns.ensureProfile.mockReset();
  profileFns.getProfileContentPage.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useGroups as an unauthenticated guest', () => {
  it('resolves instead of throwing "Cannot destructure property data"', async () => {
    // The old sentinel resolved to null, and the destructure below threw. A
    // rejection here means the regression is back.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useGroups(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(errSpy).not.toHaveBeenCalled();
    expect(toastSpy).not.toHaveBeenCalled();
    expect(result.current.groups).toHaveLength(2);
  });

  it('never asks for the pins of a viewer that does not exist', async () => {
    renderHook(() => useGroups(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    });

    await waitFor(() => expect(groupsApi.getGroupsWithMembers).toHaveBeenCalled());
    // The pins read is keyed on the viewer's own id, so a guest is not
    // authorized to make it at all.
    expect(groupsApi.getUserPinnedGroups).not.toHaveBeenCalled();
  });

  it('still lists the public groups a guest may see', async () => {
    const { result } = renderHook(() => useGroups(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(result.current.groups.every((g) => !g.is_member && !g.is_pinned)).toBe(true);
  });

  it('survives a pins read that comes back with no rows', async () => {
    // Belt and braces: the awaited result is read defensively, so an absent
    // pins payload is an empty pin set rather than a crash.
    authState.user = { id: 'viewer-1' };
    groupsApi.getUserPinnedGroups.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useGroups(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(toastSpy).not.toHaveBeenCalled();
    expect(result.current.groups.every((g) => !g.is_pinned)).toBe(true);
  });
});

describe('useGroups as an authenticated viewer', () => {
  beforeEach(() => {
    authState.user = { id: 'viewer-1' };
  });

  it('requests that viewer’s pins and marks the pinned groups', async () => {
    groupsApi.getUserPinnedGroups.mockResolvedValue({ data: [{ group_id: 'g2' }], error: null });

    const { result } = renderHook(() => useGroups(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(groupsApi.getUserPinnedGroups).toHaveBeenCalledWith('viewer-1');
    expect(result.current.groups.find((g) => g.id === 'g1')?.is_pinned).toBe(false);
    expect(result.current.groups.find((g) => g.id === 'g2')?.is_pinned).toBe(true);
  });

  it('keeps the group list when the pins read fails', async () => {
    groupsApi.getUserPinnedGroups.mockRejectedValue(new Error('network down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useGroups(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    // A pin failure degrades to "no pin state"; it must not hide the groups.
    expect(result.current.groups).toHaveLength(2);
    // …but it is still reported, not swallowed silently.
    expect(warnSpy).toHaveBeenCalled();
    // …and it is not escalated into a destructive toast about the group list.
    expect(toastSpy).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
  });
});

// --- end to end: a guest opening a public profile that has a post ------------
//
// The reported symptom, on the path the user actually took. A guest reads a
// public profile whose posts tab renders at least one `Post`; each `Post` mounts
// `SharePostModal`, which mounts `useGroups`. The profile and its content are
// supplied through their public API seams, so the real ProfilePage, Post and
// useGroups code runs without a stale Gateway-era fetch mock.
describe('a guest opening a public profile with posts', () => {
  const PUBLIC_PROFILE = {
    id: 'pid-1',
    username: 'Test',
    display_name: 'One',
    bio: 'hello',
    profile_pic: null,
    cover_pic: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const PUBLIC_POST = {
    id: 'post-1',
    user_id: 'pid-1',
    content: 'a public post',
    type: 'normal_post',
    created_at: '2026-01-02T00:00:00Z',
    profiles: { id: 'pid-1', username: 'Test', display_name: 'One' },
    shared_post: null,
  };

  beforeEach(() => {
    profileFns.getProfileByUsername.mockResolvedValue({ data: PUBLIC_PROFILE, error: null });
    profileFns.getProfileContentPage.mockResolvedValue({
      data: { items: [PUBLIC_POST], has_more: false, next_cursor: null },
      error: null,
    });
  });

  it('renders the profile and its post without a null-destructure error', async () => {
    const pageErrors: string[] = [];
    const onError = (event: ErrorEvent) => {
      pageErrors.push(String((event.error as Error | undefined)?.message ?? event.message));
    };
    window.addEventListener('error', onError);

    const { findByText } = render(
      <MemoryRouter initialEntries={['/profile/Test']}>
        <Routes>
          <Route path="/profile/:username" element={<ProfilePage />} />
          <Route path="/404" element={<div data-testid="notfound">not found</div>} />
        </Routes>
      </MemoryRouter>
    );

    // The profile itself resolves...
    expect(await findByText('@Test')).toBeTruthy();
    // ...and the post renders, which is what mounts the share modal.
    await waitFor(() => expect(document.body.textContent || '').toContain('a public post'));

    expect(pageErrors.filter((m) => /Cannot destructure/.test(m))).toEqual([]);
    expect(toastSpy).not.toHaveBeenCalled();
    window.removeEventListener('error', onError);
  });

  it('shows the existing not-found page for a profile that does not exist', async () => {
    // A readable, empty profile lookup is the only genuine missing-profile case.
    profileFns.getProfileByUsername.mockResolvedValue({ data: null, error: null });

    const pageErrors: string[] = [];
    const onError = (event: ErrorEvent) => {
      pageErrors.push(String((event.error as Error | undefined)?.message ?? event.message));
    };
    window.addEventListener('error', onError);

    const { findByTestId } = render(
      <MemoryRouter initialEntries={['/profile/does-not-exist']}>
        <Routes>
          <Route path="/profile/:username" element={<ProfilePage />} />
          <Route path="/404" element={<div data-testid="notfound">not found</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await findByTestId('notfound')).toBeTruthy();
    expect(pageErrors.filter((m) => /Cannot destructure/.test(m))).toEqual([]);
    window.removeEventListener('error', onError);
  });
});
