// Per-post engagement fan-out, measured in requests.
//
// The Gateway does not process query parameters, so `from('likes').eq('post_id', id)`
// is a whole-table read that the client filters itself. The hashtag feeds used to
// issue that read once per post for both `likes` and `comments` — 2N round trips,
// and because the filter differs per post the requests were not even identical, so
// nothing could merge them.
//
// `fetchEngagementForPosts` reads each table once and buckets by post_id. These
// tests pin the request count and, just as importantly, that the bucketed result is
// identical to what the per-post fan-out produced.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/gateway', () => ({
  gateway: { from: vi.fn() },
}));

import { gateway } from '@/lib/gateway';
import { fetchEngagementForPosts } from '@/lib/postEngagement';

const POSTS = ['p1', 'p2', 'p3', 'p4', 'p5'];

const LIKES = [
  { id: 'l1', user_id: 'u1', post_id: 'p1' },
  { id: 'l2', user_id: 'u2', post_id: 'p1' },
  { id: 'l3', user_id: 'u3', post_id: 'p2' },
  { id: 'l4', user_id: 'u1', post_id: 'p5' },
  { id: 'l5', user_id: 'u9', post_id: 'p1' },
];

const COMMENTS = [
  { id: 'c1', content: 'nice', user_id: 'u1', post_id: 'p1' },
  { id: 'c2', content: 'agreed', user_id: 'u2', post_id: 'p3' },
  { id: 'c3', content: 'ty', user_id: 'u1', post_id: 'p3' },
  { id: 'c4', content: 'welcome', user_id: 'u4', post_id: 'p1' },
];

/** Minimal stand-in for the query builder: only `.select()` is used here. */
function tableReturning(rows: unknown[]) {
  return {
    select: vi.fn(() => ({
      then: (onOk: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(onOk),
    })),
  };
}

describe('fetchEngagementForPosts', () => {
  beforeEach(() => {
    vi.mocked(gateway.from).mockImplementation((table: string) => {
      if (table === 'likes') return tableReturning(LIKES) as never;
      if (table === 'comments') return tableReturning(COMMENTS) as never;
      throw new Error(`unexpected table read: ${table}`);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reads each table once regardless of how many posts are shown', async () => {
    await fetchEngagementForPosts(POSTS);

    const tables = vi.mocked(gateway.from).mock.calls.map((c) => c[0]);
    expect(tables.sort()).toEqual(['comments', 'likes']);
  });

  it('produces exactly the counts a per-post fan-out would have produced', async () => {
    const { likesByPostId, commentsByPostId } = await fetchEngagementForPosts(POSTS);

    // Derived the way the callers derive them: `likes.length` and `comments.length`.
    const counts = POSTS.map((id) => [
      (likesByPostId.get(id) || []).length,
      (commentsByPostId.get(id) || []).length,
    ]);

    expect(counts).toEqual([
      [3, 2], // p1
      [1, 0], // p2
      [0, 2], // p3
      [0, 0], // p4 — no engagement
      [1, 0], // p5
    ]);
  });

  it('keeps each post’s rows grouped, not merged across posts', async () => {
    const { likesByPostId, commentsByPostId } = await fetchEngagementForPosts(POSTS);

    expect(likesByPostId.get('p1')?.map((l) => l.id)).toEqual(['l1', 'l2', 'l5']);
    expect(commentsByPostId.get('p3')?.map((c) => c.id)).toEqual(['c2', 'c3']);
  });

  it('returns empty buckets rather than throwing for a post with no engagement', async () => {
    const { likesByPostId, commentsByPostId } = await fetchEngagementForPosts(POSTS);

    expect(likesByPostId.has('p4')).toBe(false);
    expect(commentsByPostId.has('p4')).toBe(false);
    expect(likesByPostId.get('p4') || []).toEqual([]);
  });

  it('ignores rows with no post_id instead of bucketing them under undefined', async () => {
    vi.mocked(gateway.from).mockImplementation((table: string) =>
      tableReturning(
        table === 'likes'
          ? [...LIKES, { id: 'l9', user_id: 'u1', post_id: null }]
          : [...COMMENTS, { id: 'c9', content: 'orphan', user_id: 'u1' }]
      ) as never
    );

    const { likesByPostId, commentsByPostId } = await fetchEngagementForPosts(POSTS);

    expect(likesByPostId.get('p1')?.map((l) => l.id)).toEqual(['l1', 'l2', 'l5']);
    expect(commentsByPostId.get('p1')?.map((c) => c.id)).toEqual(['c1', 'c4']);
    expect([...likesByPostId.keys()].every((k) => k !== 'undefined')).toBe(true);
    expect([...commentsByPostId.keys()].every((k) => k !== 'undefined')).toBe(true);
  });

  it('makes no request at all when there are no posts to enrich', async () => {
    const { likesByPostId, commentsByPostId } = await fetchEngagementForPosts([]);

    expect(vi.mocked(gateway.from)).not.toHaveBeenCalled();
    expect(likesByPostId.size).toBe(0);
    expect(commentsByPostId.size).toBe(0);
  });

  it('degrades to empty engagement when a table read fails', async () => {
    vi.mocked(gateway.from).mockImplementation((table: string) => {
      const rows = table === 'likes' ? LIKES : COMMENTS;
      const err = table === 'comments';
      return {
        select: vi.fn(() => ({
          then: (onOk: (v: { data: unknown[]; error: { message: string } | null }) => unknown) =>
            Promise.resolve({ data: err ? null : rows, error: err ? { message: 'boom' } : null }).then(onOk),
        })),
      } as never;
    });

    const { likesByPostId, commentsByPostId } = await fetchEngagementForPosts(POSTS);

    // A failed comments read must not take down the feed, matching the old
    // behaviour where one failed per-post read only cost that post its comments.
    expect(likesByPostId.get('p1')).toHaveLength(3);
    expect(commentsByPostId.size).toBe(0);
  });
});
