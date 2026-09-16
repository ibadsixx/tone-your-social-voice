import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// The real Post component pulls in auth/feed/reaction providers; for these
// tests we only need to know whether full post cards are rendered at all.
vi.mock('@/components/Post', () => ({
  default: () => <div data-testid="post-card" />,
}));

import FilteredPostsLayout from '@/components/FilteredPostsLayout';
import { ProfilePhotosGrid } from '@/components/ProfilePhotosGrid';

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

describe('FilteredPostsLayout Photos filter', () => {
  it('renders a photo grid instead of full post cards', () => {
    const posts = [
      makePost({ id: 'img1', media_url: 'https://cdn.test/1.jpg', media_type: 'image' }),
      makePost({ id: 'vid1', media_url: 'https://cdn.test/v.mp4', media_type: 'video' }),
      makePost({ id: 'text1' }),
    ];

    render(<FilteredPostsLayout posts={posts} loading={false} isOwnProfile />);
    expect(screen.getAllByTestId('post-card')).toHaveLength(3);

    fireEvent.click(screen.getAllByRole('button', { name: 'Photos' })[0]);

    expect(screen.getByTestId('profile-photos-grid')).toBeTruthy();
    // No full post cards in the Photos section.
    expect(screen.queryByTestId('post-card')).toBeNull();
  });

  it('shows an empty state when the profile has no photos', () => {
    const posts = [makePost({ id: 'text1' }), makePost({ id: 'reel1', type: 'reel' })];

    render(<FilteredPostsLayout posts={posts} loading={false} isOwnProfile />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Photos' })[0]);

    expect(screen.getByTestId('profile-photos-empty')).toBeTruthy();
    expect(screen.queryByTestId('profile-photos-grid')).toBeNull();
  });
});

describe('ProfilePhotosGrid', () => {
  it('opens a single photo in the viewer and closes it', () => {
    render(
      <ProfilePhotosGrid
        posts={[
          makePost({ id: 'img1', media_url: 'https://cdn.test/1.jpg', media_type: 'image' }),
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open photo' }));
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close photo viewer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps a multi-image post as one album and lets the visitor page through it', () => {
    render(
      <ProfilePhotosGrid
        posts={[
          makePost({
            id: 'album1',
            post_media: [
              { file_url: 'https://cdn.test/a.jpg', file_type: 'image' },
              { file_url: 'https://cdn.test/b.jpg', file_type: 'image' },
            ],
          }),
        ]}
      />
    );

    // One tile, badged with the number of photos — not two separate tiles.
    const tiles = screen.getByTestId('profile-photos-grid').querySelectorAll('button');
    expect(tiles).toHaveLength(1);
    expect(screen.getByText('2')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Open album with 2 photos' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('1 / 2')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(screen.getByText('2 / 2')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('ProfilePhotosGrid cover photo', () => {
  it('Test 1/6: shows the current cover as a tile (no posts needed) and opens the viewer', () => {
    render(<ProfilePhotosGrid posts={[]} coverPic="https://cdn.test/cover.jpg" />);

    const grid = screen.getByTestId('profile-photos-grid');
    expect(grid.querySelectorAll('button')).toHaveLength(1);
    const cover = grid.querySelector('img') as HTMLImageElement;
    expect(cover.getAttribute('src')).toBe('https://cdn.test/cover.jpg');

    fireEvent.click(screen.getByRole('button', { name: 'Open photo' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('Test 2: a profile without a cover photo has no cover tile', () => {
    render(<ProfilePhotosGrid posts={[]} coverPic={null} />);
    expect(screen.getByTestId('profile-photos-empty')).toBeTruthy();
  });

  it('Test 4: a cover-photo post does not produce a duplicate cover tile', () => {
    render(
      <ProfilePhotosGrid
        posts={[
          makePost({
            id: 'cover-post',
            type: 'cover_photo_update',
            media_url: 'https://cdn.test/cover.jpg',
          }),
        ]}
        coverPic="https://cdn.test/cover.jpg"
      />
    );

    expect(screen.getByTestId('profile-photos-grid').querySelectorAll('button')).toHaveLength(1);
  });

  it('Test 5: the Photos filter in FilteredPostsLayout includes the cover photo', () => {
    render(
      <FilteredPostsLayout
        posts={[makePost({ id: 'text1' })]}
        loading={false}
        isOwnProfile
        coverPic="https://cdn.test/cover.jpg"
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Photos' })[0]);
    expect(screen.getByTestId('profile-photos-grid').querySelectorAll('button')).toHaveLength(1);
  });
});
