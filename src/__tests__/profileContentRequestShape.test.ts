// The request shape and viewer identity of the Profile content read
// (do.md "Profile content pages" — §3, §8, §14–§17, §19).
//
// `useProfileContent` is covered in `profileContentPaging.test.ts`. This file
// covers the layer below it — `src/api/profileContent.ts` — because the two
// properties that make the profile feed private are decided HERE, on the wire:
//
//   * The viewer is identified ONLY by the verified session token, so the
//     Gateway can apply the audience matrix per request (§14, §17). A guest
//     sends no Authorization header at all and still gets a working public
//     profile; nothing client-side decides what the viewer may see.
//   * The request shape is `limit=1` plus an opaque cursor (§3, §8), and the
//     cursor is threaded from the previous response, never recomputed.
//
// It also pins the compatibility path: a Gateway that does not have the content
// route yet answers 404, and the reader must fall back rather than show a
// broken Profile. A transport error or a 500 must NOT latch, because those are
// worth retrying and a latched fallback would silently keep downloading whole
// histories for the rest of the session.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const getUserPosts = vi.fn();

vi.mock('@/api/posts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/posts')>();
  return { ...actual, getUserPosts: (...args: unknown[]) => getUserPosts(...args) };
});

const {
  getProfileContentPage,
  resetProfileContentEndpointProbe,
  isProfileContentEndpointAvailable,
} = await import('@/api/profileContent');
const { API_URL } = await import('@/api/client');

const PROFILE_ID = '11111111-1111-1111-1111-111111111111';

// --- Fixtures --------------------------------------------------------------

function post(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    user_id: PROFILE_ID,
    content: `body ${id}`,
    media_url: null,
    media_type: null,
    type: 'normal_post',
    created_at: '2026-01-01T00:00:00.000Z',
    profiles: { username: 'owner', display_name: 'Owner', profile_pic: null },
    ...overrides,
  };
}

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
  } as unknown as Response;
}

function page(body: Record<string, unknown> = {}) {
  return jsonResponse({ kind: 'posts', items: [], has_more: false, next_cursor: null, ...body });
}

function signIn(accessToken = 'test-token') {
  localStorage.setItem('tone-auth-token', JSON.stringify({ access_token: accessToken }));
}

function lastUrl(): URL {
  const calls = fetchMock.mock.calls;
  return new URL(String(calls[calls.length - 1][0]));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // The endpoint probe is module state: a latched "unavailable" would leak
  // from one test into the next.
  resetProfileContentEndpointProbe();
  localStorage.clear();
  getUserPosts.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

// --- A. one item per request, cursor threaded -------------------------------

describe('A. the request asks for one item and threads the cursor', () => {
  it('defaults to one item and sends no cursor on the first request', async () => {
    fetchMock.mockResolvedValue(page({ items: [post('p1')], has_more: true, next_cursor: 'C1' }));

    await getProfileContentPage(PROFILE_ID, 'posts');

    const url = lastUrl();
    expect(url.pathname).toBe(`/api/profiles/${PROFILE_ID}/content`);
    expect(url.searchParams.get('kind')).toBe('posts');
    expect(url.searchParams.get('limit')).toBe('1');
    expect(url.searchParams.get('cursor')).toBeNull();
  });

  it('sends the cursor the previous response returned', async () => {
    fetchMock.mockResolvedValue(page({ items: [post('p1')], has_more: true, next_cursor: 'C1' }));
    await getProfileContentPage(PROFILE_ID, 'posts');

    fetchMock.mockResolvedValue(page({ items: [post('p2')], has_more: false }));
    await getProfileContentPage(PROFILE_ID, 'posts', { cursor: 'C1' });

    expect(lastUrl().searchParams.get('cursor')).toBe('C1');
  });

  it('clamps the limit instead of trusting it', async () => {
    fetchMock.mockResolvedValue(page());

    await getProfileContentPage(PROFILE_ID, 'posts', { limit: 5000 });
    expect(lastUrl().searchParams.get('limit')).toBe('20');

    await getProfileContentPage(PROFILE_ID, 'posts', { limit: 0 });
    expect(lastUrl().searchParams.get('limit')).toBe('1');
  });

  it('passes the section through so the server filters, not the client', async () => {
    fetchMock.mockResolvedValue(page());

    for (const kind of ['posts', 'photos', 'reels', 'shared'] as const) {
      await getProfileContentPage(PROFILE_ID, kind);
      expect(lastUrl().searchParams.get('kind')).toBe(kind);
    }
  });
});

// --- B. the viewer is identified only by the session token (§14, §17) -------

describe('B. viewer identity comes from the verified session, never from the client', () => {
  it('authorizes the request with the session token', async () => {
    signIn('jwt-abc');
    fetchMock.mockResolvedValue(page());

    await getProfileContentPage(PROFILE_ID, 'posts');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-abc');
  });

  it('sends no Authorization header for a guest, and still asks', async () => {
    fetchMock.mockResolvedValue(page({ items: [post('p1')] }));

    const { data, error } = await getProfileContentPage(PROFILE_ID, 'posts');

    // A guest must still be able to read a public profile: the header is absent,
    // not forged, and the read is not refused client-side.
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(error).toBeNull();
    expect(data?.items).toHaveLength(1);
  });

  it('never caches a viewer-specific response', async () => {
    signIn();
    fetchMock.mockResolvedValue(page());

    await getProfileContentPage(PROFILE_ID, 'posts');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.cache).toBe('no-store');
  });
});

