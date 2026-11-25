import { dataClient } from '@/lib/supabase/dataClient';
import type { ApiResult } from '@/lib/supabase/dataClient';
import { getAccessToken } from '@/lib/supabase/centralAuth';
import { getEdgeFunctionUrl } from '@/lib/supabase/edgeTransport';
import type { Post } from './types';

/**
 * Feed failures are not interchangeable. A missing/ambiguous route, an expired
 * session, a denied row and a broken PostgREST query must stay distinguishable
 * all the way to the UI; none of them may be reported as "no posts".
 */
export type FeedErrorCode =
  | 'AUTH_REQUIRED'
  | 'FEED_ROUTE_MISSING'
  | 'FEED_ROUTE_AMBIGUOUS'
  | 'RLS_DENIED'
  | 'QUERY_FAILED';

export interface FeedCursor {
  created_at: string;
  id: string;
}

export interface FeedTimelineRequest {
  cursor?: FeedCursor | null;
  limit?: number;
}

export interface FeedTimelineEnvelope {
  posts: Post[];
  rawCount: number;
  visibleCount: number;
  hasMore: boolean;
  nextCursor: FeedCursor | null;
}

export interface FeedTimelineResult extends ApiResult<Post[]> {
  rawCount?: number;
  visibleCount?: number;
  hasMore?: boolean;
  nextCursor?: FeedCursor | null;
  feedErrorCode?: FeedErrorCode;
}

const DEFAULT_FEED_LIMIT = 10;
const MAX_FEED_LIMIT = 50;

function quoteFilterValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function cursorFilter(cursor: FeedCursor): string {
  const ts = quoteFilterValue(cursor.created_at);
  const id = quoteFilterValue(cursor.id);
  return `created_at.lt.${ts},and(created_at.eq.${ts},id.lt.${id})`;
}

function nextCursorOf(rows: Post[]): FeedCursor | null {
  const last = rows[rows.length - 1];
  if (!last?.id || !last?.created_at) return null;
  return { created_at: last.created_at, id: last.id };
}

const POST_SELECT_FULL = `
  *,
  profiles!posts_user_id_fkey (username, display_name, profile_pic),
  likes (id, user_id),
  comments (id),
  shared_post:shared_post_id (id, content, media_url, media_type, type, created_at, profiles!posts_user_id_fkey (username, display_name, profile_pic)),
  group_posts (group_id, groups:group_id (id, name))
`;

const POST_SELECT_BASIC = `
  *,
  profiles!posts_user_id_fkey (username, display_name, profile_pic),
  shared_post:shared_post_id (id, content, media_url, media_type, type, created_at, profiles!posts_user_id_fkey (username, display_name, profile_pic))
`;

const POST_SELECT_REEL = `
  id, user_id, media_url, media_type, duration, music_url, music_source, music_start,
  music_video_id, content, likes_count, comments_count, share_count, created_at,
  profiles:user_id (username, display_name, profile_pic)
`;

export async function createPost(data: Partial<Post>): Promise<ApiResult<{ id: string }>> {
  return dataClient.from('posts').insert(data).select('id').single();
}

export async function createPostReturnAll(data: Partial<Post>): Promise<ApiResult<Post>> {
  return dataClient.from('posts').insert([data]).select().single() as Promise<ApiResult<Post>>;
}

export async function createPosts(data: Partial<Post>[]): Promise<ApiResult<Post[]>> {
  return dataClient.from('posts').insert(data) as Promise<ApiResult<Post[]>>;
}

export async function getPostById(id: string): Promise<ApiResult<Post>> {
  return dataClient.from('posts').select(POST_SELECT_FULL).eq('id', id).maybeSingle() as Promise<ApiResult<Post>>;
}

export async function getPostByIdBasic(id: string): Promise<ApiResult<Post>> {
  return dataClient.from('posts').select(POST_SELECT_BASIC).eq('id', id).maybeSingle() as Promise<ApiResult<Post>>;
}

export async function getPostByIdSingle(id: string): Promise<ApiResult<Post>> {
  return dataClient.from('posts').select('*').eq('id', id).single() as Promise<ApiResult<Post>>;
}

function feedError(message: string, code: FeedErrorCode): FeedTimelineResult['error'] {
  return { message, code };
}

function errorCodeFromBody(value: unknown): string | null {
  if (value && typeof value === 'object' && typeof (value as { code?: unknown }).code === 'string') {
    return (value as { code: string }).code;
  }
  return null;
}

function classifyEdgeError(status: number, code: string | null): FeedErrorCode {
  if (status === 401 || code === 'AUTH_REQUIRED') return 'AUTH_REQUIRED';
  if (status === 403 || code === 'RLS_DENIED') return 'RLS_DENIED';
  if (status === 503 || status === 404 || code === 'FEED_ROUTE_MISSING') return 'FEED_ROUTE_MISSING';
  if (code === 'FEED_ROUTE_AMBIGUOUS') return 'FEED_ROUTE_AMBIGUOUS';
  return 'QUERY_FAILED';
}

