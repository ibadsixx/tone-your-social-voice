// The page name (and profile picture) on a /pages card must open the existing
// `/pages/:id` detail route (the same route PageDetail reads via useParams and
// the owned-variant Manage/Post buttons already used). The card actions must
// keep working and must not navigate.

import type { ComponentProps } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PageCard } from '@/components/PageCard';
import type { Page } from '@/hooks/usePages';

const page: Page = {
  id: 'b0bd2288-4feb-45d8-9d37-f7c9fecc146f',
  name: 'Gold Oil Daily',
  description: 'desc',
  category: 'Business',
  cover_image: null,
  profile_pic: null,
  admin_id: 'u1',
  created_at: '2026-01-01',
  follower_count: 2,
  is_following: false,
};

const renderCard = (props: Partial<ComponentProps<typeof PageCard>> = {}) => {
  const onFollow = vi.fn();
  const onUnfollow = vi.fn();
  render(
    <MemoryRouter initialEntries={['/pages']}>
      <Routes>
        <Route
          path="/pages"
          element={<PageCard page={page} onFollow={onFollow} onUnfollow={onUnfollow} {...props} />}
        />
        <Route path="/pages/:id" element={<div data-testid="detail">PAGE DETAIL</div>} />
      </Routes>
    </MemoryRouter>
  );
  return { onFollow, onUnfollow };
};

describe('PageCard page-name navigation', () => {
  it('navigates to /pages/:id when the page name is clicked, using the page id', () => {
    renderCard();
    const nameLink = screen.getByRole('link', { name: 'Gold Oil Daily' }) as HTMLAnchorElement;
    // The href is the real, refreshable route with the page's id.
    expect(nameLink.getAttribute('href')).toBe(`/pages/${page.id}`);

    fireEvent.click(nameLink);
    expect(screen.getByTestId('detail')).toBeTruthy();
  });

  it('navigates when the profile picture is clicked', () => {
    renderCard();
    const avatarLink = screen.getByRole('link', { name: `Open ${page.name}` }) as HTMLAnchorElement;
    expect(avatarLink.getAttribute('href')).toBe(`/pages/${page.id}`);

    fireEvent.click(avatarLink);
    expect(screen.getByTestId('detail')).toBeTruthy();
  });

  it('Follow performs its own action and does not navigate', async () => {
    const { onFollow } = renderCard();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Follow$/ }));
    });
    expect(onFollow).toHaveBeenCalledWith(page.id);
    expect(screen.queryByTestId('detail')).toBeNull();
  });

  it('Unfollow performs its own action and does not navigate', async () => {
    const { onUnfollow } = renderCard({ page: { ...page, is_following: true } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Following/ }));
    });
    expect(onUnfollow).toHaveBeenCalledWith(page.id);
    expect(screen.queryByTestId('detail')).toBeNull();
  });
});
