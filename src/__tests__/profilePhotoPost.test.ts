// Profile-picture / cover-photo posts (photo upload flow).
//
// Data-integrity rule: the phrase "changed their profile picture" is rendered
// by Post.tsx in the POST HEADER next to the user's name. It must never be
// stored as part of the caption — the stored `content` is ONLY the user's own
// caption text, and the stored `type` is what triggers the header text.
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { buildProfileUpdatePost, createPhotoUpdatePost } from '@/hooks/usePhotoUpload';

const PHRASE = 'changed their profile picture';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  } as Response;
}

const POSTS_URL = 'http://mock.test/api/posts';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('tone-auth-token', JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh' }));
});

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

describe('createPhotoUpdatePost (cover photo changes)', () => {
  it('posts cover_photo_update with the new cover URL and NO caption phrase', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method || 'GET';
      if (String(input) === POSTS_URL && method === 'POST') {
        return jsonResponse(201, { id: 'post-cover-1' });
      }
      throw new Error(`no mock route for ${method} ${input}`);
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock;

    const coverUrl = 'http://mock.test/api/media/cover.jpeg';
    const postId = await createPhotoUpdatePost('alice-uuid', coverUrl, 'cover');
    expect(postId).toBe('post-cover-1');

    const insertCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(insertCall).toBeTruthy();
    const body = JSON.parse(insertCall![1].body as string);
    expect(body).toEqual({
      user_id: 'alice-uuid',
      content: '',
      media_url: coverUrl,
      type: 'cover_photo_update',
    });
    expect(body.content).not.toContain('changed their cover photo');
  });

  it('stores ONLY the user caption when one is provided (still cover_photo_update)', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === POSTS_URL && init?.method === 'POST') {
        return jsonResponse(201, { id: 'post-cover-2' });
      }
      throw new Error(`no mock route for ${init?.method} ${input}`);
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock;

    await createPhotoUpdatePost('alice-uuid', 'http://mock.test/api/media/cover2.jpeg', 'cover', 'My new cover photo!');

    const insertCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    const body = JSON.parse(insertCall![1].body as string);
    expect(body.type).toBe('cover_photo_update');
    expect(body.content).toBe('My new cover photo!');
    expect(body.content).not.toContain('changed their cover photo');
  });

  it('cover post media references the newly uploaded cover URL', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === POSTS_URL && init?.method === 'POST') {
        return jsonResponse(201, { id: 'post-cover-3' });
      }
      throw new Error(`no mock route for ${init?.method} ${input}`);
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock;

    const coverUrl = 'https://cdn.example.com/covers/alice/1712345678.jpg';
    await createPhotoUpdatePost('alice-uuid', coverUrl, 'cover');

    const insertCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    const body = JSON.parse(insertCall![1].body as string);
    expect(body.media_url).toBe(coverUrl);
  });

  it('throws when the gateway rejects the insert (post must never silently disappear)', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === POSTS_URL && init?.method === 'POST') {
        return jsonResponse(500, { message: 'No writable project for domain: posts' });
      }
      throw new Error(`no mock route for ${init?.method} ${input}`);
    });
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock;

    await expect(createPhotoUpdatePost('alice-uuid', 'http://mock.test/api/media/cover.jpeg', 'cover')).rejects.toThrow();
  });
});