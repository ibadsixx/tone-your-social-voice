// Home Feed data-path regression tests.
//
// The posts project is a different Supabase project from central Auth. A signed-in
// feed therefore cannot be a direct browser read with the central JWT (the posts
// project rejects it); it must use the narrow feedTimeline Edge Function. A guest
// has no JWT and keeps the direct anon-key read against the registered posts
// project, where RLS is authoritative. These tests pin both paths and the error
// classification that stops a failed read from looking like an empty feed.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFeedTimeline } from '@/api/posts';
import { clearClientCache } from '@/lib/supabase/clientFactory';
import { clearCurrentAccessToken } from '@/lib/supabase/sessionTokenProvider';
import {
  INFRA_PROJECTS as REGISTRY_FIXTURE,
  isInfraRegistryRequest,
  jsonResponse,
  postgrestTable,
} from './infraFixtures';

const POSTS_ORIGIN = 'http://posts-feed.test';
const OTHER_ORIGIN = 'http://other-feed.test';
const EDGE_URL = 'https://edge.test/functions/v1/feedTimeline';

const authState = vi.hoisted(() => ({ token: null as string | null }));
const edgeState = vi.hoisted(() => ({ url: 'https://edge.test/functions/v1/feedTimeline' }));

vi.mock('@/lib/supabase/centralAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supabase/centralAuth')>();
  return { ...actual, getAccessToken: async () => authState.token };
});

vi.mock('@/lib/supabase/edgeTransport', () => ({
  getEdgeFunctionUrl: (name: string) => (name === 'feedTimeline' ? edgeState.url : ''),
}));

const FEED_ROWS = [
  {
    id: 'public-2',
    user_id: 'author-2',
    content: 'second public post',
    created_at: '2026-01-02T00:00:00.000Z',
    audience_type: 'public',
    status: 'published',
    profiles: { username: 'author2', display_name: 'Author Two', profile_pic: null },
  },
  {
    id: 'public-1',
    user_id: 'author-1',
    content: 'first public post',
    created_at: '2026-01-01T00:00:00.000Z',
    audience_type: 'public',
    status: 'published',
    profiles: { username: 'author1', display_name: 'Author One', profile_pic: null },
  },
];

function projectRegistry() {
  return REGISTRY_FIXTURE.map((project) => ({
    ...project,
    project_url: project.domain === 'posts' ? POSTS_ORIGIN : OTHER_ORIGIN,
  }));
}

function ambiguousPostsRegistry() {
  const projects = projectRegistry();
  const postsProject = projects.find((project) => project.domain === 'posts');
  if (!postsProject) throw new Error('test fixture is missing the posts project');
  return [...projects, { ...postsProject, project_key: 'posts-2' }];
}

