import { describe, it, expect } from 'vitest';
import {
  extractPhotoAlbums,
  buildProfilePhotos,
  countPhotos,
  PROFILE_COVER_ALBUM_ID,
} from '@/lib/profilePhotos';
import type { PhotoSourcePost } from '@/lib/profilePhotos';

function post(overrides: Partial<PhotoSourcePost> & { id: string }): PhotoSourcePost {
  return { type: 'normal_post', created_at: '2026-01-01T00:00:00.000Z', ...overrides };
}

describe('extractPhotoAlbums', () => {
  it('Test 1: a single-image post becomes one album with one photo', () => {
    const albums = extractPhotoAlbums([
      post({ id: 'p1', media_url: 'https://cdn.test/a.jpg', media_type: 'image' }),
    ]);

    expect(albums).toEqual([
      {
        id: 'p1',
        createdAt: '2026-01-01T00:00:00.000Z',
        images: [
          {
            url: 'https://cdn.test/a.jpg',
            postId: 'p1',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    ]);
    expect(countPhotos(albums)).toBe(1);
  });

  it('Test 2: a post with multiple images stays grouped as one album', () => {
    const albums = extractPhotoAlbums([
      post({
        id: 'album-1',
        post_media: [
          { file_url: 'https://cdn.test/1.jpg', file_type: 'image' },
          { file_url: 'https://cdn.test/2.jpg', file_type: 'image' },
          { file_url: 'https://cdn.test/3.jpg', file_type: 'image' },
        ],
      }),
    ]);

    expect(albums).toHaveLength(1);
    expect(albums[0].id).toBe('album-1');
    expect(albums[0].images.map((i) => i.url)).toEqual([
      'https://cdn.test/1.jpg',
      'https://cdn.test/2.jpg',
      'https://cdn.test/3.jpg',
    ]);
    expect(countPhotos(albums)).toBe(3);
  });

  it('Test 3: text-only posts are excluded', () => {
    const albums = extractPhotoAlbums([post({ id: 'text' })]);
    expect(albums).toEqual([]);
  });

  it('Test 4: videos are excluded (by media_type and by URL)', () => {
    const albums = extractPhotoAlbums([
      post({ id: 'v1', media_url: 'https://cdn.test/clip.mp4', media_type: 'video' }),
      post({
        id: 'v2',
        media_url: 'https://res.cloudinary.com/demo/video/upload/v1/clip.mov',
        media_type: 'video',
      }),
      post({ id: 'v3', media_url: 'https://cdn.test/thing.webm' }),
    ]);
    expect(albums).toEqual([]);
  });

  it('Test 5: reels are excluded even when they carry image media', () => {
    const albums = extractPhotoAlbums([
      post({ id: 'r1', type: 'reel', media_url: 'https://cdn.test/poster.jpg', media_type: 'image' }),
    ]);
    expect(albums).toEqual([]);
  });

  it('Test 6: profile-picture, cover-photo and shared posts are excluded', () => {
    const albums = extractPhotoAlbums([
      post({ id: 'pp', type: 'profile_picture_update', media_url: 'https://cdn.test/me.jpg' }),
      post({ id: 'cp', type: 'cover_photo_update', media_url: 'https://cdn.test/cover.jpg' }),
      post({ id: 'sp', type: 'shared_post', media_url: 'https://cdn.test/other.jpg' }),
    ]);
    expect(albums).toEqual([]);
  });

  it('Test 7: albums are ordered newest first', () => {
    const albums = extractPhotoAlbums([
      post({ id: 'old', media_url: 'https://cdn.test/old.jpg', created_at: '2025-01-01T00:00:00.000Z' }),
      post({ id: 'new', media_url: 'https://cdn.test/new.jpg', created_at: '2026-05-01T00:00:00.000Z' }),
      post({ id: 'mid', media_url: 'https://cdn.test/mid.jpg', created_at: '2025-09-01T00:00:00.000Z' }),
    ]);
    expect(albums.map((a) => a.id)).toEqual(['new', 'mid', 'old']);
  });

  it('Test 8: video entries inside a multi-media group are dropped, images kept in order', () => {
    const albums = extractPhotoAlbums([
      post({
        id: 'mixed',
        post_media: [
          { file_url: 'https://cdn.test/a.jpg', file_type: 'image' },
          { file_url: 'https://cdn.test/b.mp4', file_type: 'video' },
          { file_url: 'https://cdn.test/c.jpg', file_type: 'image' },
        ],
      }),
    ]);

    expect(albums).toHaveLength(1);
    expect(albums[0].images.map((i) => i.url)).toEqual([
      'https://cdn.test/a.jpg',
      'https://cdn.test/c.jpg',
    ]);
  });

  it('Test 9: mixed photo/video/text profile returns only the photos', () => {
    const albums = extractPhotoAlbums([
      post({ id: 'text' }),
      post({ id: 'vid', media_url: 'https://cdn.test/v.mp4', media_type: 'video' }),
      post({ id: 'img1', media_url: 'https://cdn.test/1.jpg', media_type: 'image', created_at: '2026-02-02T00:00:00.000Z' }),
      post({ id: 'img2', media_url: 'https://cdn.test/2.jpg', media_type: 'image', created_at: '2026-03-03T00:00:00.000Z' }),
    ]);

    expect(albums.map((a) => a.id)).toEqual(['img2', 'img1']);
    expect(countPhotos(albums)).toBe(2);
  });

  it('handles empty and null input', () => {
    expect(extractPhotoAlbums([])).toEqual([]);
    expect(extractPhotoAlbums(null)).toEqual([]);
    expect(extractPhotoAlbums(undefined)).toEqual([]);
    expect(countPhotos([])).toBe(0);
  });
});

describe('buildProfilePhotos (cover photo)', () => {
  it('Test 1: adds the current cover photo as the first tile', () => {
    const albums = buildProfilePhotos(
      [post({ id: 'p1', media_url: 'https://cdn.test/post.jpg', media_type: 'image' })],
      'https://cdn.test/cover.jpg'
    );

    expect(albums).toHaveLength(2);
    expect(albums[0].id).toBe(PROFILE_COVER_ALBUM_ID);
    expect(albums[0].images).toEqual([
      { url: 'https://cdn.test/cover.jpg', postId: PROFILE_COVER_ALBUM_ID, createdAt: null },
    ]);
    expect(albums[1].id).toBe('p1');
    expect(countPhotos(albums)).toBe(2);
  });

  it('Test 2: shows the cover even when the profile has no photo posts', () => {
    const albums = buildProfilePhotos([post({ id: 'text' })], 'https://cdn.test/cover.jpg');

    expect(albums).toHaveLength(1);
    expect(albums[0].id).toBe(PROFILE_COVER_ALBUM_ID);
  });

  it('Test 3: a profile without a cover photo adds no tile', () => {
    const withNull = buildProfilePhotos([], null);
    const withEmpty = buildProfilePhotos([], '  ');
    expect(withNull).toEqual([]);
    expect(withEmpty).toEqual([]);
  });

  it('Test 4: a cover-photo post does not produce a duplicate cover tile', () => {
    const albums = buildProfilePhotos(
      [post({ id: 'cp', type: 'cover_photo_update', media_url: 'https://cdn.test/cover.jpg' })],
      'https://cdn.test/cover.jpg'
    );

    expect(albums).toHaveLength(1);
    expect(albums[0].id).toBe(PROFILE_COVER_ALBUM_ID);
  });

  it('Test 5: skips the standalone cover tile when a post already shows the same image', () => {
    const albums = buildProfilePhotos(
      [post({ id: 'p1', media_url: 'https://cdn.test/cover.jpg', media_type: 'image' })],
      'https://cdn.test/cover.jpg'
    );

    expect(albums).toHaveLength(1);
    expect(albums[0].id).toBe('p1');
  });
});