function classifyDirectError(error: { code?: string; configCode?: string; message?: string }): FeedErrorCode {
  const routingCode = error.configCode ?? error.code;
  if (routingCode === 'AMBIGUOUS_ROUTE') return 'FEED_ROUTE_AMBIGUOUS';
  if (
    routingCode === 'DOMAIN_NOT_FOUND' ||
    routingCode === 'PROJECT_NOT_FOUND' ||
    routingCode === 'INVALID_CONFIG'
  ) return 'FEED_ROUTE_MISSING';
  if (/jwt|session|auth/i.test(error.message ?? '')) return 'AUTH_REQUIRED';
  if (/permission denied|row-level security|rls/i.test(error.message ?? '')) return 'RLS_DENIED';
  return 'QUERY_FAILED';
}

/**
 * Authenticated feed read.
 *
 * The central Auth project is the identity provider, but its JWTs are NOT
 * accepted by the posts project (verified: 401 PGRST301 "No suitable key or
 * wrong key type"). Sending that JWT directly to `posts` therefore made every
 * signed-in feed read fail. This is a genuine cross-project trusted operation,
 * so it goes through one narrowly scoped Edge Function: the function verifies
 * the central JWT, reads the registered posts project with a Function-only
 * service key and applies the same visibility matrix server-side.
 *
 * Guests never have a central JWT. Their public feed stays a direct, anon-key
 * read of the posts project, where RLS is authoritative. In both cases paging
 * happens on the server with a stable `(created_at, id)` keyset cursor: no
 * OFFSET and no silent 500-row truncation.
 */
export async function getFeedTimeline(
  options: FeedTimelineRequest = {}
): Promise<FeedTimelineResult> {
  const limit = options.limit ?? DEFAULT_FEED_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_FEED_LIMIT) {
    return {
      data: null,
      error: feedError('Invalid feed page size', 'QUERY_FAILED'),
      feedErrorCode: 'QUERY_FAILED',
    };
  }
  const cursor = options.cursor ?? null;
  let token: string | null;
  try {
    token = await getAccessToken();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const code: FeedErrorCode = /infrastructure|registry|not configured/i.test(message)
      ? 'FEED_ROUTE_MISSING'
      : 'AUTH_REQUIRED';
    return {
      data: null,
      error: feedError(code === 'FEED_ROUTE_MISSING'
        ? 'Feed routing is not configured'
        : 'Authentication is unavailable', code),
      feedErrorCode: code,
    };
  }

  if (!token) {
    let query = dataClient
      .from('posts')
      .select(POST_SELECT_FULL)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);
    if (cursor) query = query.or(cursorFilter(cursor));
    const result = await query as ApiResult<Post[]>;
    if (result.error) {
      const code = classifyDirectError(result.error);
      return { ...result, feedErrorCode: code };
    }
    const rows = result.data ?? [];
    const hasMore = rows.length > limit;
    const posts = rows.slice(0, limit);
    return {
      data: posts,
      error: null,
      rawCount: posts.length,
      visibleCount: posts.length,
      hasMore,
      nextCursor: hasMore ? nextCursorOf(posts) : null,
    };
  }

  const url = getEdgeFunctionUrl('feedTimeline');
  if (!url) {
    return {
      data: null,
      error: feedError('Feed routing is not configured', 'FEED_ROUTE_MISSING'),
      feedErrorCode: 'FEED_ROUTE_MISSING',
    };
  }

  const body: Record<string, unknown> = {};
  if (cursor) body.cursor = cursor;
  body.limit = limit;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({})) as {
      data?: FeedTimelineEnvelope | null;
      error?: unknown;
    };
    if (!response.ok || payload.error) {
      const bodyCode = errorCodeFromBody(payload.error);
      const code = classifyEdgeError(response.status, bodyCode);
      return {
        data: null,
        error: feedError(
          code === 'AUTH_REQUIRED' ? 'Your session has expired. Sign in again.'
            : code === 'FEED_ROUTE_MISSING' ? 'Feed routing is not configured.'
            : code === 'FEED_ROUTE_AMBIGUOUS' ? 'Feed routing is ambiguous.'
            : code === 'RLS_DENIED' ? 'Posts are not available to this account.'
            : 'The feed query failed.',
          code
        ),
        feedErrorCode: code,
      };
    }

    const envelope = payload.data;
    if (
      !envelope || !Array.isArray(envelope.posts) ||
      typeof envelope.hasMore !== 'boolean' ||
      (envelope.hasMore && !envelope.nextCursor) ||
      (envelope.nextCursor !== null && (
        !envelope.nextCursor ||
        typeof envelope.nextCursor.created_at !== 'string' ||
        typeof envelope.nextCursor.id !== 'string'
      ))
    ) {
      return {
        data: null,
        error: feedError('The feed query returned an invalid response', 'QUERY_FAILED'),
        feedErrorCode: 'QUERY_FAILED',
      };
    }
    return {
      data: envelope.posts,
      error: null,
      rawCount: envelope.rawCount,
      visibleCount: envelope.visibleCount,
      hasMore: envelope.hasMore,
      nextCursor: envelope.nextCursor,
    };
  } catch {
    // Never echo the URL, the token or the underlying error to the caller.
    return {
      data: null,
      error: feedError('The feed query failed', 'QUERY_FAILED'),
      feedErrorCode: 'QUERY_FAILED',
    };
  }
}

