// Profile content request-shape test for the direct/Edge Function architecture.
//
// The paged reader must send a narrow, opaque request to the `profileContent`
// Edge Function, thread the returned cursor, and never fall back to the
// abandoned Gateway. A missing deployment latches to a direct Supabase read;
// transient Function errors must be returned without latching.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUserPosts = vi.fn();
const callEdgeFunctionMock = vi.fn();

vi.mock('@/api/posts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/posts')>();
  return { ...actual, getUserPosts: (...args: unknown[]) => getUserPosts(...args) };
});

vi.mock('@/lib/supabase/crossProject', () => ({
  callEdgeFunction: (...args: unknown[]) => callEdgeFunctionMock(...args),
}));

const {
  getProfileContentPage,
  resetProfileContentEndpointProbe,
  isProfileContentEndpointAvailable,
} = await import('@/api/profileContent');

const PROFILE_ID = '11111111-1111-1111-1111-111111111111';

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

function functionPage(body: Record<string, unknown> = {}) {
  return {
    data: { kind: 'posts', items: [], has_more: false, next_cursor: null, ...body },
    error: null,
  };
}

function lastRequest() {
  const calls = callEdgeFunctionMock.mock.calls;
  return calls[calls.length - 1] as [string, { profileId: string; kind: string; cursor: string | null; limit: number }];
}

beforeEach(() => {
  resetProfileContentEndpointProbe();
  getUserPosts.mockReset();
  callEdgeFunctionMock.mockReset();
  callEdgeFunctionMock.mockResolvedValue(functionPage());
});

describe('profile content Edge Function request', () => {
  it('targets the profileContent Function with one item and no cursor first', async () => {
    await getProfileContentPage(PROFILE_ID, 'posts');

    const [name, body] = lastRequest();
    expect(name).toBe('profileContent');
    expect(body).toMatchObject({ profileId: PROFILE_ID, kind: 'posts', cursor: null, limit: 1 });
  });

  it('threads the returned opaque cursor', async () => {
    callEdgeFunctionMock.mockResolvedValueOnce(functionPage({ items: [post('p1')], has_more: true, next_cursor: 'C1' }));
    await getProfileContentPage(PROFILE_ID, 'posts');

    callEdgeFunctionMock.mockResolvedValueOnce(functionPage({ items: [post('p2')] }));
    await getProfileContentPage(PROFILE_ID, 'posts', { cursor: 'C1' });

    expect(lastRequest()[1].cursor).toBe('C1');
  });

  it('clamps the requested page size', async () => {
    await getProfileContentPage(PROFILE_ID, 'posts', { limit: 5000 });
    expect(lastRequest()[1].limit).toBe(20);

    await getProfileContentPage(PROFILE_ID, 'posts', { limit: 0 });
    expect(lastRequest()[1].limit).toBe(1);
  });

  it('sends the section so the Function performs visibility filtering', async () => {
    for (const kind of ['posts', 'photos', 'reels', 'shared'] as const) {
      await getProfileContentPage(PROFILE_ID, kind);
      expect(lastRequest()[1].kind).toBe(kind);
    }
  });

  it('lets the Function decide visibility from the central Auth session', async () => {
    await getProfileContentPage(PROFILE_ID, 'posts');

    expect(lastRequest()[1]).not.toHaveProperty('viewerId');
    expect(lastRequest()[1]).not.toHaveProperty('accessToken');
  });
});

describe('profile content fallback lifecycle', () => {
  it('falls back to a direct read when the Function is not deployed', async () => {
    callEdgeFunctionMock.mockResolvedValue({ data: null, error: { message: 'Request failed with status 404' } });
    getUserPosts.mockResolvedValue({ data: [post('p1'), post('p2'), post('p3')], error: null });

    const first = await getProfileContentPage(PROFILE_ID, 'posts');

    expect(first.error).toBeNull();
    expect(first.data?.items.map((item) => item.id)).toEqual(['p1']);
    expect(first.data?.has_more).toBe(true);
    expect(first.data?.degraded).toBe(true);
    expect(isProfileContentEndpointAvailable()).toBe(false);
  });

  it('stops calling a Function that latched off', async () => {
    callEdgeFunctionMock.mockResolvedValue({ data: null, error: { message: 'Request failed with status 404' } });
    getUserPosts.mockResolvedValue({ data: [post('p1')], error: null });

    await getProfileContentPage(PROFILE_ID, 'posts');
    await getProfileContentPage(PROFILE_ID, 'posts', { cursor: 'MQ==' });

    expect(callEdgeFunctionMock).toHaveBeenCalledTimes(1);
  });

  it('does not latch or fall back on a transient Function error', async () => {
    callEdgeFunctionMock
      .mockResolvedValueOnce({ data: null, error: { message: 'Request failed with status 500' } })
      .mockResolvedValueOnce(functionPage({ items: [post('p1')] }));

    const failed = await getProfileContentPage(PROFILE_ID, 'posts');

    expect(failed.error).toBeTruthy();
    // `null` means "not probed successfully yet", the state that keeps retrying.
    // `false` would mean the 404 latch fired; `true` would only be honest after a
    // successful response.
    expect(isProfileContentEndpointAvailable()).toBeNull();
    expect(getUserPosts).not.toHaveBeenCalled();

    const retried = await getProfileContentPage(PROFILE_ID, 'posts');
    expect(callEdgeFunctionMock).toHaveBeenCalledTimes(2);
    expect(retried.data?.items).toHaveLength(1);
    expect(isProfileContentEndpointAvailable()).toBe(true);
    expect(getUserPosts).not.toHaveBeenCalled();
  });
});

describe('profile content response normalization', () => {
  it('drops malformed rows and normalizes unknown post types', async () => {
    callEdgeFunctionMock.mockResolvedValue(
      functionPage({ items: [post('p1'), { user_id: PROFILE_ID }, post('p2', { type: 'poll' })], has_more: false })
    );

    const { data } = await getProfileContentPage(PROFILE_ID, 'posts');

    expect(data?.items.map((item) => item.id)).toEqual(['p1', 'p2']);
    expect(data?.items[1].type).toBe('normal_post');
  });

  it('refuses a missing profile id without calling the Function', async () => {
    const { data, error } = await getProfileContentPage('', 'posts');

    expect(data).toBeNull();
    expect(error?.message).toBe('A profile id is required');
    expect(callEdgeFunctionMock).not.toHaveBeenCalled();
  });

  it('surfaces the Function error message', async () => {
    callEdgeFunctionMock.mockResolvedValue({ data: null, error: { message: 'Profile content read failed' } });

    const { data, error } = await getProfileContentPage(PROFILE_ID, 'posts');

    expect(data).toBeNull();
    expect(error?.message).toBe('Profile content read failed');
  });
});
