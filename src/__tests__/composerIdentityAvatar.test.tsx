// The composer avatar must match the active publishing identity (do.md "Show
// the Active Page Avatar in the Post Composer").
//
// When posting as a Page the composer shows the PAGE'S own picture. A Page
// whose own picture is empty falls back to its cover image, and then to its
// initial — never to the admin's personal avatar. Posting as the personal user
// shows the personal picture. These tests pin both halves.
//
// This mirrors newPostRegistersHashtags.test.tsx: the mocked hooks return
// STABLE identities (NewPost keeps them in effect dependency lists, so a fresh
// object per call loops forever), and the composer's child subtrees are cut
// because they are not under test. The acting page is a stable container whose
// contents are swapped per test.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type React from 'react';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.assign(globalThis, { ResizeObserver: ResizeObserverStub });

const hoisted = vi.hoisted(() => {
  const state: { actingPage: Record<string, unknown> | null } = { actingPage: null };
  const user = { id: 'viewer-1', user_metadata: { display_name: 'Badsi' } };
  const profile = { username: 'badsi', display_name: 'Badsi Islam', profile_pic: 'https://cdn.test/badsi.jpg' };
  return { state, user, profile };
});

vi.mock('@/contexts/PageSwitchContext', () => ({
  usePageSwitch: () => ({ actingPage: hoisted.state.actingPage }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: hoisted.user }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: hoisted.profile, loading: false }) }));
vi.mock('@/hooks/useMentions', () => ({ useMentions: () => ({ saveMentionsAndHashtags: vi.fn() }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));
vi.mock('@/hooks/useAudience', () => ({ useAudience: () => ({ audienceToDbFormat: vi.fn(() => 'friends') }) }));
vi.mock('@/hooks/useHasActiveStories', () => ({ useHasActiveStories: () => ({ hasActiveStories: false }) }));
vi.mock('@/hooks/useStatusVisibility', () => ({ useStatusVisibility: () => ({ statusVisible: true, disableAutoUploads: false }) }));
vi.mock('@/hooks/useAutoUpload', () => ({ useAutoUpload: () => ({ uploading: false, uploadedUrls: [], startUpload: vi.fn() }) }));
vi.mock('@/components/TagPeopleModal', () => ({ default: () => null }));
vi.mock('@/components/TaggedUserChip', () => ({ default: () => null }));
vi.mock('@/components/MentionAutocomplete', () => ({ default: () => null }));
vi.mock('@/components/FeelingPicker', () => ({ FeelingPicker: () => null }));
vi.mock('@/components/FeelingChip', () => ({ default: () => null }));
vi.mock('@/components/SchedulePostModal', () => ({ default: () => null }));
vi.mock('@/components/LocationSelector', () => ({ LocationSelector: () => null }));
vi.mock('@/components/LocationChip', () => ({ default: () => null }));

import NewPost from '@/components/NewPost';

const PERSONAL_PIC = hoisted.profile.profile_pic;

// Radix renders no <img> in jsdom, so "which identity" is read off the fallback
// initial: 'T' for Tone, 'B' for Badsi.
const fallbackLetters = () =>
  [...document.querySelectorAll('span')]
    .map((s) => s.textContent)
    .filter((t): t is string => !!t && t.length === 1);

const renderComposer = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <NewPost onCreatePost={vi.fn()} {...({ pagePost: !!hoisted.state.actingPage } as Record<string, unknown> & React.ComponentProps<typeof NewPost>)} />
    </MemoryRouter>
  );

beforeEach(() => {
  hoisted.state.actingPage = null;
  cleanup();
});
afterEach(() => cleanup());

describe('composer avatar follows the active publishing identity', () => {
  it('uses the Page initial when the active Page has no picture of its own', () => {
    hoisted.state.actingPage = { id: 'p1', name: 'Tone', cover_image: null, profile_pic: null };
    renderComposer();
    expect(screen.getByPlaceholderText("What's on your mind?")).toBeTruthy();
    expect(fallbackLetters()).toContain('T');
    expect(fallbackLetters()).not.toContain('B');
  });

  it('never falls back to the admin initial while posting as a Page with a picture', () => {
    hoisted.state.actingPage = { id: 'p1', name: 'Tone', cover_image: null, profile_pic: 'https://cdn.test/tone.jpg' };
    renderComposer();
    expect(fallbackLetters()).not.toContain('B');
  });

  it('shows the personal initial when posting as the personal user', () => {
    hoisted.state.actingPage = null;
    renderComposer();
    expect(fallbackLetters()).toContain('B');
    expect(fallbackLetters()).not.toContain('T');
  });
});

describe('resolveIdentityAvatar (the single source of truth)', () => {
  it('prefers the Page profile picture', async () => {
    const { resolveIdentityAvatar } = await import('@/utils/publishingIdentityAvatar');
    expect(
      resolveIdentityAvatar({ id: 'p1', name: 'Tone', cover_image: 'cover.jpg', profile_pic: 'pic.jpg' }, hoisted.profile).src,
    ).toBe('pic.jpg');
  });

  it('falls back to the Page cover image, never the personal picture', async () => {
    const { resolveIdentityAvatar } = await import('@/utils/publishingIdentityAvatar');
    const resolved = resolveIdentityAvatar({ id: 'p1', name: 'Tone', cover_image: 'cover.jpg', profile_pic: null }, hoisted.profile);
    expect(resolved.src).toBe('cover.jpg');
    expect(resolved.src).not.toBe(PERSONAL_PIC);
  });

  it('returns no image at all for a Page with neither picture nor cover', async () => {
    const { resolveIdentityAvatar } = await import('@/utils/publishingIdentityAvatar');
    expect(resolveIdentityAvatar({ id: 'p1', name: 'Tone', cover_image: null, profile_pic: null }, hoisted.profile).src).toBeUndefined();
  });

  it('uses the personal picture for the personal identity', async () => {
    const { resolveIdentityAvatar } = await import('@/utils/publishingIdentityAvatar');
    expect(resolveIdentityAvatar(null, hoisted.profile).src).toBe(PERSONAL_PIC);
  });
});
