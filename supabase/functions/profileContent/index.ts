// One item per request: paged Profile content for Posts / Photos / Reels / Shared.
//
// The four sections are views of the one `posts` table. This function owns a
// strict (created_at, id) keyset read so a new post at the head cannot shift the
// window, applies the canonical post-visibility predicate server-side (the
// posts project is read with service role), and returns only the projection the
// feed cards need. Whole batches that the viewer may not read are skipped with
// an advanced cursor rather than starving the page or leaking a private row.
//
// Function secrets: CENTRAL_AUTH_URL, CENTRAL_AUTH_ANON_KEY,
// POSTS_PROJECT_URL, POSTS_SERVICE_ROLE_KEY,
// PROFILES_PROJECT_URL, PROFILES_SERVICE_ROLE_KEY,
// FRIENDS_PROJECT_URL, FRIENDS_SERVICE_ROLE_KEY,
// PAGE_POSTS_PROJECT_URL, PAGE_POSTS_SERVICE_ROLE_KEY (optional: when absent,
// page-owned posts are not excluded from a personal profile).
//
// Assumed tables/columns (confirm externally):
//   posts(id, user_id, type, media_type, shared_post_id, created_at,
//         audience_type, visibility, status, audience_user_ids,
//         audience_excluded_user_ids, content, media_url)
//   profiles(id, username, display_name, profile_pic)
//   friendships(requester_id, receiver_id, status), page_posts(post_id)

import { corsHeaders, serviceClient } from '../_shared/crossProject.ts';
import {
  assertFields,
  badRequest,
  boundedInt,
  handleRequest,
  oneOf,
  optionalText,
  quoteFilterValue,
  requireUuid,
  type VerifiedContext,
  viewerFriendIds,
} from '../_shared/operation.ts';
import { canViewerViewPost, type PostRow } from '../_shared/postVisibility.ts';

type Client = ReturnType<typeof serviceClient>;
type Kind = 'posts' | 'photos' | 'reels' | 'shared';
const KINDS = ['posts', 'photos', 'reels', 'shared'] as const;
const SCAN_BATCH = 12;
const MAX_SKIP_ROUNDS = 8;
const MAX_CURSOR_LENGTH = 512;

interface Cursor { createdAt: string; id: string }
interface Author { username: string; display_name: string; profile_pic: string | null }

function posts(): Client {
  return serviceClient('POSTS_PROJECT_URL', 'POSTS_SERVICE_ROLE_KEY');
}
function profiles(): Client {
  return serviceClient('PROFILES_PROJECT_URL', 'PROFILES_SERVICE_ROLE_KEY');
}
function friends(): Client {
  return serviceClient('FRIENDS_PROJECT_URL', 'FRIENDS_SERVICE_ROLE_KEY');
}
function pagePosts(): Client | null {
  const url = Deno.env.get('PAGE_POSTS_PROJECT_URL');
  const key = Deno.env.get('PAGE_POSTS_SERVICE_ROLE_KEY');
  return url && key ? serviceClient('PAGE_POSTS_PROJECT_URL', 'PAGE_POSTS_SERVICE_ROLE_KEY') : null;
}

function privateOk(data: unknown): Response {
  return new Response(JSON.stringify({ data, error: null }), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store, max-age=0',
      Vary: 'Authorization',
    },
  });
}

function encodeCursor(row: PostRow): string | null {
  const createdAt = typeof row.created_at === 'string' ? row.created_at : null;
  const id = typeof row.id === 'string' ? row.id : null;
  if (!createdAt || !id) return null;
  const bytes = new TextEncoder().encode(`${createdAt}|${id}`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeCursor(value: string | null): Cursor | null {
  if (!value || value.length > MAX_CURSOR_LENGTH) return null;
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(normalized + '='.repeat((4 - (normalized.length % 4)) % 4));
    const decoded = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    const separator = decoded.indexOf('|');
    if (separator <= 0 || separator === decoded.length - 1) return null;
    const createdAt = decoded.slice(0, separator);
    const id = decoded.slice(separator + 1);
    if (!/^\d{4}-\d{2}-\d{2}T/.test(createdAt) || Number.isNaN(Date.parse(createdAt))) return null;
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) return null;
    return { createdAt, id };
  } catch {
    return null; // a malformed cursor means "start at the top", never an error
  }
}

