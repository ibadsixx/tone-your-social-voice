// End-to-end flow for the automatic cover-photo-change post (pro.md):
//
//   cover upload  ->  storage upload  ->  profile.cover_pic update
//                 ->  automatic post insert  ->  posts domain
//
// These tests drive the real CoverPhotoEditor handler against a mocked gateway
// (global fetch) and assert the database write actually happens — and only
// happens when BOTH the storage upload and the profile update succeed.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'alice-uuid' }, loading: false }),
}));

const toastSpy = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastSpy }),
}));

import CoverPhotoEditor from '@/components/cover/CoverPhotoEditor';
import { POST_CREATED_EVENT } from '@/hooks/useHomeFeed';

const BASE = 'http://mock.test';
const POSTS_URL = `${BASE}/api/posts`;
const STORAGE_PREFIX = `${BASE}/api/storage/covers/`;
const PROFILE_URL = `${BASE}/api/v1/profiles/alice-uuid`;
const COVER_URL = 'https://cdn.test/covers/alice-1712345678.jpg';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  } as Response;
}

interface RouteStatus {
  storageUpload?: number;
  profileUpdate?: number;
}

let statuses: RouteStatus;
let fetchMock: ReturnType<typeof vi.fn>;
let postBodies: Array<Record<string, unknown>>;

function installFetch(status: RouteStatus = {}) {
  statuses = status;
  postBodies = [];
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || 'GET';

    if (url.startsWith(STORAGE_PREFIX) && method === 'POST') {
      const s = statuses.storageUpload ?? 200;
      return jsonResponse(s, s < 400 ? { url: COVER_URL, path: 'alice/c.jpg' } : { message: 'upload failed' });
    }
    if (url === PROFILE_URL && method === 'PUT') {
      const s = statuses.profileUpdate ?? 200;
      return jsonResponse(s, s < 400 ? {} : { message: 'update failed' });
    }
    if (url === POSTS_URL && method === 'POST') {
      postBodies.push(JSON.parse(String(init?.body)));
      return jsonResponse(201, { id: `post-${postBodies.length}` });
    }
    throw new Error(`no mock route for ${method} ${url}`);
  });
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock;
}

function stubImageAndCanvas() {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = 100;
    height = 50;
    set src(_value: string) {
      Promise.resolve().then(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', FakeImage);
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:fake';
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
    cb(new Blob(['cover'], { type: 'image/jpeg' }));
  } as unknown as typeof HTMLCanvasElement.prototype.toBlob;
}

function uploadCover(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['cover'], 'cover.jpg', { type: 'image/jpeg' });
  fireEvent.change(input, { target: { files: [file] } });
}

const profile = { id: 'alice-uuid', cover_pic: null as string | null, cover_position_y: 0 };

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('tone-auth-token', JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh' }));
  toastSpy.mockClear();
  installFetch();
  stubImageAndCanvas();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CoverPhotoEditor automatic cover-photo-change post', () => {
  it('Test 1/2: a successful cover upload inserts exactly one cover_photo_update post with the new cover', async () => {
    const events: Event[] = [];
    const onEvent = (e: Event) => events.push(e);
    window.addEventListener(POST_CREATED_EVENT, onEvent);

    const { container } = render(
      <CoverPhotoEditor profile={profile} isOwnProfile onProfileUpdate={vi.fn()} />
    );
    uploadCover(container);

    await waitFor(() => expect(postBodies).toHaveLength(1));
    window.removeEventListener(POST_CREATED_EVENT, onEvent);

    expect(postBodies[0]).toEqual({
      user_id: 'alice-uuid',
      content: '',
      media_url: COVER_URL,
      type: 'cover_photo_update',
    });
    expect(String(postBodies[0].content)).not.toContain('changed their cover photo');
    // Feeds are notified so the new post shows up without a manual reload.
    expect(events.length).toBe(1);
  });

  it('Test 3a: a failed storage upload creates NO post', async () => {
    installFetch({ storageUpload: 500 });
    const { container } = render(
      <CoverPhotoEditor profile={profile} isOwnProfile onProfileUpdate={vi.fn()} />
    );
    uploadCover(container);

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    expect(postBodies).toHaveLength(0);
  });

  it('Test 3b: a failed profile update creates NO post', async () => {
    installFetch({ profileUpdate: 500 });
    const { container } = render(
      <CoverPhotoEditor profile={profile} isOwnProfile onProfileUpdate={vi.fn()} />
    );
    uploadCover(container);

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    expect(postBodies).toHaveLength(0);
  });

  it('Test 4: two successful updates create exactly one post each (no duplicates)', async () => {
    const { container } = render(
      <CoverPhotoEditor profile={profile} isOwnProfile onProfileUpdate={vi.fn()} />
    );
    uploadCover(container);
    await waitFor(() => expect(postBodies).toHaveLength(1));

    uploadCover(container);
    await waitFor(() => expect(postBodies).toHaveLength(2));

    expect(postBodies.every((b) => b.type === 'cover_photo_update')).toBe(true);
    // Exactly one POST /api/posts per successful update — never more.
    const postCalls = fetchMock.mock.calls.filter(
      ([url, init]) => String(url) === POSTS_URL && init?.method === 'POST'
    );
    expect(postCalls).toHaveLength(2);
  });
});
