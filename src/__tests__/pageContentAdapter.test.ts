// A Page reuses the personal-profile content feed. The adapter it plugs into
// (`api/pageContent.ts`) must read the page's posts through the `page_posts`
// link table — scoped to that page — and stamp the owning page onto every item
// so the shared Post card renders the page identity and links to `/pages/:id`.
//
// These assertions keep that contract honest: a page feed is not a client-side
// filter over the page admin's personal posts, and it is not a second feed
// implementation (it speaks the same `ProfileContentFetcher` shape the personal
// profile uses).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const eqCalls: Array<[string, unknown]> = [];
const inCalls: Array<[string, unknown[]]> = [];
const fromCalls: string[] = [];

const PAGE = {
  id: 'page-1',
  name: 'Gold Oil Daily',
  cover_image: 'cover.jpg',
  profile_pic: 'pic.jpg',
};

const PAGE_POSTS = [
  { page_id: 'page-1', post_id: 'post-a' },
  { page_id: 'page-1', post_id: 'post-b' },
];

const POSTS = [
  {
    id: 'post-a',
    user_id: 'admin-1',
    content: 'first page post',
    media_url: null,
    media_type: null,
    type: 'normal_post',
    shared_post_id: null,
    created_at: '2026-02-02T00:00:00.000Z',
  },
  {
    id: 'post-b',
    user_id: 'admin-1',
    content: 'a page reel',
    media_url: 'reel.mp4',
    media_type: 'video',
    type: 'reel',
    shared_post_id: null,
    created_at: '2026-02-03T00:00:00.000Z',
  },
];

const PROFILES = [
  { id: 'admin-1', username: 'adminuser', display_name: 'The Admin', profile_pic: null },
];

const TABLES: Record<string, unknown> = {
  page_posts: PAGE_POSTS,
  posts: POSTS,
  profiles: PROFILES,
};

function createBuilder(data: unknown) {
  const b: any = {};
  for (const m of ['select', 'order', 'limit']) b[m] = () => b;
  b.eq = (...args: [string, unknown]) => {
    eqCalls.push(args);
    return b;
  };
  b.in = (...args: [string, unknown[]]) => {
    inCalls.push(args);
    return b;
  };
  b.then = (resolve: any, reject: any) =>
    Promise.resolve({ data, error: null }).then(resolve, reject);
  return b;
}

vi.mock('@/lib/gateway', () => ({
  gateway: {
    from: (table: string) => {
      fromCalls.push(table);
      return createBuilder(TABLES[table] ?? []);
    },
  },
}));

import { createPageContentFetcher } from '@/api/pageContent';

describe('createPageContentFetcher', () => {
  beforeEach(() => {
    eqCalls.length = 0;
    inCalls.length = 0;
    fromCalls.length = 0;
  });

  it('reads the posts through the page_posts link table, scoped to the page', async () => {
    const fetcher = createPageContentFetcher(PAGE);
    const { data, error } = await fetcher('posts', null, 1);

    expect(error).toBeNull();
    expect(fromCalls).toContain('page_posts');
    // The page_posts read is filtered by page_id == this page (never the admin
    // user id), which is what keeps the feed scoped to this page's posts.
    expect(eqCalls.some(([col, val]) => col === 'page_id' && val === 'page-1')).toBe(true);
    // Newest first, exactly like the personal-profile feed.
    expect(data?.items.map((i) => i.id)).toEqual(['post-b', 'post-a']);
  });

  it('stamps the owning page onto every item so Post renders the page identity', async () => {
    const fetcher = createPageContentFetcher(PAGE);
    const { data } = await fetcher('posts', null, 1);

    for (const item of data!.items) {
      expect(item.page?.id).toBe('page-1');
      expect(item.page?.name).toBe('Gold Oil Daily');
    }
  });

  it('completes in a single request (no cursor) so the shared feed stops', async () => {
    const fetcher = createPageContentFetcher(PAGE);
    const { data } = await fetcher('posts', null, 1);

    expect(data?.has_more).toBe(false);
    expect(data?.next_cursor).toBeNull();
  });

  it('applies the same kind filters as the personal profile feed', async () => {
    const fetcher = createPageContentFetcher(PAGE);

    const reels = await fetcher('reels', null, 1);
    expect(reels.data?.items.map((i) => i.id)).toEqual(['post-b']);

    const photos = await fetcher('photos', null, 1);
    // The reel is not a photo; the text post has no media.
    expect(photos.data?.items).toEqual([]);
  });
});