describe('Home Feed data path', () => {
  const realFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;
  let requested: string[] = [];
  let postsRequests: Array<{ url: URL; init?: RequestInit }> = [];
  let registryProjects = projectRegistry();
  let postsStatus = 200;
  let postsBody: unknown = FEED_ROWS;
  let edgeStatus = 200;
  let edgeBody: unknown = {
    data: {
      posts: [FEED_ROWS[1], FEED_ROWS[0]],
      rawCount: 2,
      visibleCount: 2,
      hasMore: false,
      nextCursor: null,
    },
    error: null,
  };
  let edgeThrows = false;

  beforeEach(() => {
    clearClientCache();
    clearCurrentAccessToken();
    authState.token = null;
    edgeState.url = EDGE_URL;
    requested = [];
    postsRequests = [];
    registryProjects = projectRegistry();
    postsStatus = 200;
    postsBody = FEED_ROWS;
    edgeStatus = 200;
    edgeBody = {
      data: {
        posts: [FEED_ROWS[1], FEED_ROWS[0]],
        rawCount: 2,
        visibleCount: 2,
        hasMore: false,
        nextCursor: null,
      },
      error: null,
    };
    edgeThrows = false;

    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (isInfraRegistryRequest(input)) {
        requested.push('registry');
        return jsonResponse(200, registryProjects);
      }

      const url = typeof input === 'string'
        ? new URL(input)
        : input instanceof URL
          ? input
          : new URL(input.url);
      if (url.href === EDGE_URL) {
        requested.push('edge');
        if (edgeThrows) throw new Error('network unavailable');
        return jsonResponse(edgeStatus, edgeBody);
      }

      const table = postgrestTable(url);
      if (table === 'posts') {
        requested.push('posts');
        postsRequests.push({ url, init });
        return jsonResponse(postsStatus, postsBody);
      }
      return jsonResponse(404, { message: `no mock route for ${table || url.pathname}` });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    clearCurrentAccessToken();
    clearClientCache();
    vi.restoreAllMocks();
  });

  it('reads a guest feed directly from the registered posts project', async () => {
    const result = await getFeedTimeline();

    expect(result.error).toBeNull();
    expect(result.data?.map((post) => post.id)).toEqual(['public-2', 'public-1']);
    expect(result.rawCount).toBe(2);
    expect(result.visibleCount).toBe(2);
    expect(requested).toEqual(['registry', 'posts']);
    expect(postsRequests).toHaveLength(1);
    expect(postsRequests[0].url.origin).toBe(POSTS_ORIGIN);
    expect(postsRequests[0].url.pathname).toBe('/rest/v1/posts');
    // Keyset paging needs both: created_at for recency, id for deterministic
    // ties. supabase-js encodes multiple `.order()` calls as one comma-separated
    // PostgREST `order` parameter, preserving their insertion order.
    expect(postsRequests[0].url.searchParams.get('order')).toBe('created_at.desc,id.desc');
  });

  it('sends a keyset cursor and a limit+1 probe on guest pages', async () => {
    await getFeedTimeline({
      cursor: { created_at: '2026-01-01T00:00:00.000Z', id: 'public-1' },
      limit: 1,
    });

    expect(postsRequests).toHaveLength(1);
    const params = postsRequests[0].url.searchParams;
    expect(params.get('limit')).toBe('2');
    const filter = decodeURIComponent(params.get('or') ?? '');
    expect(filter).toContain('created_at.lt."2026-01-01T00:00:00.000Z"');
    expect(filter).toContain('created_at.eq."2026-01-01T00:00:00.000Z"');
    expect(filter).toContain('id.lt."public-1"');
  });

  it('reads a signed-in feed through the narrow Edge Function with the central JWT', async () => {
    authState.token = 'central-token';

    const result = await getFeedTimeline();

    expect(result.error).toBeNull();
    expect(result.data?.map((post) => post.id)).toEqual(['public-1', 'public-2']);
    expect(result.rawCount).toBe(2);
    expect(result.visibleCount).toBe(2);
    expect(requested).toEqual(['edge']);
    expect(postsRequests).toHaveLength(0);

    const edgeCall = fetchMock.mock.calls.find((call) => call[0] === EDGE_URL);
    expect(edgeCall).toBeDefined();
    const init = edgeCall?.[1] as RequestInit | undefined;
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ limit: 10 });
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer central-token');
  });

  it('sends only the cursor and limit to the Edge Function on later pages', async () => {
    authState.token = 'central-token';
    const cursor = { created_at: '2026-01-01T00:00:00.000Z', id: 'public-1' };

    await getFeedTimeline({ cursor, limit: 50 });

    const edgeCall = fetchMock.mock.calls.find((call) => call[0] === EDGE_URL);
    expect(JSON.parse(String((edgeCall?.[1] as RequestInit | undefined)?.body))).toEqual({
      cursor,
      limit: 50,
    });
  });

  it('returns a successful empty feed when the posts query has no rows', async () => {
    postsBody = [];

    const result = await getFeedTimeline();

    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
    expect(result.rawCount).toBe(0);
    expect(result.visibleCount).toBe(0);
    expect(requested).toEqual(['registry', 'posts']);
  });

  it('classifies an expired session as an authentication failure', async () => {
    authState.token = 'central-token';
    edgeStatus = 401;
    edgeBody = { data: null, error: { message: 'Authentication required', code: 'AUTH_REQUIRED' } };

    const result = await getFeedTimeline();

    expect(result.data).toBeNull();
    expect(result.feedErrorCode).toBe('AUTH_REQUIRED');
    expect(result.error?.message).toMatch(/session has expired/i);
  });

  it('classifies a missing feed route as routing, not an empty feed', async () => {
    authState.token = 'central-token';
    edgeState.url = '';

    const result = await getFeedTimeline();

    expect(result.data).toBeNull();
    expect(result.feedErrorCode).toBe('FEED_ROUTE_MISSING');
    expect(result.error?.message).toMatch(/routing is not configured/i);
    expect(requested).toEqual([]);
  });

  it('uses the approved posts project when another active row shares the domain', async () => {
    registryProjects = ambiguousPostsRegistry();

    const result = await getFeedTimeline();

    // The posts project key is an explicit route selector; an extra active row
    // with a different key cannot turn that into an ambiguous domain read.
    expect(result.error).toBeNull();
    expect(result.data?.map((post) => post.id)).toEqual(['public-2', 'public-1']);
    expect(postsRequests).toHaveLength(1);
    expect(postsRequests[0].url.origin).toBe(POSTS_ORIGIN);
  });

  it('distinguishes an RLS denial from a query failure for guest reads', async () => {
    postsStatus = 403;
    postsBody = { code: '42501', message: 'permission denied for table posts' };
    const denied = await getFeedTimeline();

    expect(denied.data).toBeNull();
    expect(denied.feedErrorCode).toBe('RLS_DENIED');

    clearClientCache();
    postsStatus = 500;
    postsBody = { code: 'PGRST500', message: 'database query failed' };
    const failed = await getFeedTimeline();

    expect(failed.data).toBeNull();
    expect(failed.feedErrorCode).toBe('QUERY_FAILED');
  });

  it('does not accept a malformed Edge Function envelope as a feed', async () => {
    authState.token = 'central-token';
    edgeBody = { data: { posts: 'not-an-array' }, error: null };

    const result = await getFeedTimeline();

    expect(result.data).toBeNull();
    expect(result.feedErrorCode).toBe('QUERY_FAILED');
    expect(result.error?.message).toMatch(/invalid response/i);
  });

  it('rejects a page that claims to continue without a cursor', async () => {
    authState.token = 'central-token';
    edgeBody = {
      data: {
        posts: FEED_ROWS,
        rawCount: 2,
        visibleCount: 2,
        hasMore: true,
        nextCursor: null,
      },
      error: null,
    };

    const result = await getFeedTimeline();

    expect(result.data).toBeNull();
    expect(result.feedErrorCode).toBe('QUERY_FAILED');
  });

  it('keeps a network failure classified as a query error', async () => {
    authState.token = 'central-token';
    edgeThrows = true;

    const result = await getFeedTimeline();

    expect(result.data).toBeNull();
    expect(result.feedErrorCode).toBe('QUERY_FAILED');
    expect(result.error?.message).toMatch(/query failed/i);
  });
});
