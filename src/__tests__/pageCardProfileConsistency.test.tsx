// The Pages listing renders every page as a personal profile card. Tone's person
// cards (FriendsTab's friend row, the message-request cards) share one row design:
// a `h-12 w-12` circular avatar, a `font-semibold` name, a
// `text-sm text-muted-foreground` secondary line, and a `size="sm"` action button.
//
// These tests lock the page card to that shared design so a future restyle can't
// silently drift back to a bespoke layout. The behaviour of the card (navigation,
// follow/unfollow, counts) is covered by pageCardNavigation.test.tsx and
// usePagesCounts.test.tsx.

import type { HTMLAttributes, ImgHTMLAttributes } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PageCard } from '@/components/PageCard';
import type { Page } from '@/hooks/usePages';

// Radix's AvatarImage only renders its <img> once the browser reports the image
// as loaded, which never happens under jsdom. Rendering the primitives as plain
// elements lets the test assert the structure PageCard is responsible for.
vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  AvatarImage: (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
  AvatarFallback: ({ children, ...props }: HTMLAttributes<HTMLSpanElement>) => <span {...props}>{children}</span>,
}));

const page: Page = {
  id: 'p1',
  name: 'Ada Fans',
  description: 'desc',
  category: 'Media/News Company',
  cover_image: null,
  profile_pic: null,
  admin_id: 'u1',
  created_at: '2026-01-01',
  follower_count: 3,
  post_count: 5,
  is_following: false,
};

const renderCard = (p: Page = page) =>
  render(
    <MemoryRouter>
      <PageCard page={p} onFollow={vi.fn()} onUnfollow={vi.fn()} />
    </MemoryRouter>
  );

describe('PageCard matches the personal profile card design', () => {
  it('renders one full-width row, like the person cards', () => {
    const { container } = renderCard();
    const row = container.firstChild as HTMLElement;
    expect(row.className).toContain('p-4');
    expect(row.className).toContain('border-b');
    expect(row.className).toContain('border-border/50');
    expect(row.className).toContain('last:border-b-0');
  });

  it('uses the profile avatar size for the page picture', () => {
    renderCard();
    const avatar = screen.getByText('A').parentElement as HTMLElement;
    expect(avatar.className).toContain('h-12');
    expect(avatar.className).toContain('w-12');
  });

  it('uses the profile name typography for the page name', () => {
    renderCard();
    const name = screen.getByRole('link', { name: 'Ada Fans' });
    const heading = name.closest('h3') as HTMLElement;
    expect(heading.className).toContain('font-semibold');
    expect(heading.className).toContain('text-foreground');
  });

  it('places the category and counts on the muted secondary line, like @username', () => {
    renderCard();
    const secondary = screen.getByText('(Media/News Company)').closest('p') as HTMLElement;
    expect(secondary.className).toContain('text-sm');
    expect(secondary.className).toContain('text-muted-foreground');
    expect(secondary.textContent).toContain('3 followers');
    expect(secondary.textContent).toContain('5 posts');
  });

  it('uses the profile card size for the follow action', () => {
    // size="sm" maps to the shared Button `h-9` size used by the person cards.
    renderCard();
    expect(screen.getByRole('button', { name: 'Follow' }).className).toContain('h-9');
  });

  it('uses the same size for the following (already-followed) action', () => {
    renderCard({ ...page, is_following: true });
    expect(screen.getByRole('button', { name: 'Following' }).className).toContain('h-9');
  });
});
