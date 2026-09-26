// Profile content, one item per request (do.md "Profile content pages").
//
// The four Profile sections — Posts, Photos, Reels, Shared — are four views of
// the one `posts` table. They used to be four client-side filters over a single
// `getUserPosts()` call that downloaded the author's ENTIRE history, so opening
// a profile cost the same as reading the whole thing no matter how much of it
// the visitor would ever see.
//
// This module talks to the Gateway's paginated, authorization-gated
// `GET /api/profiles/:id/content` instead, which serves one item per request
// with a `(created_at, id)` cursor and never returns a row the viewer is not
// allowed to read.
//
// DEPLOYMENT ORDER. The endpoint is newer than some deployed Gateway builds, so
// until the Gateway carrying it is live every request would 404. Rather than
// ship a broken Profile page, `endpointAvailable` latches off on a 404/405 and
// the reader transparently falls back to the old whole-table read, sliced
// in memory. The fallback is honest about itself: it cannot honour "one request
// = one item" (the generic read has no `limit`), it just keeps the page working.
// Once the Gateway is deployed the next page load takes the cursor path and the
// fallback is never touched again.
import { API_URL } from './client';
import type { ApiResult } from './client';
import { getUserPosts } from './posts';

export type ProfileContentKind = 'posts' | 'photos' | 'reels' | 'shared';

export interface ProfileContentAuthor {
  username: string;
  display_name: string;
  profile_pic: string | null;
}

export interface ProfileContentSharedPost {
  id: string;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  type: string | null;
  created_at: string | null;
  profiles: ProfileContentAuthor;
}

export type ProfileContentPostType =
  | 'normal_post'
  | 'profile_picture_update'
  | 'cover_photo_update'
  | 'shared_post'
  | 'reel';

/** The `type` values the Post card and the section filters understand. */
const POST_TYPES: ReadonlySet<string> = new Set<ProfileContentPostType>([
  'normal_post',
  'profile_picture_update',
  'cover_photo_update',
  'shared_post',
  'reel',
]);

export interface ProfileContentPost {
  id: string;
  user_id: string;
  content: string | null;
  media_url: string | null;
  media_type?: 'image' | 'video' | null;
  created_at: string;
  type: ProfileContentPostType;
  shared_post_id?: string | null;
  audience_type?: string | null;
  audience_user_ids?: string[] | null;
  audience_excluded_user_ids?: string[] | null;
  visibility?: string | null;
  profiles: ProfileContentAuthor;
  shared_post: ProfileContentSharedPost | null;
}

export interface ProfileContentPage {
  items: ProfileContentPost[];
  /** False once the feed is exhausted; the caller must stop asking. */
  has_more: boolean;
  /** Opaque. `null` means "start from the newest". */
  next_cursor: string | null;
  /** True when served by the whole-table fallback rather than the Gateway cursor. */
  degraded: boolean;
}

const KIND_PARAM: Record<ProfileContentKind, string> = {
  posts: 'posts',
  photos: 'photos',
  reels: 'reels',
  shared: 'shared',
};