// --- C. the compatibility fallback -----------------------------------------

describe('C. a Gateway without the content route degrades instead of breaking', () => {
  it('falls back to a whole-table read when the route is missing (404)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Not found' }, { status: 404 }));
    getUserPosts.mockResolvedValue({
      data: [post('p1'), post('p2'), post('p3')],
      error: null,
    });

    const first = await getProfileContentPage(PROFILE_ID, 'posts');

    expect(first.error).toBeNull();
    expect(first.data?.items.map((i) => i.id)).toEqual(['p1']);
    expect(first.data?.has_more).toBe(true);
    // The fallback is honest that it is not the cursor path: it cannot honour
    // "one request = one item" at the transport level.
    expect(first.data?.degraded).toBe(true);
    expect(isProfileContentEndpointAvailable()).toBe(false);
  });

  it('slices the fallback one item at a time', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, { status: 405 }));
    getUserPosts.mockResolvedValue({ data: [post('p1'), post('p2')], error: null });

    const first = await getProfileContentPage(PROFILE_ID, 'posts');
    const second = await getProfileContentPage(PROFILE_ID, 'posts', {
      cursor: first.data?.next_cursor ?? null,
    });

    expect(first.data?.items.map((i) => i.id)).toEqual(['p1']);
    expect(second.data?.items.map((i) => i.id)).toEqual(['p2']);
    expect(second.data?.has_more).toBe(false);
  });

  it('stops asking the Gateway once it has latched off', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, { status: 404 }));
    getUserPosts.mockResolvedValue({ data: [post('p1')], error: null });

    await getProfileContentPage(PROFILE_ID, 'posts');
    await getProfileContentPage(PROFILE_ID, 'posts', { cursor: 'C1' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT latch on a 500 — that is worth retrying', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Internal server error' }, { status: 500 }));

    const failed = await getProfileContentPage(PROFILE_ID, 'posts');
    expect(failed.error).toBeTruthy();
    // The probe is tri-state: `true` means "the route answered", which a 500
    // does. What must not happen is latching OFF to the whole-table read — a
    // transient error would then silently download whole histories for the rest
    // of the session.
    expect(isProfileContentEndpointAvailable()).toBe(true);
    expect(getUserPosts).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(page({ items: [post('p1')] }));
    const retried = await getProfileContentPage(PROFILE_ID, 'posts');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(retried.data?.items).toHaveLength(1);
    expect(getUserPosts).not.toHaveBeenCalled();
  });
});

// --- D. response normalization ---------------------------------------------

describe('D. a malformed or unknown row is handled without losing the feed', () => {
  it('drops a row with no id rather than rendering an unusable card', async () => {
    fetchMock.mockResolvedValue(
      page({ items: [{ ...post('p1') }, { user_id: PROFILE_ID }, 'nonsense'], has_more: false })
    );

    const { data } = await getProfileContentPage(PROFILE_ID, 'posts');

    expect(data?.items.map((i) => i.id)).toEqual(['p1']);
  });

  it('treats a type the client does not know as a plain post instead of dropping it', async () => {
    fetchMock.mockResolvedValue(page({ items: [post('p1', { type: 'poll' })], has_more: false }));

    const { data } = await getProfileContentPage(PROFILE_ID, 'posts');

    // A row the viewer is allowed to read must not disappear because the server
    // grew a new post kind.
    expect(data?.items[0].type).toBe('normal_post');
  });

  it('refuses a missing profile id without touching the network', async () => {
    const { data, error } = await getProfileContentPage('', 'posts');

    expect(data).toBeNull();
    expect(error?.message).toBe('A profile id is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces a Gateway error message to the caller', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Profile content read failed' }, { status: 500 }));

    const { data, error } = await getProfileContentPage(PROFILE_ID, 'posts');

    expect(data).toBeNull();
    expect(error?.message).toBe('Profile content read failed');
  });
});

// --- E. the base URL is the configured Gateway ------------------------------

describe('E. the read targets the configured Gateway', () => {
  it('never targets an origin other than the configured one', async () => {
    fetchMock.mockResolvedValue(page());

    await getProfileContentPage(PROFILE_ID, 'posts');

    expect(String(fetchMock.mock.calls[0][0]).startsWith(`${API_URL}/api/profiles/`)).toBe(true);
  });
});
