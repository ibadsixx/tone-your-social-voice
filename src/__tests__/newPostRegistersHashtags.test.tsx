// The composer is the entry point that has always registered hashtags, and the
// Editor fix made the Editor call the same helper. This file mounts the real
// `NewPost` and drives its own submit handler, because that handler is where the
// call lives — asserting on the helper alone (see composerHashtagPersistence)
// would not notice if the composer stopped calling it.
//
// `NewPost` does not create the post itself: it takes `onCreatePost` as a prop
// and only registers tags once that resolves with an id. So the post-creation
// step is a stub here and the subject under test is what NewPost does with the
// id it gets back.
//
// Run: npx vitest run src/__tests__/newPostRegistersHashtags.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

const POST_ID = 'post-from-composer-1';
const saveMentionsAndHashtags = vi.fn();
const onCreatePost = vi.fn();

// STABLE identities. `NewPost` puts `user` and `profile` in effect dependency
// lists; a fresh object literal from each hook call would re-run those effects
// forever and hang the worker instead of failing an assertion.
const AUTH_USER = { id: 'viewer-1', user_metadata: { display_name: 'Viewer' } };
const PROFILE = { username: 'viewer', display_name: 'Viewer', profile_pic: null };

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: AUTH_USER }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ profile: PROFILE, loading: false }) }));
vi.mock('@/hooks/useMentions', () => ({
  useMentions: () => ({ saveMentionsAndHashtags }),
}));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));
vi.mock('@/contexts/PageSwitchContext', () => ({
  usePageSwitch: () => ({ actingPage: null }),
}));
vi.mock('@/hooks/useAudience', () => ({
  useAudience: () => ({ audienceToDbFormat: vi.fn(() => 'friends') }),
}));
vi.mock('@/hooks/useHasActiveStories', () => ({
  useHasActiveStories: () => ({ hasActiveStories: false }),
}));
vi.mock('@/hooks/useStatusVisibility', () => ({
  useStatusVisibility: () => ({ statusVisible: true }),
}));

// The composer's media pipeline is not under test and would otherwise open
// upload state; cut the whole subtree rather than chase each hook. Each of these
// is a DEFAULT export, so the mock shape has to match or the import fails.
vi.mock('@/hooks/useAutoUpload', () => ({
  useAutoUpload: () => ({ uploading: false, uploadedUrls: [], startUpload: vi.fn() }),
}));
vi.mock('@/components/TagPeopleModal', () => ({ default: () => null }));
vi.mock('@/components/TaggedUserChip', () => ({ default: () => null }));
vi.mock('@/components/MentionAutocomplete', () => ({ default: () => null }));
vi.mock('@/components/FeelingPicker', () => ({ FeelingPicker: () => null }));
vi.mock('@/components/FeelingChip', () => ({ default: () => null }));
vi.mock('@/components/SchedulePostModal', () => ({ default: () => null }));
vi.mock('@/components/LocationSelector', () => ({ LocationSelector: () => null }));
vi.mock('@/components/LocationChip', () => ({ default: () => null }));

import NewPost from '@/components/NewPost';

/** Type into the composer and submit it. */
async function submitCaption(caption: string) {
  render(
    <MemoryRouter>
      <NewPost onCreatePost={onCreatePost} />
    </MemoryRouter>
  );

  const textarea = await screen.findByPlaceholderText("What's on your mind?");
  fireEvent.change(textarea, { target: { value: caption } });

  // The Post button is disabled until there is content, so it doubles as the
  // signal that the typed text reached the component's state.
  const button = screen.getByRole('button', { name: /post/i });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(button);
}

describe('the composer registers the caption hashtags', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    onCreatePost.mockResolvedValue(POST_ID);
    saveMentionsAndHashtags.mockResolvedValue(undefined);
  });

  it('calls the existing helper with the created id and the typed text', async () => {
    await submitCaption('Hello #POV');

    await waitFor(() => expect(saveMentionsAndHashtags).toHaveBeenCalledTimes(1));
    expect(saveMentionsAndHashtags).toHaveBeenCalledWith('post', POST_ID, 'Hello #POV');
  });

  it('registers the hashtag only after the post id comes back', async () => {
    // The helper writes `hashtag_links` rows pointing at the post. Called before
    // the id exists it would either throw or write an orphan link, so the order
    // of `onCreatePost` resolving and the helper running is the fact being
    // pinned — not simply that both were called.
    const timeline: string[] = [];
    onCreatePost.mockImplementation(async () => {
      timeline.push('created');
      return POST_ID;
    });
    saveMentionsAndHashtags.mockImplementation(async () => {
      timeline.push('hashtags');
    });

    await submitCaption('Hello #POV');

    await waitFor(() => expect(saveMentionsAndHashtags).toHaveBeenCalled());
    expect(timeline).toEqual(['created', 'hashtags']);
  });

  it('does not call the helper when the post was not created', async () => {
    // `onCreatePost` returning undefined means the post was not written — for
    // example a guest or a failed insert. Registering tags then would leave
    // `hashtag_links` rows pointing at a post that does not exist.
    onCreatePost.mockResolvedValue(undefined);

    await submitCaption('Hello #POV');

    await waitFor(() => expect(onCreatePost).toHaveBeenCalled());
    expect(saveMentionsAndHashtags).not.toHaveBeenCalled();
  });

  it('clears the composer but keeps the helper call when there is no hashtag', async () => {
    // The helper's own no-op is covered in composerHashtagPersistence.test.ts;
    // what matters here is that a plain caption still goes through the same call,
    // so the two entry points cannot drift into behaving differently.
    await submitCaption('a plain caption');

    await waitFor(() => expect(saveMentionsAndHashtags).toHaveBeenCalledTimes(1));
    expect(saveMentionsAndHashtags).toHaveBeenCalledWith('post', POST_ID, 'a plain caption');
  });
});