/** Same session read every other dedicated-endpoint caller uses. */
function getAccessToken(): string | null {
  try {
    const sessionStr = localStorage.getItem('tone-auth-token');
    if (sessionStr) {
      const session = JSON.parse(sessionStr);
      return typeof session?.access_token === 'string' ? session.access_token : null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Latched off the first time the Gateway answers 404/405 for the content route.
 * A transport error or a 500 does NOT latch: those are worth retrying.
 */
let endpointAvailable: boolean | null = null;

/** Test seam: forget the probe so a suite can exercise both transports. */
export function resetProfileContentEndpointProbe(): void {
  endpointAvailable = null;
}

export function isProfileContentEndpointAvailable(): boolean | null {
  return endpointAvailable;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function toAuthor(value: unknown): ProfileContentAuthor {
  const row = isRecord(value) ? value : {};
  return {
    username: typeof row.username === 'string' ? row.username : 'unknown',
    display_name: typeof row.display_name === 'string' ? row.display_name : 'Unknown user',
    profile_pic: typeof row.profile_pic === 'string' ? row.profile_pic : null,
  };
}

function toSharedPost(value: unknown): ProfileContentSharedPost | null {
  if (!isRecord(value)) return null;
  return {
    id: String(value.id ?? ''),
    content: typeof value.content === 'string' ? value.content : null,
    media_url: typeof value.media_url === 'string' ? value.media_url : null,
    media_type: typeof value.media_type === 'string' ? value.media_type : null,
    type: typeof value.type === 'string' ? value.type : null,
    created_at: typeof value.created_at === 'string' ? value.created_at : null,
    profiles: toAuthor(value.profiles),
  };
}

function toItem(value: unknown): ProfileContentPost | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  const rawType = typeof value.type === 'string' ? value.type : '';
  return {
    ...(value as unknown as ProfileContentPost),
    // An unrecognised type is treated as a plain post rather than dropped: the
    // section filters key off `type`, and a row the visitor is allowed to read
    // should not disappear because the server grew a new kind.
    type: POST_TYPES.has(rawType) ? (rawType as ProfileContentPostType) : 'normal_post',
    profiles: toAuthor(value.profiles),
    shared_post: toSharedPost(value.shared_post),
  };
}

function errorResult(message: string, code?: string): ApiResult<ProfileContentPage> {
  return { data: null, error: { message, code } };
}

async function fetchFromGateway(
  profileId: string,
  kind: ProfileContentKind,
  cursor: string | null,
  limit: number,
  signal?: AbortSignal
): Promise<ApiResult<ProfileContentPage> & { missing?: boolean }> {
  const base = API_URL || '';
  if (!base) return errorResult('VITE_API_GATEWAY_URL not configured');

  const params = new URLSearchParams({ kind: KIND_PARAM[kind], limit: String(limit) });
  if (cursor) params.set('cursor', cursor);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${base}/api/profiles/${encodeURIComponent(profileId)}/content?${params.toString()}`, {
      method: 'GET',
      headers,
      cache: 'no-store',
      signal,
    });
  } catch (err) {
    return errorResult(String(err));
  }

  if (res.status === 404 || res.status === 405) {
    return { data: null, error: null, missing: true };
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message =
      (isRecord(body) && (body.message || body.error) ? String(body.message || body.error) : '') ||
      res.statusText ||
      `Profile content request failed (${res.status})`;
    return errorResult(message, String(res.status));
  }

  const json = await res.json();
  const rawItems = isRecord(json) && Array.isArray(json.items) ? json.items : [];
  const items = rawItems.map(toItem).filter((item): item is ProfileContentPost => item !== null);
  return {
    data: {
      items,
      has_more: isRecord(json) && json.has_more === true,
      next_cursor: isRecord(json) && typeof json.next_cursor === 'string' ? json.next_cursor : null,
      degraded: false,
    },
    error: null,
  };
}

/**
 * Compatibility path for a Gateway that predates the content route: one whole
 * table read, then a slice. It preserves the *behaviour* (the section shows the
 * right items, ordered, with no duplicates) but not the request shape, because
 * the generic read ignores `limit` — see the note at the top of this file.
 */
async function fetchFallback(
  profileId: string,
  kind: ProfileContentKind,
  cursor: string | null,
  limit: number
): Promise<ApiResult<ProfileContentPage>> {
  const { data, error } = await getUserPosts(profileId);
  if (error) return errorResult(error.message, error.code);
  const all = (data || []) as unknown as ProfileContentPost[];
  const filtered = all.filter((post) => {
    switch (kind) {
      case 'photos':
        return post.media_type === 'image';
      case 'reels':
        return post.type === 'reel';
      case 'shared':
        return post.type === 'shared_post' || !!post.shared_post_id;
      default:
        return true;
    }
  });
  // The offset is carried in the cursor so the caller keeps one code path.
  const offset = cursor ? Number.parseInt(atob(cursor), 10) || 0 : 0;
  const items = filtered.slice(offset, offset + limit);
  const next = offset + items.length;
  return {
    data: {
      items,
      has_more: next < filtered.length,
      next_cursor: next < filtered.length ? btoa(String(next)) : null,
      degraded: true,
    },
    error: null,
  };
}

/**
 * The next page of a profile section. `limit` defaults to 1: the Profile
 * infinite scroll asks for exactly one item per scroll, so a request never
 * transfers more than the visitor is about to see.
 */
export async function getProfileContentPage(
  profileId: string,
  kind: ProfileContentKind,
  options: { cursor?: string | null; limit?: number; signal?: AbortSignal } = {}
): Promise<ApiResult<ProfileContentPage>> {
  if (!profileId) return errorResult('A profile id is required');
  const limit = Math.max(1, Math.min(20, Math.floor(options.limit ?? 1)));
  const cursor = options.cursor ?? null;

  if (endpointAvailable !== false) {
    const result = await fetchFromGateway(profileId, kind, cursor, limit, options.signal);
    if (!result.missing) {
      endpointAvailable = true;
      return result as ApiResult<ProfileContentPage>;
    }
    // The route is not deployed yet. Latch and use the fallback from now on.
    endpointAvailable = false;
    console.warn(
      '[profile-content] Gateway content route unavailable; falling back to the whole-table read. ' +
        'Deploy the Gateway to switch Profile paging to one item per request.'
    );
  }

  return fetchFallback(profileId, kind, cursor, limit);
}