export async function getUserPosts(userId: string): Promise<ApiResult<Post[]>> {
  return dataClient.from('posts').select(POST_SELECT_BASIC).eq('user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<Post[]>>;
}

export async function getExplorePosts(offset: number, limit: number): Promise<ApiResult<Post[]>> {
  return dataClient.from('posts').select(`
    *,
    profiles!posts_user_id_fkey (username, display_name, profile_pic),
    likes (count),
    comments (count)
  `).not('media_url', 'is', null).order('created_at', { ascending: false }).range(offset, offset + limit - 1) as Promise<ApiResult<Post[]>>;
}

export async function getPostsByHashtag(postIds: string[]): Promise<ApiResult<Post[]>> {
  return dataClient.from('posts').select(POST_SELECT_BASIC).in('id', postIds).eq('status', 'published').order('created_at', { ascending: false }) as Promise<ApiResult<Post[]>>;
}

export async function getMentionsPosts(postIds: string[]): Promise<ApiResult<Post[]>> {
  return dataClient.from('posts').select('id, content, user_id, created_at').in('id', postIds) as Promise<ApiResult<Post[]>>;
}

export async function getReelById(id: string): Promise<ApiResult<Post>> {
  return dataClient.from('posts').select(POST_SELECT_REEL).eq('id', id).single() as Promise<ApiResult<Post>>;
}

export async function getReels(limit: number = 10, cursor?: string): Promise<ApiResult<Post[]>> {
  let query = dataClient.from('posts').select(POST_SELECT_REEL)
    .eq('type', 'reel')
    .eq('status', 'published')
    .not('media_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (cursor) query = query.lt('created_at', cursor);
  return query as Promise<ApiResult<Post[]>>;
}

export async function getHorizontalReels(limit: number = 10): Promise<ApiResult<Post[]>> {
  return dataClient.from('posts').select(`
    id, user_id, media_url, media_type, duration, content, likes_count, comments_count, created_at,
    profiles:user_id (username, display_name, profile_pic)
  `).eq('status', 'published').eq('media_type', 'video').not('media_url', 'is', null).order('created_at', { ascending: false }).limit(limit) as Promise<ApiResult<Post[]>>;
}

export async function getReelIds(): Promise<ApiResult<{ id: string }[]>> {
  return dataClient.from('posts').select('id').eq('type', 'reel').order('created_at', { ascending: false }).limit(100) as Promise<ApiResult<{ id: string }[]>>;
}

export async function getReelCounts(id: string): Promise<ApiResult<{ likes_count: number; comments_count: number; share_count: number }>> {
  return dataClient.from('posts').select('likes_count, comments_count, share_count').eq('id', id).single() as Promise<ApiResult<{ likes_count: number; comments_count: number; share_count: number }>>;
}

export async function getReelMedia(id: string): Promise<ApiResult<{ media_url: string; media_type: string; thumbnail: string | null }>> {
  return dataClient.from('posts').select('media_url, media_type, thumbnail').eq('id', id).single() as Promise<ApiResult<{ media_url: string; media_type: string; thumbnail: string | null }>>;
}

export async function getReelShareCounts(id: string): Promise<ApiResult<{ share_count: number; shares_count: number }>> {
  return dataClient.from('posts').select('share_count, shares_count').eq('id', id).single() as Promise<ApiResult<{ share_count: number; shares_count: number }>>;
}

export async function getReelOwnerId(id: string): Promise<ApiResult<{ user_id: string }>> {
  return dataClient.from('posts').select('user_id').eq('id', id).maybeSingle() as Promise<ApiResult<{ user_id: string }>>;
}

export async function getScheduledPosts(userId: string): Promise<ApiResult<Post[]>> {
  return dataClient.from('posts').select(POST_SELECT_BASIC).eq('user_id', userId).eq('status', 'scheduled').order('scheduled_at', { ascending: true }) as Promise<ApiResult<Post[]>>;
}

export async function getUserPhotos(userId: string): Promise<ApiResult<{ media_url: string }[]>> {
  return dataClient.from('posts').select('media_url').eq('user_id', userId).not('media_url', 'is', null).order('created_at', { ascending: false }) as Promise<ApiResult<{ media_url: string }[]>>;
}

export async function updatePost(id: string, data: Partial<Post>): Promise<ApiResult<null>> {
  return dataClient.from('posts').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function updatePostReturnAll(id: string, data: Partial<Post>): Promise<ApiResult<Post>> {
  return dataClient.from('posts').update(data).eq('id', id).select().single() as Promise<ApiResult<Post>>;
}

export async function deletePost(id: string): Promise<ApiResult<null>> {
  return dataClient.from('posts').delete().eq('id', id) as Promise<ApiResult<null>>;
}
