// The Mentions page was the last surface still rendering a post or comment body
// through `MentionText`, which parses only `/@(\w+)/g`. A `#hashtag` in the
// mentioned body therefore came out as plain text there, even after the post
// card was fixed - the same bug, in the one remaining place.
//
// It is easy to miss because the page's job is mentions: every fixture written
// for it naturally contains an `@handle`, which `MentionText` does link. Only a
// hashtag in the previewed body reveals the gap. So these tests put both in one
// body and assert on each, which is what stops the page drifting back.
//
// The real `MentionHashtagText` is used - no stub stands in for it - so this
// fails if the page stops reaching it.
//
// Run: npx vitest run src/__tests__/mentionsPageHashtags.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockUseMentionsFeed = vi.fn();
vi.mock('@/hooks/useMentionsFeed', () => ({
  useMentionsFeed: (targetUserId?: string) => mockUseMentionsFeed(targetUserId),
}));

import Mentions from '@/pages/Mentions';

const author = { id: 'author-1', username: 'author', display_name: 'Author', profile_pic: null };
const when = new Date('2026-09-21T21:13:20.000Z').toISOString();

// A `post` mention whose body carries both a hashtag and a mention. The mention
// is the case the page already handled; the hashtag is the one it did not.
const postMention = {
  id: 'mention-1',
  source_type: 'post' as const,
  source_id: 'post-1',
  created_by: 'author-1',
  created_at: when,
  post: { id: 'post-1', content: 'Breakfast #POV with @ada', user_id: 'author-1', created_at: when, author },
};

// The comment branch resolves `content` from `mention.comment` instead.
const commentMention = {
  id: 'mention-2',
  source_type: 'comment' as const,
  source_id: 'comment-1',
  created_by: 'author-1',
  created_at: when,
  comment: {
    id: 'comment-1',
    content: 'nice #POV @ada',
    user_id: 'author-1',
    post_id: 'post-1',
    created_at: when,
    author,
  },
};

const renderMentions = () =>
  render(
    <MemoryRouter>
      <Mentions />
    </MemoryRouter>
  );

beforeEach(() => {
  mockUseMentionsFeed.mockReset();
});

describe('the mentions page renders hashtags in the previewed body', () => {
  it('links a #hashtag in a post mention preview', () => {
    mockUseMentionsFeed.mockReturnValue({ mentions: [postMention], loading: false });
    renderMentions();

    // The real renderer emits the anchor; this is the assertion that fails while
    // the page uses the @-only component, because the body would still read
    // "#POV" but no link would exist.
    expect(screen.getByRole('link', { name: '#POV' }).getAttribute('href')).toBe('/hashtag/pov');
  });

  it('links a #hashtag in a comment mention preview', () => {
    mockUseMentionsFeed.mockReturnValue({ mentions: [commentMention], loading: false });
    renderMentions();

    expect(screen.getByRole('link', { name: '#POV' }).getAttribute('href')).toBe('/hashtag/pov');
  });

  it('still links the @mention in the same body', () => {
    // Fixing hashtags must not cost mentions - they share one component, so this
    // proves the replacement is a superset rather than a swap.
    mockUseMentionsFeed.mockReturnValue({ mentions: [postMention], loading: false });
    renderMentions();

    expect(screen.getByRole('link', { name: '@ada' }).getAttribute('href')).toBe('/profile/ada');
    expect(screen.getByRole('link', { name: '#POV' }).getAttribute('href')).toBe('/hashtag/pov');
  });

  it('leaves the previewed text exactly as written', () => {
    mockUseMentionsFeed.mockReturnValue({ mentions: [postMention], loading: false });
    renderMentions();

    expect(screen.getByRole('link', { name: '#POV' }).textContent).toBe('#POV');
  });

  it('renders nothing to link when the body has no hashtag', () => {
    mockUseMentionsFeed.mockReturnValue({
      mentions: [{ ...postMention, post: { ...postMention.post, content: 'just @ada here' } }],
      loading: false,
    });
    renderMentions();

    expect(screen.getByRole('link', { name: '@ada' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: '#POV' })).toBeNull();
  });
});