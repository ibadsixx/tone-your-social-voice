import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// The real Post component pulls in auth/feed/reaction providers; for these
// tests we only need to know whether full post cards are rendered at all.
vi.mock('@/components/Post', () => ({
  default: () => <div data-testid="post-card" />,
}));

import FilteredPostsLayout from '@/components/FilteredPostsLayout';
import { ProfileReelsGrid } from '@/components/ProfileReelsGrid';

function reelPost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reel-1',
    type: 'reel',
    media_url: 'https://cdn.test/reel.mp4',
    media_type: 'video',
    thumbnail: null as string | null,
    duration: 10,
    content: 'a reel',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePost(overrides: Record<string, unknown>) {
  return {
    id: 'p1',
    user_id: 'u1',
    content: 'hello',
    media_url: null as string | null,
    media_type: null as 'image' | 'video' | null,
    created_at: '2026-01-01T00:00:00.000Z',
    type: 'normal_post' as const,
    profiles: { username: 'alice', display_name: 'Alice', profile_pic: null },
    ...overrides,
  };
}

function renderWithRouter(ui: ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={ui} />
        <Route path="/reels/:id" element={<div>reel-viewer</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProfileReelsGrid', () => {
  it('Test 1: renders one 9:16 tile per reel and nothing else', () => {
    renderWithRouter(
      <ProfileReelsGrid
        posts={[
          reelPost({ id: 'reel-1' }),
          reelPost({ id: 'reel-2', created_at: '2026-02-01T00:00:00.000Z' }),
          makePost({ id: 'video', media_url: 'https://cdn.test/v.mp4', media_type: 'video' }),
          makePost({ id: 'photo', media_url: 'https://cdn.test/p.jpg', media_type: 'image' }),
        ]}
      />
    );

    const tiles = screen.getByTestId('profile-reels-grid').querySelectorAll('button');
    expect(tiles).toHaveLength(2);
    expect(tiles[0].className).toContain('aspect-[9/16]');
  });

  it('Test 2: a profile with normal video posts but no reels shows the empty state', () => {
    renderWithRouter(
      <ProfileReelsGrid
        posts={[makePost({ id: 'video', media_url: 'https://cdn.test/v.mp4', media_type: 'video' })]}
      />
    );

    expect(screen.getByTestId('profile-reels-empty')).toBeTruthy();
    expect(screen.queryByTestId('profile-reels-grid')).toBeNull();
  });

  it('Test 4: clicking a reel opens the existing /reels/:id viewer', () => {
    renderWithRouter(<ProfileReelsGrid posts={[reelPost({ id: 'reel-9' })]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open reel' }));
    expect(screen.getByText('reel-viewer')).toBeTruthy();
  });
});

describe('FilteredPostsLayout Reels filter', () => {
  it('Test 3: shows only reels as a gallery, never full post cards', () => {
    renderWithRouter(
      <FilteredPostsLayout
        posts={[
          makePost({ id: 'photo', media_url: 'https://cdn.test/p.jpg', media_type: 'image' }),
          makePost({
            id: 'reel-1',
            type: 'reel',
            media_url: 'https://cdn.test/r.mp4',
            media_type: 'video',
          }),
        ]}
        loading={false}
        isOwnProfile
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Reels' })[0]);

    const tiles = screen.getByTestId('profile-reels-grid').querySelectorAll('button');
    expect(tiles).toHaveLength(1);
    expect(screen.queryByTestId('post-card')).toBeNull();
  });
});
