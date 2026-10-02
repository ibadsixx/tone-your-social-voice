// Profile-picture and cover-photo upload, driven through the REAL hook against
// a mocked global fetch — so the real gateway client, the real storage shim and
// the real `postsApi.createPost` all run. Only the network is faked.
//
// The behaviour these lock down is *failure attribution*. The old flow put the
// storage upload, the profile-row write and the announcement-post insert in one
// `try`, so any of the three failing produced the same "Failed to upload profile
// picture" / "Failed to upload cover photo" toast — including the case where the
// photo had already uploaded and the profile row had already been written, and
// the only thing that failed was the feed announcement. That told people their
// picture had not saved when it had, and hid the actual cause (do.md §7, §12).
//
// Each test therefore checks three things independently: what reached the
// network, what ended up on the profile row, and what the user was told.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const toastSpy = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastSpy }) }));

import {
  usePhotoUpload,
  PhotoUpdateError,
  MAX_PHOTO_BYTES,
  photoErrorMessage,
  validatePhotoFile,
} from '@/hooks/usePhotoUpload';

const BASE = 'http://mock.test';
const USER = 'alice-uuid';
const SIGN_URL = `${BASE}/api/storage/sign`;
const STORAGE_PREFIX = `${BASE}/api/storage/`;
const PROFILE_URL = `${BASE}/api/v1/profiles/${USER}`;
const POSTS_URL = `${BASE}/api/posts`;
const CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/testcloud/auto/upload';

/** Cloudinary's delivery URL for a given public_id, as the real API returns. */
const cdnUrl = (publicId: string) =>
  `https://res.cloudinary.com/testcloud/image/upload/v1/tone/${publicId}.png`;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function textResponse(status: number, body: string): Response {
  return {
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'text/plain' }),
    // Vercel answers its own rejections with text, which is exactly why the
    // old `res.json()` path threw and lost the reason.
    json: async () => {
      throw new SyntaxError('Unexpected token');
    },
    text: async () => body,
  } as Response;
}

interface RouteStatus {
  /** `POST /api/storage/sign` — the gateway's signing step. */
  sign?: number;
  /** The direct POST to api.cloudinary.com. */
  cloudinary?: number;
  /** `POST /api/storage/:bucket/*` — the gateway's proxied fallback. */
  storage?: number;
  profile?: number;
  posts?: number;
  /** Raw body for a rejecting route, to emulate a platform-level failure. */
  storageBody?: unknown;
  /** When set, the storage route answers with this plain text (not JSON). */
  storageRaw?: string;
}

let statuses: RouteStatus;
let fetchMock: ReturnType<typeof vi.fn>;
let postBodies: Array<Record<string, unknown>>;
let profileWrites: Array<Record<string, unknown>>;
/** The `public_id` of every upload, whichever route carried it. */
let uploadPaths: string[];

