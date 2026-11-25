// Profile-picture / cover-photo posts (photo upload flow).
//
// Data-integrity rule: the phrase "changed their profile picture" is rendered
// by Post.tsx in the POST HEADER next to the user's name. It must never be
// stored as part of the caption — the stored `content` is ONLY the user's own
// caption text, and the stored `type` is what triggers the header text.
import { afterEach, describe, expect, beforeEach, vi, it } from 'vitest';
import { clearCurrentAccessToken, setCurrentAccessToken } from '@/lib/supabase/sessionTokenProvider';
import {
  infraRegistryResponse,
  isInfraRegistryRequest,
  jsonResponse,
  MOCK_ORIGIN,
  postgrestTable,
  prefersObjectResponse,
  shapePostgrestRows,
} from './infraFixtures';

import { buildProfileUpdatePost, createPhotoUpdatePost } from '@/hooks/usePhotoUpload';

const PHRASE = 'changed their profile picture';
const POSTS_URL = `${MOCK_ORIGIN}/rest/v1/posts`;

function installFetch(status = 201, body: unknown = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (isInfraRegistryRequest(input)) return infraRegistryResponse();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method || 'GET';
    if (postgrestTable(url) === 'posts' && method === 'POST') {
      return jsonResponse(
        status,
        status < 400
          ? shapePostgrestRows([{ id: 'post-cover-1', ...(body as object) }], prefersObjectResponse(init))
          : body,
      );
    }
    throw new Error(`no mock route for ${method} ${url}`);
  });
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock;
  return fetchMock;
}

beforeEach(() => {
  setCurrentAccessToken('test-token');
});

afterEach(() => {
  clearCurrentAccessToken();
  vi.restoreAllMocks();
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
    const fetchMock = installFetch();

    const coverUrl = 'https://cdn.example.com/covers/alice/1712345678.jpg';
    const postId = await createPhotoUpdatePost('alice-uuid', coverUrl, 'cover');
    expect(postId).toBe('post-cover-1');

    const insertCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(insertCall).toBeTruthy();
    const url = String(insertCall![0]);
    expect(new URL(url).pathname).toBe(new URL(POSTS_URL).pathname);
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
    const fetchMock = installFetch();

    await createPhotoUpdatePost('alice-uuid', 'https://cdn.example.com/covers/alice/2.jpg', 'cover', 'My new cover photo!');

    const insertCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    const body = JSON.parse(insertCall![1].body as string);
    expect(body.type).toBe('cover_photo_update');
    expect(body.content).toBe('My new cover photo!');
    expect(body.content).not.toContain('changed their cover photo');
  });

  it('cover post media references the newly uploaded cover URL', async () => {
    const fetchMock = installFetch();

    const coverUrl = 'https://cdn.example.com/covers/alice/1712345678.jpg';
    await createPhotoUpdatePost('alice-uuid', coverUrl, 'cover');

    const insertCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    const body = JSON.parse(insertCall![1].body as string);
    expect(body.media_url).toBe(coverUrl);
  });

  it('throws when the dataClient rejects the insert (post must never silently disappear)', async () => {
    installFetch(500, { message: 'No writable project for domain: posts' });

    await expect(createPhotoUpdatePost('alice-uuid', 'https://cdn.example.com/covers/alice/x.jpg', 'cover')).rejects.toThrow();
  });
});
