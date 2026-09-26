import { gateway } from '@/lib/gateway';

/**
 * Engagement data for a page of posts, in two round trips instead of two per post.
 *
 * The Gateway does not process query parameters, so
 * `from('likes').eq('post_id', id)` is not a keyed lookup — it is a whole-table
 * read that the client then filters itself. Fetching that per post therefore
 * re-downloaded the entire `likes` and `comments` tables once per post, which for
 * a 20-post feed is 40 round trips and roughly 1.7 MB to produce two integers per
 * post. Filtering also makes the requests non-identical, so the gateway client's
 * in-flight coalescing cannot merge them.
 *
 * Reading each table once and bucketing by `post_id` in JS gives the identical
 * result in two round trips. The bucket shape matches what the callers used to
 * build, so nothing downstream changes.
 */
export type PostLikes = Array<{ id: string; user_id: string }>;
export type PostComments = Array<{ id: string; content: string; user_id: string; profiles?: { display_name?: string } | null }>;

export interface PostEngagement {
  likesByPostId: Map<string, PostLikes>;
  commentsByPostId: Map<string, PostComments>;
}

function bucketByPostId<T extends { post_id?: string | null }>(rows: T[] | null | undefined): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows ?? []) {
    const postId = row?.post_id;
    if (typeof postId !== 'string') continue;
    const existing = map.get(postId);
    if (existing) existing.push(row);
    else map.set(postId, [row]);
  }
  return map;
}

/**
 * Fetches likes and comments for many posts at once.
 *
 * A failure on either table degrades to empty engagement rather than failing the
 * whole feed, matching the previous behaviour where one failed per-post read only
 * cost that post its counts.
 */
export async function fetchEngagementForPosts(postIds: string[]): Promise<PostEngagement> {
  const empty: PostEngagement = { likesByPostId: new Map(), commentsByPostId: new Map() };
  if (!postIds || postIds.length === 0) return empty;

  const [likesResult, commentsResult] = await Promise.all([
    gateway.from('likes').select('id, user_id'),
    gateway
      .from('comments')
      .select('id, content, user_id, profiles:user_id(display_name)'),
  ]);

  if (likesResult.error) console.warn('[engagement] likes read failed:', likesResult.error.message);
  if (commentsResult.error) console.warn('[engagement] comments read failed:', commentsResult.error.message);

  return {
    likesByPostId: bucketByPostId<PostLikes[number]>(likesResult.data as never),
    commentsByPostId: bucketByPostId<PostComments[number]>(commentsResult.data as never),
  };
}
