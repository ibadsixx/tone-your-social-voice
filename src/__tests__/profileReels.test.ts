import { describe, it, expect } from 'vitest';
import { extractProfileReels } from '@/lib/profileReels';
import type { ReelSourcePost } from '@/lib/profileReels';

function post(overrides: Partial<ReelSourcePost> & { id: string }): ReelSourcePost {
  return { type: 'normal_post', created_at: '2026-01-01T00:00:00.000Z', ...overrides };
}

describe('extractProfileReels', () => {
  it('Test 1: keeps posts whose stored type is reel', () => {
    const reels = extractProfileReels([
      post({
        id: 'r1',
        type: 'reel',
        media_url: 'https://cdn.test/r1.mp4',
        media_type: 'video',
        thumbnail: 'https://cdn.test/r1.jpg',
        duration: 12,
      }),
    ]);

    expect(reels).toEqual([
      {
        id: 'r1',
        mediaUrl: 'https://cdn.test/r1.mp4',
        mediaType: 'video',
        thumbnail: 'https://cdn.test/r1.jpg',
        duration: 12,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  it('Test 2: a normal video post is NOT treated as a reel', () => {
    const reels = extractProfileReels([
      post({ id: 'v1', type: 'normal_post', media_url: 'https://cdn.test/v.mp4', media_type: 'video' }),
      post({ id: 'v2', type: 'normal_post', media_url: 'https://cdn.test/clip_reel.mp4', media_type: 'video' }),
    ]);
    expect(reels).toEqual([]);
  });

  it('Test 3: photos and text-only posts are excluded', () => {
    const reels = extractProfileReels([
      post({ id: 'img', media_url: 'https://cdn.test/a.jpg', media_type: 'image' }),
      post({ id: 'text' }),
    ]);
    expect(reels).toEqual([]);
  });

  it('Test 4: a reel without media is skipped', () => {
    const reels = extractProfileReels([post({ id: 'r1', type: 'reel', media_url: null })]);
    expect(reels).toEqual([]);
  });

  it('Test 5: reels are ordered newest first', () => {
    const reels = extractProfileReels([
      post({ id: 'old', type: 'reel', media_url: 'https://c/o.mp4', created_at: '2025-01-01T00:00:00.000Z' }),
      post({ id: 'new', type: 'reel', media_url: 'https://c/n.mp4', created_at: '2026-05-01T00:00:00.000Z' }),
      post({ id: 'mid', type: 'reel', media_url: 'https://c/m.mp4', created_at: '2025-09-01T00:00:00.000Z' }),
    ]);
    expect(reels.map((r) => r.id)).toEqual(['new', 'mid', 'old']);
  });

  it('Test 6: only reels survive a mixed profile', () => {
    const reels = extractProfileReels([
      post({ id: 'text' }),
      post({ id: 'photo', media_url: 'https://c/p.jpg', media_type: 'image' }),
      post({ id: 'video', media_url: 'https://c/v.mp4', media_type: 'video' }),
      post({ id: 'reel1', type: 'reel', media_url: 'https://c/r1.mp4', created_at: '2026-02-02T00:00:00.000Z' }),
      post({ id: 'reel2', type: 'reel', media_url: 'https://c/r2.mp4', created_at: '2026-03-03T00:00:00.000Z' }),
    ]);
    expect(reels.map((r) => r.id)).toEqual(['reel2', 'reel1']);
  });

  it('Test 7: 16:9 and long reels are still included (aspect/length do not matter)', () => {
    const reels = extractProfileReels([
      post({
        id: 'wide',
        type: 'reel',
        media_url: 'https://cdn.test/wide.mp4',
        media_type: 'video',
        aspect_ratio: '16:9',
        duration: 45,
      }),
      post({
        id: 'long',
        type: 'reel',
        media_url: 'https://cdn.test/long.mp4',
        media_type: 'video',
        aspect_ratio: '9:16',
        duration: 600,
      }),
    ]);
    expect(reels.map((r) => r.id)).toEqual(['wide', 'long']);
  });

  it('handles empty and null input', () => {
    expect(extractProfileReels([])).toEqual([]);
    expect(extractProfileReels(null)).toEqual([]);
    expect(extractProfileReels(undefined)).toEqual([]);
  });
});
