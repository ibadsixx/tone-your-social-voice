// The public content detail route: /post/:id, /reel/:id, /photo/:id
// (do.md §7 - all three are one `posts` row and share one renderer).
//
// The hashtag fix changed `Post.tsx`, and `Post` is what this page renders - so
// the fix should reach `/post/:id` for free. That is exactly why it is worth a
// test: the page could be refactored to render the caption inline (the way
// `Mentions.tsx` still does) and every existing test would still pass, because
// `postBodyHashtags.test.tsx` mounts `Post` directly and the SEO test stubs it
// as an opaque `<div>`. Neither one would notice the page stopped delegating.
//
// So this mounts the REAL chain a visitor to /post/:id gets:
//
//   PublicContentPage -> usePost(id) -> <Post> -> MentionHashtagText -> <Link>
//
// and asserts the hashtag in the body is a real link to /hashtag/<tag>. That is
// exactly what the user-visible URL does, so a drift anywhere in the chain - the
// page rendering content itself, or Post pointing back at the @-only
// MentionText - fails here.
//
// Run: npx vitest run src/__tests__/publicContentPageHashtags.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// jsdom has no ResizeObserver; the options menu and the reaction picker measure
// elements before they can open.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

// The page under test owns the data fetch, so `usePost` is the seam: it answers
// with the row the Gateway would return for the URL id.
const mockUsePost = vi.fn();
vi.mock('@/hooks/usePost', () => ({ usePost: (id?: string) => mockUsePost(id) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

// `Post` pulls in a large surface (comments, modals, menus). Its collaborators
// are stubbed because the body renderer is the only thing under test.
vi.mock('@/hooks/useReactions', () => ({
  useReactions: () => ({
    userReaction: null,
    reactionsCount: 0,
    reactionCounts: {},
    toggleReaction: vi.fn(),
  }),
}));
vi.mock('@/hooks/useComments', () => ({
  useComments: () => ({
    comments: [],
    loading: false,
    submitting: false,
    getTopLevelComments: () => [],
    getReplies: () => [],
    getReplyCount: () => 0,
  }),
}));
vi.mock('@/hooks/useSavedPosts', () => ({
  useSavedPosts: () => ({ isSaved: false, toggleSave: vi.fn() }),
}));
vi.mock('@/hooks/useSeeLessPreference', () => ({
  useSeeLessPreference: () => ({ hideReel: vi.fn(), isLoading: false }),
}));
vi.mock('@/components/CommentItem', () => ({ CommentItem: () => null }));
vi.mock('@/components/LocationChip', () => ({ LocationChip: () => null }));
vi.mock('@/components/SharedPost', () => ({ SharedPost: () => null }));
vi.mock('@/components/ReactionUsersModal', () => ({ default: () => null }));
vi.mock('@/components/modals/SendPostModal', () => ({ SendPostModal: () => null }));
vi.mock('@/components/modals/SharePostModal', () => ({ SharePostModal: () => null }));
vi.mock('@/components/PostCommentsPanel', () => ({ default: () => null }));
vi.mock('@/components/reels/ReelFeedbackModal', () => ({ default: () => null }));
vi.mock('@/components/reels/ReelEmbedModal', () => ({ default: () => null }));

import PublicContentPage from '@/pages/PublicContentPage';

const ID = '757653e6-40b3-4910-874f-8d816376591a';

// The row the page asks the Gateway for. `audience_type: 'public'` is what makes
// it indexable and reachable at all; a friends-only row would 404 here, and the
// body would never render.
const post = (over: Record<string, unknown> = {}) => ({
  id: ID,
  user_id: 'author-1',
  content: '#POV',
  media_url: null,
  media_type: null,
  created_at: '2026-09-21T21:13:20.543321+00:00',
  type: 'reel',
  shared_post_id: null,
  profiles: { username: 'author', display_name: 'Author', profile_pic: null },
  audience_type: 'public',
  visibility: 'public',
  status: 'published',
  ...over,
});

const renderAtPost = () =>
  render(
    <MemoryRouter initialEntries={[`/post/${ID}`]}>
      <Routes>
        <Route path="/post/:id" element={<PublicContentPage />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  mockUsePost.mockReset();
  document.head.innerHTML = '';
  document.title = '';
});

describe('a public post detail page renders hashtags as links', () => {
  it('fetches the row named by the URL id', async () => {
    mockUsePost.mockReturnValue({ post: post(), loading: false, notFound: false });
    renderAtPost();
    // The id comes from useParams, not from a feed or a cache - the direct hit
    // from a search result is the only way in.
    expect(mockUsePost).toHaveBeenCalledWith(ID);
  });

  it('turns the #POV body into a link to /hashtag/pov', async () => {
    mockUsePost.mockReturnValue({ post: post({ content: '#POV' }), loading: false, notFound: false });
    renderAtPost();

    // The real MentionHashtagText emits the anchor itself; no stub in this file
    // stands in for it, so this fails if the chain stops reaching it.
    const link = await screen.findByRole('link', { name: '#POV' });
    expect(link.getAttribute('href')).toBe('/hashtag/pov');
  });

  it('lowercases the tag in the URL while leaving the body text as written', async () => {
    mockUsePost.mockReturnValue({ post: post({ content: 'Breakfast #POV today' }), loading: false, notFound: false });
    renderAtPost();

    const link = await screen.findByRole('link', { name: '#POV' });
    expect(link.getAttribute('href')).toBe('/hashtag/pov');
    // The fix must not reformat the caption: the rendered text stays exactly as
    // the author wrote it.
    expect(link.textContent).toBe('#POV');
  });

  it('does not render the body through the @-only renderer', async () => {
    // `MentionText` never emits an anchor for a hashtag. If the page (or Post)
    // ever drops back to it, this is the assertion that notices: the body would
    // still contain "#POV" as text, but no link would exist.
    mockUsePost.mockReturnValue({ post: post({ content: '#POV' }), loading: false, notFound: false });
    renderAtPost();

    await waitFor(() => expect(screen.getByText(/#POV/)).toBeTruthy());
    expect(screen.queryByRole('link', { name: '#POV' })).not.toBeNull();
  });

  it('still links @mentions through the same component', async () => {
    // MentionHashtagText handles both; fixing hashtags must not break mentions.
    mockUsePost.mockReturnValue({ post: post({ content: 'hi @ada and #POV' }), loading: false, notFound: false });
    renderAtPost();

    expect((await screen.findByRole('link', { name: '@ada' })).getAttribute('href')).toBe('/profile/ada');
    expect((await screen.findByRole('link', { name: '#POV' })).getAttribute('href')).toBe('/hashtag/pov');
  });

  it('renders no body when the row has no content', async () => {
    mockUsePost.mockReturnValue({ post: post({ content: null }), loading: false, notFound: false });
    renderAtPost();

    await waitFor(() => expect(screen.queryByRole('link', { name: '#POV' })).toBeNull());
    expect(screen.queryByText(/#POV/)).toBeNull();
  });
});