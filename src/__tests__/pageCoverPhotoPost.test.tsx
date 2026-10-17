// End-to-end flow for the PAGE cover-photo-change post (do.md "Fix Page Cover
// Photo Updates: Create a Visible Page Post"):
//
//   cover upload -> storage upload -> pages.cover_image update
//                -> cover post insert -> page_posts link insert
//
// The page's Posts feed is read from the `page_posts` link table
// (api/pageContent.ts), so BOTH writes are required for the cover change to be
// visible on the page. These tests drive the real PageCoverPhotoEditor against
// a mocked gateway (global fetch) and assert both rows are written — that the
// flow is idempotent across retries, and that the cover update is NEVER lost
// when post creation fails.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'admin-uuid' }, loading: false }),
}));

const toastSpy = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastSpy }),
}));

import PageCoverPhotoEditor from '@/components/PageCoverPhotoEditor';
import { POST_CREATED_EVENT } from '@/hooks/useHomeFeed';

const BASE = 'http://mock.test';
const PAGE_ID = 'page-uuid';
const POSTS_URL = `${BASE}/api/posts`;
const PAGE_POSTS_URL = `${BASE}/api/page_posts`;
const PAGE_UPDATE_URL = `${BASE}/api/v1/pages/${PAGE_ID}`;
const STORAGE_SIGN_URL = `${BASE}/api/storage/sign`;
const STORAGE_PREFIX = `${BASE}/api/storage/covers/`;
const COVER_BASE = 'https://cdn.test/covers/';

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
  pageUpdate?: number;
  postCreate?: number;
  pagePostLink?: number;
}

let statuses: RouteStatus;
let fetchMock: ReturnType<typeof vi.fn>;
/** Body of every POST /api/posts, in call order. */
let postBodies: Array<Record<string, unknown>>;
/** Body of every POST /api/page_posts, in call order. */
let linkBodies: Array<Record<string, unknown>>;
/** Public URL returned by each successful storage upload, in call order. */
let coverUrls: string[];
let storageUploads: number;
let pageUpdates: number;

function setStatuses(next: RouteStatus) {
  statuses = next;
}

function installFetch() {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || 'GET';

    // The signed-upload path is not exercised here; a non-ok answer sends the
    // client down the proxied POST below, which is what these tests mock.
    if (url === STORAGE_SIGN_URL && method === 'POST') {
      return jsonResponse(404, { message: 'sign not available' });
    }
    if (url.startsWith(STORAGE_PREFIX) && method === 'POST') {
      storageUploads += 1;
      const s = statuses.storageUpload ?? 200;
      if (s >= 400) return jsonResponse(s, { message: 'upload failed' });
      // Mirror the real proxy: the public URL is derived from the (timestamped,
      // therefore unique) storage path, so each genuine upload is a new URL.
      const path = decodeURIComponent(url.slice(STORAGE_PREFIX.length));
      const publicUrl = `${COVER_BASE}${path}`;
      coverUrls.push(publicUrl);
      return jsonResponse(s, { url: publicUrl, path });
    }
    if (url === PAGE_UPDATE_URL && method === 'PUT') {
      pageUpdates += 1;
      const s = statuses.pageUpdate ?? 200;
      return jsonResponse(s, s < 400 ? {} : { message: 'update failed' });
    }
    if (url === POSTS_URL && method === 'POST') {
      const s = statuses.postCreate ?? 201;
      if (s >= 400) return jsonResponse(s, { message: 'post insert failed' });
      postBodies.push(JSON.parse(String(init?.body)));
      return jsonResponse(s, { id: `post-${postBodies.length}` });
    }
    if (url === PAGE_POSTS_URL && method === 'POST') {
      const s = statuses.pagePostLink ?? 201;
      if (s >= 400) return jsonResponse(s, { message: 'link insert failed' });
      linkBodies.push(JSON.parse(String(init?.body)));
      return jsonResponse(s, {});
    }
    throw new Error(`no mock route for ${method} ${url}`);
  });
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock;
}

function uploadCover(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['cover'], 'cover.jpg', { type: 'image/jpeg' });
  fireEvent.change(input, { target: { files: [file] } });
}

function callsTo(url: string, method: string) {
  return fetchMock.mock.calls.filter(([u, init]) => String(u) === url && init?.method === method);
}