function compareNewestFirst(a: PostRow, b: PostRow): number {
  const ta = typeof a.created_at === 'string' ? a.created_at : '';
  const tb = typeof b.created_at === 'string' ? b.created_at : '';
  if (ta !== tb) return ta < tb ? 1 : -1;
  const ia = typeof a.id === 'string' ? a.id : '';
  const ib = typeof b.id === 'string' ? b.id : '';
  return ia === ib ? 0 : ia < ib ? 1 : -1;
}

function applyKind(query: any, kind: Kind): any {
  switch (kind) {
    case 'photos':
      return query
        .not('media_url', 'is', null)
        .or('type.is.null,and(type.neq.reel,type.neq.shared_post,type.neq.profile_picture_update,type.neq.cover_photo_update)');
    case 'reels':
      return query.eq('type', 'reel').not('media_url', 'is', null);
    case 'shared':
      return query.or('type.eq.shared_post,shared_post_id.not.is.null');
    default:
      return query;
  }
}

async function readRound(profileId: string, kind: Kind, cursor: Cursor | null): Promise<{ rows: PostRow[]; capped: boolean }> {
  let query = applyKind(posts().from('posts').select('*'), kind).eq('user_id', profileId);
  if (cursor) {
    const timestamp = quoteFilterValue(cursor.createdAt);
    query = query.or(
      `created_at.lt.${timestamp},and(created_at.eq.${timestamp},id.lt.${cursor.id})`
    );
  }
  const { data, error } = await query.order('created_at', { ascending: false }).limit(SCAN_BATCH);
  if (error) throw error;
  const byId = new Map<string, PostRow>();
  for (const row of (data ?? []) as PostRow[]) {
    if (typeof row.id === 'string' && !byId.has(row.id)) byId.set(row.id, row);
  }
  return {
    rows: [...byId.values()].sort(compareNewestFirst),
    capped: (data ?? []).length >= SCAN_BATCH,
  };
}

async function readAuthors(ids: string[]): Promise<Map<string, Author>> {
  const unique = [...new Set(ids)].slice(0, 200);
  const found = new Map<string, Author>();
  if (unique.length === 0) return found;
  const { data, error } = await profiles()
    .from('profiles')
    .select('id, username, display_name, profile_pic')
    .in('id', unique);
  if (error) throw error;
  for (const row of data ?? []) {
    found.set(row.id, {
      username: row.username ?? 'unknown',
      display_name: row.display_name ?? 'Unknown user',
      profile_pic: row.profile_pic ?? null,
    });
  }
  return found;
}

async function pageLinkedIds(rows: PostRow[]): Promise<Set<string>> {
  const client = pagePosts();
  const ids = rows.map((row) => row.id).filter((id): id is string => typeof id === 'string');
  if (!client || ids.length === 0) return new Set();
  const { data, error } = await client.from('page_posts').select('post_id').in('post_id', ids);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.post_id).filter((id): id is string => typeof id === 'string'));
}