/** Install a fetch that mimics the gateway: sign -> cloudinary, or proxy -> gateway. */
function installFetch(next: RouteStatus = {}) {
  statuses = next;
  postBodies = [];
  profileWrites = [];
  uploadPaths = [];

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || 'GET';
    const body = init?.body as FormData | undefined;

    if (url === SIGN_URL && method === 'POST') {
      const s = statuses.sign ?? 200;
      if (s >= 400) return jsonResponse(s, { error: 'no signing today' });
      // The shim asks to sign the exact path it will upload to.
      const asked = JSON.parse(String(init?.body || '{}')).path as string;
      return jsonResponse(s, {
        uploadUrl: CLOUDINARY_URL,
        cloudName: 'testcloud',
        apiKey: 'key-123',
        timestamp: '1700000000',
        folder: 'tone',
        // The shim posts the caller's path back as `public_id`, so echoing it
        // here makes each upload's URL genuinely distinct, as in production.
        publicId: asked,
        signature: 'sig-abc',
      });
    }

    if (url === CLOUDINARY_URL && method === 'POST') {
      const publicId = String(body?.get('public_id') ?? 'unknown');
      uploadPaths.push(publicId);
      const s = statuses.cloudinary ?? 200;
      if (s >= 400) {
        return jsonResponse(s, {
          error: { message: 'Cloudinary rejected the file' },
        });
      }
      return jsonResponse(200, {
        secure_url: cdnUrl(publicId),
      });
    }

    if (url.startsWith(STORAGE_PREFIX) && method === 'POST') {
      const path = url.slice(STORAGE_PREFIX.length);
      uploadPaths.push(path);
      const s = statuses.storage ?? 200;
      if (statuses.storageRaw !== undefined) {
        return textResponse(s, statuses.storageRaw);
      }
      if (s >= 400) {
        return statuses.storageBody
          ? jsonResponse(s, statuses.storageBody)
          : jsonResponse(s, { message: 'Cloudinary rejected the file' });
      }
      return jsonResponse(s, { url: cdnUrl(path), path });
    }

    if (url === PROFILE_URL && method === 'PUT') {
      const s = statuses.profile ?? 200;
      if (s >= 400) return jsonResponse(s, { message: 'profile write rejected' });
      profileWrites.push(JSON.parse(String(init?.body)));
      return jsonResponse(200, { id: USER });
    }

    if (url === POSTS_URL && method === 'POST') {
      const s = statuses.posts ?? 201;
      if (s >= 400) return jsonResponse(s, { message: 'post insert rejected' });
      postBodies.push(JSON.parse(String(init?.body)));
      return jsonResponse(s, { id: `post-${postBodies.length}` });
    }

    throw new Error(`no mock route for ${method} ${url}`);
  });

  (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock;
}

/**
 * Cloudinary rejecting the file does not fail the upload on its own — the shim
 * falls back to the gateway's proxied path, which runs the same provider and so
 * rejects it too. A genuine upload failure needs both routes to fail.
 */
const TOTAL_UPLOAD_FAILURE = { cloudinary: 500, storage: 500 };

const pngFile = (name = 'pic.png', bytes = 64) =>
  new File([new Uint8Array(bytes)], name, { type: 'image/png' });

const run = async (
  file: File,
  type: 'profile' | 'cover',
  customText?: string
): Promise<{ result?: string; error?: unknown }> => {
  const { result } = renderHook(() => usePhotoUpload());
  let value: string | undefined;
  let thrown: unknown;
  await act(async () => {
    try {
      value = await result.current.uploadPhoto(file, type, USER, customText);
    } catch (e) {
      thrown = e;
    }
  });
  return thrown ? { error: thrown } : { result: value };
};

/** Every toast description shown, flattened, for asserting on user-facing text. */
const toastText = () =>
  toastSpy.mock.calls
    .map(([t]: any[]) => `${t?.title ?? ''} | ${t?.description ?? ''}`)
    .join(' || ');

