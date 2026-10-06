// A shared post shows the ORIGINAL post's body inside the sharing post's card.
// That body is rendered by `SharedPost`, and it was interpolated as plain text -
// `{sharedPost.content}` - with no parser at all. So a `#hashtag` there was inert,
// and so was every `@mention`, which makes this the one body surface where the
// original @-only renderer would have been an improvement.
//
// The card is the sharing post's, so it is a normal post card in every other
// respect; the fix is the same one applied to `Post.tsx`, `PublicContentPage` and
// `Mentions`: hand the body to `MentionHashtagText`, which parses both.
//
// The real renderer is used, so this fails if `SharedPost` stops reaching it.
//
// Run: npx vitest run src/__tests__/sharedPostHashtags.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { SharedPost } from '@/components/SharedPost';

const when = new Date('2026-09-21T21:13:20.000Z').toISOString();

const shared = (over: Record<string, unknown> = {}) => ({
  id: 'original-1',
  content: 'Original #POV by @ada',
  media_url: null,
  media_type: null,
  type: 'normal_post',
  created_at: when,
  profiles: { username: 'author', display_name: 'Author', profile_pic: null },
  ...over,
});

const renderShared = (over: Record<string, unknown> = {}) =>
  render(
    <MemoryRouter>
      <SharedPost sharedPost={shared(over)} />
    </MemoryRouter>
  );

describe('a shared post renders the original body through the shared renderer', () => {
  it('links a #hashtag in the original body', () => {
    renderShared({ content: 'Original #POV by @ada' });
    expect(screen.getByRole('link', { name: '#POV' }).getAttribute('href')).toBe('/hashtag/pov');
  });

  it('links an @mention in the original body', () => {
    // The previous code parsed neither, so this is a fix for mentions too - not
    // just a like-for-like swap of one renderer for another.
    renderShared({ content: 'Original #POV by @ada' });
    expect(screen.getByRole('link', { name: '@ada' }).getAttribute('href')).toBe('/profile/ada');
  });

  it('keeps the text exactly as written', () => {
    renderShared({ content: 'Original #POV by @ada' });
    expect(screen.getByRole('link', { name: '#POV' }).textContent).toBe('#POV');
    expect(screen.getByRole('link', { name: '@ada' }).textContent).toBe('@ada');
  });

  it('adds no links when the body has neither', () => {
    renderShared({ content: 'no tags at all' });
    expect(screen.queryByRole('link', { name: /#|@/ })).toBeNull();
    expect(screen.getByText('no tags at all')).toBeTruthy();
  });

  it('renders no body when the original content is null', () => {
    renderShared({ content: null });
    expect(screen.queryByRole('link', { name: '#POV' })).toBeNull();
  });
});