async function enrichShared(
  items: PostRow[],
  viewerId: string,
  friendIds: Set<string>
): Promise<void> {
  const targets = items
    .map((item) => (typeof item.shared_post_id === 'string' ? item.shared_post_id : null))
    .filter((id): id is string => id !== null);
  if (targets.length === 0) {
    for (const item of items) item.shared_post = null;
    return;
  }
  const { data, error } = await posts().from('posts').select('*').in('id', [...new Set(targets)]);
  if (error) throw error;
  const byId = new Map((data ?? []).map((row) => [row.id, row as PostRow]));
  const authorIds = (data ?? [])
    .map((row) => row.user_id)
    .filter((id): id is string => typeof id === 'string');
  const authors = await readAuthors(authorIds);

  for (const item of items) {
    const shared = typeof item.shared_post_id === 'string' ? byId.get(item.shared_post_id) : undefined;
    // The shared post is authorized with the same predicate as a top-level row.
    if (!shared || !canViewerViewPost(shared, viewerId, friendIds)) {
      item.shared_post = null;
      continue;
    }
    const owner = typeof shared.user_id === 'string' ? shared.user_id : '';
    item.shared_post = {
      id: shared.id,
      content: shared.content ?? null,
      media_url: shared.media_url ?? null,
      media_type: shared.media_type ?? null,
      type: shared.type ?? null,
      created_at: shared.created_at ?? null,
      profiles: authors.get(owner) ?? { username: 'unknown', display_name: 'Unknown user', profile_pic: null },
    };
  }
}

Deno.serve((req) => handleRequest(req, ['POST'], async (ctx: VerifiedContext) => {
  assertFields(ctx.body, ['profileId', 'kind', 'cursor', 'limit']);
  const profileId = requireUuid(ctx.body.profileId, 'profileId');
  const kind = oneOf(ctx.body.kind, 'kind', KINDS);
  const limit = boundedInt(ctx.body.limit, 'limit', 1, 20, 1);
  const cursor = decodeCursor(optionalText(ctx.body.cursor, 'cursor', MAX_CURSOR_LENGTH));

  const friendIds = await viewerFriendIds(friends(), ctx.callerId);
  let withheld = 0;
  let rounds = 0;

  for (;;) {
    const round = await readRound(profileId, kind, cursor);
    rounds += 1;
    if (round.rows.length === 0) {
      return privateOk({ items: [], has_more: false, next_cursor: null, kind, withheld_count: withheld });
    }

    const linked = await pageLinkedIds(round.rows);
    const candidates = linked.size === 0
      ? round.rows
      : round.rows.filter((row) => typeof row.id !== 'string' || !linked.has(row.id));
    const authorized = candidates.filter((row) => canViewerViewPost(row, ctx.callerId, friendIds));
    withheld += round.rows.length - authorized.length;

    if (authorized.length > 0) {
      const items = authorized.slice(0, limit);
      const next = encodeCursor(items[items.length - 1]);
      if (!next) {
        return privateOk({ items: [], has_more: false, next_cursor: null, kind, withheld_count: withheld });
      }
      const olderInHand = round.rows.some((row) => compareNewestFirst(row, items[items.length - 1]) > 0);
      const hasMore = olderInHand || round.capped;
      const authors = await readAuthors([
        profileId,
        ...items.map((item) => typeof item.user_id === 'string' ? item.user_id : ''),
      ]);
      for (const item of items) {
        const owner = typeof item.user_id === 'string' ? item.user_id : '';
        item.profiles = authors.get(owner) ?? { username: 'unknown', display_name: 'Unknown user', profile_pic: null };
      }
      await enrichShared(items, ctx.callerId, friendIds);
      return privateOk({ items, has_more: hasMore, next_cursor: next, kind, withheld_count: withheld });
    }

    // A whole batch was private: advance past it so one withheld row cannot
    // starve the viewer, but bound the number of rounds per request.
    const advanced = encodeCursor(round.rows[round.rows.length - 1]);
    if (!advanced) {
      return privateOk({ items: [], has_more: false, next_cursor: null, kind, withheld_count: withheld });
    }
    if (rounds >= MAX_SKIP_ROUNDS) {
      return privateOk({ items: [], has_more: true, next_cursor: advanced, kind, withheld_count: withheld });
    }
    cursor = decodeCursor(advanced);
    if (!cursor) badRequest('Invalid cursor');
  }
}));
