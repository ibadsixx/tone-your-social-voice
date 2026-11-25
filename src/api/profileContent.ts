// Profile content, one item per request (do.md "Profile content pages").
//
// The four Profile sections — Posts, Photos, Reels, Shared — are four views of
// the one `posts` table. They used to be four client-side filters over a single
// `getUserPosts()` call that downloaded the author's ENTIRE history, so opening
// a profile cost the same as reading the whole thing no matter how much of it
// the visitor would ever see.
//
// Paged profile content is served by the `profileContent` Edge Function, which
// verifies the viewer's central Auth JWT and applies the same visibility rules
// as the `posts` project before returning a cursor page. The frontend holds no
// privileged credentials and never reads another viewer's private rows directly.
import type { ApiResult } from '@/lib/supabase/dataClient';
import { callEdgeFunction } from '@/lib/supabase/crossProject';
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
  /** Present when the original post was published as a Page. */
  page?: {
    id: string;
    name: string;
    cover_image: string | null;
    profile_pic?: string | null;
  } | null;
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
  /**
   * Set only for Page content: the owning Page, so the shared `Post` card
   * renders the page identity (and links to `/pages/:id`) exactly as it does on
   * the page's own feed.
   */
  page?: { id: string; name: string; cover_image: string | null; profile_pic?: string | null } | null;
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

/**
 * The shape of the paged reader a content section consumes. The personal
 * profile uses `getProfileContentPage`; a Page supplies its own adapter (see
 * `api/pageContent.ts`) so it can reuse the very same section/feed component
 * over the `page_posts` link table instead of a second feed implementation.
 */
export type ProfileContentFetcher = (
  kind: ProfileContentKind,
  cursor: string | null,
  limit: number,
  signal?: AbortSignal
) => Promise<ApiResult<ProfileContentPage>>;

const KIND_PARAM: Record<ProfileContentKind, string> = {
  posts: 'posts',
  photos: 'photos',
  reels: 'reels',
  shared: 'shared',
};

/**
 * Latched off if the Edge Function is not yet deployed. A transport error or a
 * 500 does NOT latch: those are worth retrying. The fallback is a direct
 * Supabase read, not a Gateway fallback.
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

async function fetchFromFunction(
  profileId: string,
  kind: ProfileContentKind,
  cursor: string | null,
  limit: number
): Promise<ApiResult<ProfileContentPage>> {
  const result = await callEdgeFunction<
    { profileId: string; kind: string; cursor: string | null; limit: number },
    { items: unknown[]; has_more: boolean; next_cursor: string | null }
  >('profileContent', {
    profileId,
    kind: KIND_PARAM[kind],
    cursor,
    limit,
  });

  if (result.error) return errorResult(result.error.message);
  const json = result.data;
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
 * Compatibility path when the Edge Function is unavailable: one direct
 * Supabase read, then a slice. It preserves the section behaviour (ordered,
 * de-duplicated items) but not the one-item-per-request shape.
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
    try {
      const result = await fetchFromFunction(profileId, kind, cursor, limit);
      if (!result.error) {
        endpointAvailable = true;
        return result;
      }
      // A missing deployment (404) latches off; other errors are returned so a
      // transient function failure is not mistaken for absent configuration.
      if (!/status 404|not found/i.test(result.error.message)) return result;
    } catch {
      // Transport errors are retried on the next request.
    }
    endpointAvailable = false;
  }

  return fetchFallback(profileId, kind, cursor, limit);
}