/** Uploads that reached Cloudinary OR the gateway proxy, whichever carried it. */
const uploadCalls = () => uploadPaths.length;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    'tone-auth-token',
    JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh' })
  );
  toastSpy.mockClear();
  installFetch();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('profile picture: add and replace both work end to end', () => {
  it('uploads, persists the returned media URL, and announces it', async () => {
    const { result } = await run(pngFile(), 'profile');

    expect(result).toMatch(/^https:\/\//);
    expect(uploadCalls()).toBe(1);
    expect(profileWrites).toHaveLength(1);
    expect(profileWrites[0].profile_pic).toBe(result);
    expect(postBodies).toHaveLength(1);
    expect(postBodies[0].type).toBe('profile_picture_update');
    expect(toastText()).toContain('Profile picture updated and posted successfully');
  });

  it('persists a real media URL, never a local blob/object URL', async () => {
    // do.md §13: storing only the local blob URL passes every client-side check
    // and then shows nothing after a refresh.
    const { result } = await run(pngFile(), 'profile');

    expect(result).not.toMatch(/^blob:/);
    expect(result).not.toMatch(/^data:/);
    expect(String(profileWrites[0].profile_pic)).toContain('cloudinary.com');
  });

  it('replacing an existing picture writes only the new URL', async () => {
    await run(pngFile('first.png'), 'profile');
    await run(pngFile('second.png'), 'profile');

    expect(profileWrites).toHaveLength(2);
    // Each replacement stores its own freshly uploaded URL — never the previous
    // one, and never a second profile row.
    expect(profileWrites[1].profile_pic).not.toBe(profileWrites[0].profile_pic);
    const putUrls = fetchMock.mock.calls
      .filter(([u, i]) => String(u) === PROFILE_URL && i?.method === 'PUT')
      .map(([u]) => String(u));
    expect(putUrls).toEqual([PROFILE_URL, PROFILE_URL]);
  });

  it('keeps the previous picture when the new upload fails', async () => {
    // do.md §9: the old image must survive a failed replacement.
    installFetch(TOTAL_UPLOAD_FAILURE);

    const { error } = await run(pngFile(), 'profile');

    expect(error).toBeTruthy();
    expect(profileWrites).toHaveLength(0);
    expect(postBodies).toHaveLength(0);
  });

  it('uploads before it writes the profile row', async () => {
    // Ordering is the mechanism that protects the old image: the row is only
    // touched once there is a confirmed replacement.
    await run(pngFile(), 'profile');

    const order = fetchMock.mock.calls.map(([url, init]) => {
      const u = String(url);
      if (u.startsWith(STORAGE_PREFIX) || u.startsWith('https://api.cloudinary.com')) return 'upload';
      if (u === PROFILE_URL) return 'profile';
      if (u === POSTS_URL) return 'post';
      return 'other';
    });

    expect(order.indexOf('upload')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('profile')).toBeGreaterThan(order.indexOf('upload'));
    expect(order.indexOf('post')).toBeGreaterThan(order.indexOf('profile'));
  });
});

describe('cover photo: add and replace both work end to end', () => {
  it('uploads, persists cover_pic, resets the crop offset, and announces it', async () => {
    const { result } = await run(pngFile('cover.png'), 'cover');

    expect(result).toMatch(/^https:\/\//);
    expect(profileWrites[0].cover_pic).toBe(result);
    expect(profileWrites[0].cover_position_y).toBe(0);
    expect(postBodies).toHaveLength(1);
    expect(postBodies[0].type).toBe('cover_photo_update');
    expect(toastText()).toContain('Cover photo updated and posted successfully');
  });

  it('stores a profile picture and a cover photo under different media paths', async () => {
    // The Cloudinary provider ignores the bucket, so the path is the only
    // namespace. If both shapes collided, a cover upload landing in the same
    // millisecond as a profile upload would silently overwrite the avatar.
    await run(pngFile('a.png'), 'profile');
    await run(pngFile('b.png'), 'cover');

    expect(uploadPaths).toHaveLength(2);
    expect(uploadPaths[0]).toContain('/avatars/');
    expect(uploadPaths[1]).toContain('/covers/');
    expect(uploadPaths[0]).not.toBe(uploadPaths[1]);
  });

  it('keeps the previous cover when the new upload fails', async () => {
    installFetch(TOTAL_UPLOAD_FAILURE);
    const { error } = await run(pngFile(), 'cover');

    expect(error).toBeTruthy();
    expect(profileWrites).toHaveLength(0);
  });
});

describe('a failed announcement post is not reported as a failed upload', () => {
  // This is the regression the old single-`try` flow caused: the picture was in
  // Cloudinary and the profile row was already written, yet the user was told
  // "Failed to upload profile picture" — and callers that `catch` then skipped
  // their own post-upload refresh.

  it('still reports the picture as saved, and resolves', async () => {
    installFetch({ posts: 500 });

    const { result, error } = await run(pngFile(), 'profile');

    expect(error).toBeUndefined();
    expect(result).toMatch(/^https:\/\//);
    expect(profileWrites).toHaveLength(1);
    expect(toastText()).toContain('Profile picture updated');
    expect(toastText()).not.toContain('Failed to upload');
    expect(toastText()).toMatch(/automatic post could not be created/);
  });

  it('says so for a cover photo too', async () => {
    installFetch({ posts: 500 });
    const { error } = await run(pngFile(), 'cover');

    expect(error).toBeUndefined();
    expect(toastText()).toContain('Cover photo updated');
    expect(toastText()).not.toContain('Failed to upload cover photo');
  });

  it('logs the post failure with its cause rather than dropping it', async () => {
    installFetch({ posts: 500 });
    await run(pngFile(), 'profile');

    const logged = (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => String(c[0]))
      .join(' ');
    expect(logged).toMatch(/announcement post failed/);
  });

  it('creates no post at all when the upload itself failed', async () => {
    installFetch(TOTAL_UPLOAD_FAILURE);
    await run(pngFile(), 'profile');

    expect(postBodies).toHaveLength(0);
  });
});

describe('a failed profile write is not reported as success', () => {
  // do.md §12: the image is in storage but the row is not written, so this is a
  // genuine failure and must not claim otherwise.

  it('surfaces an error and creates no announcement post', async () => {
    installFetch({ profile: 500 });

    const { result, error } = await run(pngFile(), 'profile');

    expect(result).toBeUndefined();
    expect(error).toBeInstanceOf(PhotoUpdateError);
    expect((error as PhotoUpdateError).stage).toBe('profile');
    expect(postBodies).toHaveLength(0);
    expect(toastText()).toContain('Error');
    expect(toastText()).not.toContain('updated and posted successfully');
  });

  it('names the stage so the failure is diagnosable', async () => {
    installFetch({ profile: 500 });
    const { error } = await run(pngFile(), 'profile');

    expect((error as PhotoUpdateError).stage).toBe('profile');
    expect((error as PhotoUpdateError).reason).toBeTruthy();
    expect(String((error as PhotoUpdateError).message)).toMatch(/saving it to your profile failed/i);
  });
});

describe('bad input is rejected before anything is uploaded', () => {
  it('refuses a non-image file and never touches the network', async () => {
    const doc = new File([new Uint8Array(10)], 'notes.pdf', { type: 'application/pdf' });

    const { error } = await run(doc, 'profile');

    expect(error).toBeInstanceOf(PhotoUpdateError);
    expect((error as PhotoUpdateError).stage).toBe('validation');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(toastText()).toMatch(/not an image/i);
  });

  it('refuses an oversized image and never touches the network', async () => {
    const huge = new File([new Uint8Array(MAX_PHOTO_BYTES + 1)], 'huge.png', {
      type: 'image/png',
    });

    const { error } = await run(huge, 'cover');

    expect((error as PhotoUpdateError).stage).toBe('validation');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(toastText()).toMatch(/MB/);
  });

  it('accepts an image with no MIME type but a real extension', async () => {
    // Some pickers hand over `type: ''`; rejecting those would be a regression.
    const noType = new File([new Uint8Array(32)], 'shot.jpg', { type: '' });

    const { error } = await run(noType, 'profile');

    expect(error).toBeUndefined();
    expect(profileWrites).toHaveLength(1);
  });

  it('validatePhotoFile is usable on its own, with no hook', () => {
    expect(() => validatePhotoFile(pngFile(), 'profile picture')).not.toThrow();
    expect(() => validatePhotoFile(new File(['x'], 'a.txt', { type: 'text/plain' }), 'cover photo')).toThrow(
      /not an image/i
    );
  });
});

describe('gateway and auth failures are surfaced, not swallowed', () => {
  it('reports a storage rejection with the gateway message attached', async () => {
    installFetch({ ...TOTAL_UPLOAD_FAILURE, storageBody: { message: 'Cloudinary rejected the file' } });

    const { error } = await run(pngFile(), 'profile');

    expect((error as PhotoUpdateError).stage).toBe('upload');
    expect((error as PhotoUpdateError).message).toMatch(/Cloudinary rejected the file/);
    expect(toastText()).toMatch(/Cloudinary rejected the file/);
  });

  it('translates the platform body-cap rejection into a sentence', async () => {
    // Reproduced live: a >4.5MB proxied upload answers with a bare
    // `FUNCTION_PAYLOAD_TOO_LARGE` and no JSON body.
    installFetch({
      cloudinary: 500,
      storage: 413,
      storageRaw: 'Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE\n\nlhr1::probe\n',
    });

    const { error } = await run(pngFile(), 'profile');

    expect((error as PhotoUpdateError).message).toMatch(/too large/i);
    expect(toastText()).toMatch(/too large/i);
  });

  it('falls back to the proxied upload when signing is unavailable', async () => {
    installFetch({ sign: 500 });

    const { result, error } = await run(pngFile(), 'profile');

    expect(error).toBeUndefined();
    expect(result).toMatch(/^https:\/\//);
    // Signed upload was never attempted; the gateway proxy was used instead.
    expect(uploadPaths).toHaveLength(1);
    expect(uploadPaths[0]).toContain('/avatars/');
  });

  it('reports an unauthenticated request rather than a generic failure', async () => {
    installFetch({ cloudinary: 401, storage: 401, storageBody: { message: 'Missing authorization header' } });

    const { error } = await run(pngFile(), 'profile');

    expect(error).toBeTruthy();
    expect(profileWrites).toHaveLength(0);
    expect(toastText()).toMatch(/Missing authorization header/);
  });

  it('always logs the underlying reason to the console', async () => {
    installFetch({ ...TOTAL_UPLOAD_FAILURE, storageBody: { message: 'boom' } });
    await run(pngFile(), 'profile');

    const logged = (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => String(c[0]))
      .join(' ');
    expect(logged).toMatch(/update failed/);
  });
});

describe('photoErrorMessage keeps actionable reasons, hides internal ones', () => {
  // The rule the two surfaces share. Under test, DEV is true — which is the
  // branch that must never hide anything, since that is where a developer is
  // trying to find out what broke.

  it('always shows a message the code itself wrote', () => {
    const validation = new PhotoUpdateError('validation', 'notes.pdf is a PDF file, not an image.');

    // Not gated on DEV: this is a sentence we authored and the user needs it.
    expect(photoErrorMessage(validation, 'profile picture')).toBe(
      'notes.pdf is a PDF file, not an image.'
    );
    expect(photoErrorMessage(validation, 'cover photo')).toBe(
      'notes.pdf is a PDF file, not an image.'
    );
  });

  it('shows an unexpected error in full under development', () => {
    expect(import.meta.env.DEV).toBe(true);
    expect(photoErrorMessage(new Error('ETIMEDOUT talking to res.cloudinary.com'), 'cover photo'))
      .toMatch(/ETIMEDOUT/);
  });

  it('never returns an empty string, for any input', () => {
    for (const input of [undefined, null, '', new Error(''), {}]) {
      expect(photoErrorMessage(input, 'profile picture').length).toBeGreaterThan(0);
    }
  });
});

describe('ownership', () => {
  it('only ever writes the caller\'s own profile row', async () => {
    await run(pngFile(), 'profile');

    // The filter is the row id, in the URL — there is no body-carried id to
    // tamper with, and no second row is addressed.
    const putUrls = fetchMock.mock.calls
      .filter(([u, i]) => String(u) === PROFILE_URL && i?.method === 'PUT')
      .map(([u]) => String(u));
    expect(putUrls).toHaveLength(1);
    expect(putUrls[0]).toBe(`${BASE}/api/v1/profiles/${USER}`);

    const postUsers = postBodies.map((b) => b.user_id);
    expect(postUsers).toEqual([USER]);
  });

  it('sends the bearer token with the storage upload', async () => {
    await run(pngFile(), 'profile');

    const storageCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).startsWith(STORAGE_PREFIX) && init?.method === 'POST'
    );
    const headers = (storageCall?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
  });
});