let clock: number;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('tone-auth-token', JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh' }));
  toastSpy.mockClear();
  statuses = {};
  postBodies = [];
  linkBodies = [];
  coverUrls = [];
  storageUploads = 0;
  pageUpdates = 0;
  // Deterministic, strictly increasing clock: the storage path embeds
  // `Date.now()`, so this gives every upload a distinct, real-shaped URL.
  clock = 1_700_000_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => (clock += 1000));
  installFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PageCoverPhotoEditor automatic cover-photo-change post', () => {
  it('creates exactly one cover post AND links it to the page', async () => {
    const events: Event[] = [];
    const onEvent = (e: Event) => events.push(e);
    window.addEventListener(POST_CREATED_EVENT, onEvent);

    const onPostCreated = vi.fn();
    const { container } = render(
      <PageCoverPhotoEditor
        pageId={PAGE_ID}
        coverImage={null}
        canEdit
        onUploaded={vi.fn()}
        onPostCreated={onPostCreated}
      />
    );
    uploadCover(container);

    await waitFor(() => expect(linkBodies).toHaveLength(1));
    window.removeEventListener(POST_CREATED_EVENT, onEvent);

    // The post is a real cover-change post authored by the admin and public —
    // a Page is public by design, and the page feed filters on nothing else.
    expect(postBodies).toHaveLength(1);
    expect(postBodies[0]).toEqual({
      user_id: 'admin-uuid',
      content: '',
      media_url: coverUrls[0],
      media_type: 'image',
      type: 'cover_photo_update',
      audience_type: 'public',
      audience_user_ids: null,
      audience_excluded_user_ids: null,
    });
    // The phrase is rendered by the Post card, never persisted into the caption.
    expect(String(postBodies[0].content)).not.toContain('changed their cover photo');

    // THE ROOT CAUSE: without this link the post is invisible on the page,
    // because the page's Posts feed reads `page_posts`.
    expect(linkBodies[0]).toEqual({
      page_id: PAGE_ID,
      post_id: 'post-1',
      shared_by: 'admin-uuid',
    });

    // The caller is told to refresh so the post shows without a manual reload.
    expect(onPostCreated).toHaveBeenCalledTimes(1);
    expect(events.length).toBe(1);
  });

  it('a failed storage upload creates NO post and NO link', async () => {
    setStatuses({ storageUpload: 500 });
    const { container } = render(
      <PageCoverPhotoEditor pageId={PAGE_ID} coverImage={null} canEdit onUploaded={vi.fn()} />
    );
    uploadCover(container);

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    expect(postBodies).toHaveLength(0);
    expect(linkBodies).toHaveLength(0);
    expect(pageUpdates).toBe(0);
  });

  it('a failed page update creates NO post and NO link', async () => {
    setStatuses({ pageUpdate: 500 });
    const { container } = render(
      <PageCoverPhotoEditor pageId={PAGE_ID} coverImage={null} canEdit onUploaded={vi.fn()} />
    );
    uploadCover(container);

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    expect(postBodies).toHaveLength(0);
    expect(linkBodies).toHaveLength(0);
  });

  it('keeps the cover when the post fails, and the retry publishes it without re-uploading', async () => {
    setStatuses({ postCreate: 500 });
    const onUploaded = vi.fn();
    const onPostCreated = vi.fn();
    const { container, findByRole } = render(
      <PageCoverPhotoEditor
        pageId={PAGE_ID}
        coverImage={null}
        canEdit
        onUploaded={onUploaded}
        onPostCreated={onPostCreated}
      />
    );
    uploadCover(container);

    // The cover update is preserved even though the post failed (do.md §3).
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(coverUrls[0]));
    expect(storageUploads).toBe(1);
    expect(pageUpdates).toBe(1);
    expect(postBodies).toHaveLength(0);
    expect(onPostCreated).not.toHaveBeenCalled();

    // The owner is offered a retry that does not require re-uploading the image.
    setStatuses({});
    const retry = await findByRole('button', { name: /retry post/i });
    fireEvent.click(retry);

    await waitFor(() => expect(linkBodies).toHaveLength(1));
    // The retry created the post and linked it — with NO second upload.
    expect(postBodies).toHaveLength(1);
    expect(storageUploads).toBe(1);
    expect(pageUpdates).toBe(1);
    expect(onPostCreated).toHaveBeenCalledTimes(1);
    // The retry button clears once the post is live.
    await waitFor(() => expect(retry.isConnected).toBe(false));
  });

  it('a failed link re-uses the SAME post on retry instead of duplicating it', async () => {
    setStatuses({ pagePostLink: 500 });
    const onUploaded = vi.fn();
    const { container, findByRole } = render(
      <PageCoverPhotoEditor pageId={PAGE_ID} coverImage={null} canEdit onUploaded={onUploaded} />
    );
    uploadCover(container);

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(coverUrls[0]));
    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    expect(postBodies).toHaveLength(1);
    expect(linkBodies).toHaveLength(0);

    // Retrying must re-link the post created above, never insert a second one.
    setStatuses({});
    const retry = await findByRole('button', { name: /retry post/i });
    fireEvent.click(retry);

    await waitFor(() => expect(linkBodies).toHaveLength(1));
    expect(postBodies).toHaveLength(1);
    expect(linkBodies[0].post_id).toBe('post-1');
  });

  it('two successful cover changes create exactly one post and one link each', async () => {
    const { container } = render(
      <PageCoverPhotoEditor pageId={PAGE_ID} coverImage={null} canEdit onUploaded={vi.fn()} />
    );
    uploadCover(container);
    await waitFor(() => expect(linkBodies).toHaveLength(1));

    uploadCover(container);
    await waitFor(() => expect(linkBodies).toHaveLength(2));

    // Exactly one POST per row per change — never a duplicate from a repeated
    // callback or a double click.
    expect(callsTo(POSTS_URL, 'POST')).toHaveLength(2);
    expect(callsTo(PAGE_POSTS_URL, 'POST')).toHaveLength(2);
    expect(coverUrls[0]).not.toBe(coverUrls[1]);
    expect(postBodies.every((b) => b.type === 'cover_photo_update')).toBe(true);
  });
});
