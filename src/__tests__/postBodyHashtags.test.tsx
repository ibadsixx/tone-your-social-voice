// A post body used to render through `MentionText`, which only parses
// `/@(\w+)/g`. A `#hashtag` in a post therefore matched nothing and came out as
// plain text — never a link, never a row in `hashtags`. The renderer that does
// parse both (`MentionHashtagText`, `/(@\w+)|(#\w+)/g`) already existed and was
// already used for comments, so the fix was to point the two post-body render
// sites in `Post.tsx` at it rather than to write a new parser.
//
// These tests pin that the post card actually emits the link. The unit-level
// regex behaviour is covered separately; what matters here is that `Post.tsx`
// wires in the component that has the behaviour, because the two files could
// drift apart again without any failure below noticing.
//
// Run: npx vitest run src/__tests__/postBodyHashtags.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// jsdom has no ResizeObserver; the options menu and the reaction picker measure
// elements before they can open.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

// The card pulls in a large surface (comments, modals, menus). Only the post
// body is under test, so every collaborator is stubbed to null. `MentionText`
// is stubbed too — it is the component this fix replaced, and it must NOT be
// what renders the body any more.
vi.mock('@/components/MentionText', () => ({ MentionText: () => null }));
vi.mock('@/components/MentionHashtagText', () => ({
  MentionHashtagText: ({ text }: { text: string }) => (
    <span data-testid="post-body">{text}</span>
  ),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'viewer-1' } }) }));
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

import Post from '@/components/Post';

// `Post` takes its fields as flat props, not a `post` object. Typed as the real
// prop shape so a rename in `Post.tsx` surfaces here as a type error; the
// `Partial` is because each test overrides one field at a time.
const baseProps: Partial<React.ComponentProps<typeof Post>> = {
  id: '11111111-1111-1111-1111-111111111111',
  user_id: 'author-1',
  content: 'Hello #POV',
  media_url: null,
  media_type: null,
  type: 'normal_post',
  created_at: new Date('2026-01-01T00:00:00Z').toISOString(),
  audience_type: 'public',
  profiles: {
    username: 'author',
    display_name: 'Author',
    profile_pic: null,
  },
  likes: [],
  comments: [],
};

function renderPost(overrides: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter>
      <Post {...({ ...baseProps, ...overrides } as React.ComponentProps<typeof Post>)} />
    </MemoryRouter>
  );
}

describe('the post body renders hashtags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the body through MentionHashtagText, not MentionText', () => {
    renderPost();

    // `MentionText` is stubbed to null, so a body could only appear at all if
    // the card had switched to the component that supports both. This is the
    // regression guard: pointing Post.tsx back at MentionText empties this.
    expect(screen.getByTestId('post-body')).toBeTruthy();
    expect(screen.getByTestId('post-body').textContent).toBe('Hello #POV');
  });

  it('renders the sharer caption through the same component', () => {
    // Post.tsx has TWO render sites — the sharer caption of a reshare and the
    // normal body — and they are mutually exclusive: when `shared_post_id` is
    // set the normal body is not rendered at all (`!shared_post_id` on the
    // second site). Fixing only one leaves `#POV` inert on whichever kind of
    // post the author forgot, so each site is asserted on its own shape.
    const { container } = renderPost({
      content: 'reshared #POV',
      shared_post_id: '22222222-2222-2222-2222-222222222222',
      shared_post: {
        id: '33333333-3333-3333-3333-333333333333',
        content: 'the original #POV',
        profiles: { username: 'other', display_name: 'Other', profile_pic: null },
      },
    });

    // Exactly one body — the sharer's caption — and it came from the renderer.
    expect(screen.getAllByTestId('post-body')).toHaveLength(1);
    expect(container.textContent).toContain('reshared #POV');
  });

  it('leaves the text itself untouched — no reformatting or trimming', () => {
    // The stub renders the raw string, so this proves the card hands the
    // caption over verbatim: whitespace, line breaks and casing preserved.
    const content = 'line one\n  #POV  and #vlog\n\nend @author';
    renderPost({ content });

    expect(screen.getByTestId('post-body').textContent).toBe(content);
  });

  it('renders no body at all when there is no content', () => {
    renderPost({ content: null });

    expect(screen.queryByTestId('post-body')).toBeNull();
  });

  it('hands the renderer the exact caption string', () => {
    // The stub above already renders `text` verbatim, so the assertions on
    // `.textContent` are the proof that nothing is transformed on the way in.
    // Asserting on a spy here would be the same fact twice.
    const { container } = renderPost({ content: 'Hello #POV' });

    expect(container.textContent).toContain('Hello #POV');
  });
});
