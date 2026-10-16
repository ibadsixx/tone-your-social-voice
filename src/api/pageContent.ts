// Page content adapter for the shared profile content feed.
//
// A Page's posts live in the `page_posts` link table (page_id -> post_id); the
// posts themselves are rows in `posts` authored by the page admin's user
// account. The personal profile feed (`api/profileContent.ts`) is keyed on a
// single author id and therefore cannot serve a Page as-is.
//
// Rather than build a second feed, this module implements the SAME
// `ProfileContentFetcher` contract the personal profile feed uses, so
// `ProfileContentSection` / `FilteredPostsLayout` / `ProfileTabs` render a page
// feed without any conditional styling. The page identity is stamped onto every
// item so the shared `Post` card shows the page (and links to `/pages/:id`)
// exactly as it does on the page's own composer feed.
//
// Everything is read through the central Gateway client (never Supabase
// directly). A page's post set is bounded and small, so the whole set is
// resolved in one adapter pass and returned with `has_more: false`; the feed
// component's cursor contract is still honoured (it just completes in a single
// request), which keeps the page and the profile on one code path.

import { gateway } from '@/lib/gateway';
import type { ApiResult } from './client';
import type {
  ProfileContentFetcher,
  ProfileContentKind,
  ProfileContentPage,
  ProfileContentPost,
  ProfileContentAuthor,
} from './profileContent';

export interface PageContentPageIdentity {
  id: string;
  name: string;
  cover_image: string | null;
  profile_pic?: string | null;
}

/** Post types the shared `Post` card and the section filters understand. */
const KNOWN_POST_TYPES = new Set([
  'normal_post',
  'profile_picture_update',
  'cover_photo_update',
  'shared_post',
  'reel',
]);

/** The post types the Photos section excludes (mirrors lib/profilePhotos.ts). */
const NON_PHOTO_POST_TYPES = new Set([
  'reel',
  'shared_post',
  'profile_picture_update',
  'cover_photo_update',
]);

/** PostgREST `in(...)` lists are URL parameters; keep each request bounded. */
const ID_CHUNK = 100;

function chunk<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

function matchesKind(item: ProfileContentPost, kind: ProfileContentKind): boolean {
  const type = item.type ?? '';
  switch (kind) {
    case 'photos':
      // INCLUSIVE: a null `media_type` with an image URL is still a photo, and a
      // null `type` is not one of the excluded chrome types.
      return !!item.media_url && !NON_PHOTO_POST_TYPES.has(type);
    case 'reels':
      return type === 'reel' && !!item.media_url;
    case 'shared':
      return type === 'shared_post' || !!item.shared_post_id;
    case 'posts':
    default:
      return true;
  }
}

function compareNewestFirst(a: ProfileContentPost, b: ProfileContentPost): number {
  const ta = a.created_at || '';
  const tb = b.created_at || '';
  if (ta !== tb) return ta < tb ? 1 : -1;
  return a.id < b.id ? 1 : a.id === b.id ? 0 : -1;
}

function toAuthor(row: Record<string, unknown> | null | undefined): ProfileContentAuthor {
  return {
    username: typeof row?.username === 'string' ? row.username : 'unknown',
    display_name: typeof row?.display_name === 'string' ? row.display_name : 'Unknown user',
    profile_pic: typeof row?.profile_pic === 'string' ? row.profile_pic : null,
  };
}

/**
 * Build a stable fetcher for one Page. The returned function matches
 * `ProfileContentFetcher`, so it drops straight into the personal-profile feed
 * components; `cursor`/`limit` are accepted for contract compatibility and the
 * whole (bounded) page set is returned in one pass.
 */
export function createPageContentFetcher(
  page: PageContentPageIdentity
): ProfileContentFetcher {
  return async (kind): Promise<ApiResult<ProfileContentPage>> => {
    if (!page?.id) {
      return { data: null, error: { message: 'A page id is required' } };
    }

    try {
      // 1. The post ids linked to this page.
      const { data: links, error: linksError } = await gateway
        .from('page_posts')
        .select('*')
        .eq('page_id', page.id);

      if (linksError) {
        return { data: null, error: { message: linksError.message, code: linksError.code } };
      }

      const postIds = [
        ...new Set(
          ((links as unknown as Array<{ post_id?: string }> | null) || [])
            .map((row) => row?.post_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
        ),
      ];
      if (postIds.length === 0) {
        return { data: { items: [], has_more: false, next_cursor: null, degraded: false }, error: null };
      }

      // 2. The posts themselves.
      const postRows: Array<Record<string, unknown>> = [];
      for (const ids of chunk(postIds, ID_CHUNK)) {
        const { data: posts, error: postsError } = await gateway
          .from('posts')
          .select('*')
          .in('id', ids);
        if (postsError) {
          return { data: null, error: { message: postsError.message, code: postsError.code } };
        }
        for (const row of (posts as unknown as Array<Record<string, unknown>> | null) || []) {
          postRows.push(row);
        }
      }

      // 3. Authors, so the card can render the page admin as the author while
      //    the page identity is what is actually shown.
      const authorIds = [
        ...new Set(
          postRows
            .map((row) => row.user_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
        ),
      ];
      const authors = new Map<string, ProfileContentAuthor>();
      for (const ids of chunk(authorIds, ID_CHUNK)) {
        const { data: profiles } = await gateway
          .from('profiles')
          .select('id, username, display_name, profile_pic')
          .in('id', ids);
        for (const prof of (profiles as unknown as Array<Record<string, unknown>> | null) || []) {
          const id = typeof prof.id === 'string' ? prof.id : null;
          if (id) authors.set(id, toAuthor(prof));
        }
      }

      const items: ProfileContentPost[] = postRows
        .map((row) => {
          const rawType = typeof row.type === 'string' ? row.type : '';
          const owner = typeof row.user_id === 'string' ? row.user_id : null;
          const item = {
            ...(row as unknown as ProfileContentPost),
            type: (KNOWN_POST_TYPES.has(rawType) ? rawType : 'normal_post') as ProfileContentPost['type'],
            profiles: (owner ? authors.get(owner) : null) ?? toAuthor(null),
            shared_post: null,
            // The owning Page, so the shared Post card renders the page.
            page: {
              id: page.id,
              name: page.name,
              cover_image: page.cover_image,
              profile_pic: page.profile_pic ?? null,
            },
          };
          return item;
        })
        .filter((item) => typeof item.id === 'string' && item.id.length > 0 && matchesKind(item, kind))
        .sort(compareNewestFirst);

      return {
        data: { items, has_more: false, next_cursor: null, degraded: false },
        error: null,
      };
    } catch (err) {
      return {
        data: null,
        error: { message: err instanceof Error ? err.message : String(err) },
      };
    }
  };
}
