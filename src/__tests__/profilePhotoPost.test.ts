// Profile-picture / cover-photo posts (photo upload flow).
//
// Data-integrity rule: the phrase "changed their profile picture" is rendered
// by Post.tsx in the POST HEADER next to the user's name. It must never be
// stored as part of the caption — the stored `content` is ONLY the user's own
// caption text, and the stored `type` is what triggers the header text.
import { describe, it, expect } from 'vitest';

import { buildProfileUpdatePost } from '@/hooks/usePhotoUpload';

const PHRASE = 'changed their profile picture';

describe('buildProfileUpdatePost (photo update post payload)', () => {
  it('new profile picture without caption stores an empty content and the update type', () => {
    expect(buildProfileUpdatePost('profile')).toEqual({
      content: '',
      type: 'profile_picture_update',
    });
  });

  it('new profile picture with caption stores ONLY the user caption', () => {
    const payload = buildProfileUpdatePost('profile', 'New profile photo!');
    expect(payload.type).toBe('profile_picture_update');
    expect(payload.content).toBe('New profile photo!');
  });

  it('replacing a profile picture behaves identically (same header structure)', () => {
    const payload = buildProfileUpdatePost('profile', 'Fresh look for 2026');
    expect(payload.type).toBe('profile_picture_update');
    expect(payload.content).toBe('Fresh look for 2026');
  });

  it('cover photo updates map to cover_photo_update', () => {
    expect(buildProfileUpdatePost('cover')).toEqual({
      content: '',
      type: 'cover_photo_update',
    });
    expect(buildProfileUpdatePost('cover', 'New banner')).toEqual({
      content: 'New banner',
      type: 'cover_photo_update',
    });
  });

  it('never stores the header phrase inside the caption', () => {
    for (const type of ['profile', 'cover'] as const) {
      for (const caption of [undefined, '', 'New photo!', '  New photo!  ']) {
        const payload = buildProfileUpdatePost(type, caption);
        expect(payload.content).not.toContain(PHRASE);
        expect(payload.content).not.toContain('updated their cover photo');
      }
    }
  });

  it('trims surrounding whitespace from the caption', () => {
    expect(buildProfileUpdatePost('profile', '  spaced caption  ').content).toBe('spaced caption');
  });
});