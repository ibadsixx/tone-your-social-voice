// Pure, testable core for the signed-in Home Feed timeline read.
//
// This module deliberately has no Deno globals, no Supabase imports and no
// secrets. The Edge Function is a thin adapter: it verifies the central Auth
// JWT, builds Function-only clients, issues bounded queries and feeds the rows
// through these functions. Keeping the security decisions here means every
// audience, block, restriction, attribution and pagination rule has a runnable
// regression test in the frontend Vitest suite.
//
// No database cache is created: every request re-reads the authoritative rows.

export type FeedRow = Record<string, unknown>;

export interface FeedCursor {
  created_at: string;
  id: string;
}

export interface FeedRequest {
  cursor: FeedCursor | null;
  limit: number;
}

export interface FeedPage<T extends FeedRow> {
  rows: T[];
  nextCursor: FeedCursor | null;
  hasMore: boolean;
}

export interface VisibilityContext {
  viewerId: string;
  friendIds: Set<string>;
  blockedIds: Set<string>;
  /** Authors that restricted `viewerId` (is_restricted(author, viewer)). */
  restrictedAuthorIds: Set<string>;
  /** audience_lists whose member_ids contain `viewerId`. */
  allowedListIds: Set<string>;
}

export interface PageResult<T> {
  data: T[] | null;
  error: unknown;
}

export const DEFAULT_FEED_LIMIT = 10;
export const MAX_FEED_LIMIT = 50;
export const LOOKUP_PAGE_SIZE = 500;

/** Only these body keys are accepted. Everything else is rejected. */
export const FEED_REQUEST_FIELDS = ['cursor', 'limit'] as const;
export const FEED_CURSOR_FIELDS = ['created_at', 'id'] as const;

/**
 * Exact posts columns read by feedTimeline. Nothing else — in particular no
 * product_details, tagged_people, private metrics or admin columns — is
 * fetched from the posts project.
 */
export const POST_FEED_COLUMNS = [
  'id',
  'user_id',
  'created_at',
  'type',
  'content',
  'media_url',
  'media_type',
  'aspect_ratio',
  'duration',
  'thumbnail',
  'music_url',
  'music_source',
  'music_start',
  'music_video_id',
  'shared_post_id',
  'feeling_activity_type',
  'feeling_activity_emoji',
  'feeling_activity_text',
  'feeling_activity_target_text',
  'feeling_activity_target_id',
  'location_id',
  'location_name',
  'location_address',
  'location_lat',
  'location_lng',
  'location_provider',
  'comments_enabled',
  'live_session_id',
  'audience_type',
  'audience_user_ids',
  'audience_excluded_user_ids',
  'audience_list_id',
  'visibility',
  'status',
] as const;

/** A shared original is projected even more narrowly than a timeline row. */
export const SHARED_POST_COLUMNS = [
  'id',
  'user_id',
  'created_at',
  'type',
  'content',
  'media_url',
  'media_type',
] as const;

export const AUTHOR_COLUMNS = ['id', 'username', 'display_name', 'profile_pic'] as const;
export const RESTRICTION_COLUMNS = ['user_id', 'restricted_user_id'] as const;
export const AUDIENCE_LIST_COLUMNS = ['id', 'member_ids'] as const;
export const GROUP_POST_COLUMNS = ['group_id', 'post_id'] as const;
export const GROUP_COLUMNS = ['id', 'name', 'privacy'] as const;
export const GROUP_MEMBER_COLUMNS = ['group_id', 'user_id'] as const;
export const GROUP_FOLLOW_COLUMNS = ['group_id', 'user_id'] as const;
export const PAGE_POST_COLUMNS = ['page_id', 'post_id'] as const;
export const PAGE_COLUMNS = ['id', 'name', 'cover_image', 'admin_id'] as const;

/** Every response from this Function is private, even OPTIONS and errors. */
export const PRIVATE_RESPONSE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Cache-Control': 'private, no-store, max-age=0',
  Vary: 'Authorization',
});

export function withPrivateHeaders(
  headers: Record<string, string> = {}
): Record<string, string> {
  return { ...headers, ...PRIVATE_RESPONSE_HEADERS };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requestError(message: string): never {
  throw new Error(message);
}

function unknownKeys(value: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(value).filter((key) => !allowed.includes(key));
}

export function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseCursor(value: unknown): FeedCursor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    requestError('Invalid cursor');
  }
  const raw = value as Record<string, unknown>;
  if (unknownKeys(raw, FEED_CURSOR_FIELDS).length > 0) requestError('Invalid cursor');
  const createdAt = text(raw.created_at);
  const id = text(raw.id);
  if (!createdAt || !id || !UUID_RE.test(id)) requestError('Invalid cursor');
  const parsed = Date.parse(createdAt);
  if (Number.isNaN(parsed) || new Date(parsed).toISOString() !== createdAt) {
    requestError('Invalid cursor');
  }
  return { created_at: createdAt, id };
}

/** Strict body validation: no extra keys, no silent clamping, no implicit defaults for junk. */
export function parseFeedRequest(body: Record<string, unknown>): FeedRequest {
  if (unknownKeys(body, FEED_REQUEST_FIELDS).length > 0) {
    requestError('Unknown request fields');
  }

  const cursor = body.cursor == null ? null : parseCursor(body.cursor);

  const rawLimit = body.limit;
  if (rawLimit !== undefined && typeof rawLimit !== 'number') requestError('Invalid limit');
  const limit = rawLimit === undefined ? DEFAULT_FEED_LIMIT : rawLimit as number;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_FEED_LIMIT) {
    requestError('Invalid limit');
  }

  return { cursor, limit };
}

function quoteFilterValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * PostgREST keyset predicate for `(created_at, id) < (cursor.created_at,
 * cursor.id)` under the feed's newest-first total order. Both equality on the
 * timestamp and strict id ordering are required, otherwise posts sharing a
 * timestamp are skipped or repeated.
 */
export function buildCursorFilter(cursor: FeedCursor): string {
  const ts = quoteFilterValue(cursor.created_at);
  const id = quoteFilterValue(cursor.id);
  return `created_at.lt.${ts},and(created_at.eq.${ts},id.lt.${id})`;
}

export function compareFeedPosts(
  a: { created_at?: unknown; id?: unknown },
  b: { created_at?: unknown; id?: unknown }
): number {
  const ta = text(a.created_at) ?? '';
  const tb = text(b.created_at) ?? '';
  if (ta !== tb) return ta < tb ? 1 : -1;
  const ia = text(a.id) ?? '';
  const ib = text(b.id) ?? '';
  if (ia === ib) return 0;
  return ia < ib ? 1 : -1;
}

export function cursorOf(row: FeedRow): FeedCursor | null {
  const createdAt = text(row.created_at);
  const id = text(row.id);
  if (!createdAt || !id) return null;
  return { created_at: createdAt, id };
}

/** True when `row` comes strictly after `cursor` in newest-first order. */
export function isStrictlyOlder(row: FeedRow, cursor: FeedCursor): boolean {
  return compareFeedPosts(row, cursor) > 0;
}

/**
 * Turn an over-fetched PostgREST page (`limit + 1` rows) into a stable page and
 * a cursor for the next request. The extra row is evidence of more data, not a
 * row to display.
 */
export function toFeedPage<T extends FeedRow>(rows: T[], limit: number): FeedPage<T> {
  const sorted = [...rows].sort(compareFeedPosts);
  const shown = sorted.slice(0, limit);
  const hasMore = sorted.length > limit;
  const tail = hasMore ? shown[shown.length - 1] : shown[shown.length - 1];
  return {
    rows: shown,
    nextCursor: hasMore && tail ? cursorOf(tail) : null,
    hasMore,
  };
}

export function validPostKey(row: FeedRow): boolean {
  return !!text(row.id) && !!text(row.user_id) && !!text(row.created_at);
}

export function dedupeRows<T extends FeedRow>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const id = text(row.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

/** Split an unbounded id set into PostgREST-safe `.in()` chunks. */
export function chunkIds(values: string[], size = 100): string[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error('Invalid chunk size');
  const unique = [...new Set(values)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += size) {
    chunks.push(unique.slice(i, i + size));
  }
  return chunks;
}

/**
 * Read every page of a lookup, never stopping at a fixed count. A query error
 * or a non-progressing/repeating page throws: an incomplete visibility lookup
 * must never look like an empty permission set.
 */
export async function readAllPages<T, K>(
  readPage: (from: number, to: number) => Promise<PageResult<T>>,
  keyOf: (row: T) => K,
  pageSize = LOOKUP_PAGE_SIZE
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('Invalid page size');
  const rows: T[] = [];
  const seen = new Set<K>();
  let offset = 0;

  for (;;) {
    const { data, error } = await readPage(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    let fresh = 0;
    for (const row of page) {
      const key = keyOf(row);
      if (seen.has(key)) throw new Error('Visibility lookup did not progress');
      seen.add(key);
      rows.push(row);
      fresh += 1;
    }
    if (fresh < pageSize) return rows;
    offset += pageSize;
  }
}

function audienceOf(row: FeedRow): string {
  const declared = text(row.audience_type);
  if (declared) {
    switch (declared.toLowerCase().replace(/[\s-]+/g, '_')) {
      case 'public':
      case 'everyone':
      case 'anyone':
      case 'all':
        return 'public';
      case 'friends':
      case 'friend':
      case 'ally':
      case 'allies':
      case 'friends_only':
      case 'followers':
        return 'friends';
      case 'only_me':
      case 'onlyme':
      case 'me':
      case 'private':
      case 'restricted':
        return 'only_me';
      case 'friends_except':
        return 'friends_except';
      case 'specific':
        return 'specific';
      case 'custom_list':
        return 'custom_list';
      default:
        return 'denied';
    }
  }
  const legacy = text(row.visibility);
  if (legacy) return audienceOf({ audience_type: legacy });
  // No audience information is not a grant. The column is NOT NULL DEFAULT
  // 'public' in the schema, so absence means the read is incomplete.
  return 'denied';
}

function includesId(value: unknown, id: string): boolean {
  return Array.isArray(value) && value.some((item) => item === id);
}

/**
 * Feed visibility parity with the authoritative `can_view_post()` RLS helper:
 * owner bypass, status gate, blocks, is_restricted(), the audience matrix and
 * custom-list membership. Any unrecognised audience is denied.
 */
export function canViewFeedPost(row: FeedRow | null | undefined, ctx: VisibilityContext): boolean {
  if (!row || typeof row !== 'object' || !validPostKey(row)) return false;

  const author = text(row.user_id) as string;
  const viewer = ctx.viewerId;

  // RLS applies the block predicate even to rows the audience rule would allow.
  // The caller's own id is never a block peer.
  if (author !== viewer && ctx.blockedIds.has(author)) return false;

  if (author === viewer) return true;

  // Drafts, scheduled rows and rows with no status are author-only. The app
  // also permits an active `live` status; the DB default is `published`.
  const status = text(row.status);
  if (status !== 'published' && status !== 'live') return false;

  // is_restricted(author, viewer): a restricted viewer may see only public
  // posts, or posts where they are explicitly tagged. No friends, no lists.
  if (ctx.restrictedAuthorIds.has(author)) {
    const audience = audienceOf(row);
    if (audience === 'public') return true;
    if (audience === 'specific') return includesId(row.audience_user_ids, viewer);
    return false;
  }

  const audience = audienceOf(row);
  if (audience === 'public') return !includesId(row.audience_excluded_user_ids, viewer);
  if (audience === 'friends') return ctx.friendIds.has(author);
  if (audience === 'friends_except') {
    return ctx.friendIds.has(author) && !includesId(row.audience_excluded_user_ids, viewer);
  }
  if (audience === 'specific') return includesId(row.audience_user_ids, viewer);
  if (audience === 'custom_list') {
    const listId = text(row.audience_list_id);
    return !!listId && ctx.allowedListIds.has(listId);
  }
  return false;
}

export interface FeedAuthor {
  username: string;
  display_name: string;
  profile_pic: string | null;
}

/**
 * A complete author row or nothing. The old code substituted "Unknown user",
 * which made a missing/incomplete profile look like a real identity. The feed
 * omits such a post instead of returning misleading partial user information.
 */
export function authorProjection(row: FeedRow | null | undefined): FeedAuthor | null {
  if (!row) return null;
  const id = text(row.id);
  const username = text(row.username);
  const displayName = text(row.display_name);
  if (!id || !username || !displayName) return null;
  return {
    username,
    display_name: displayName,
    profile_pic: typeof row.profile_pic === 'string' ? row.profile_pic : null,
  };
}

export interface GroupAttribution {
  id: string;
  name: string;
}

export interface PageAttribution {
  id: string;
  name: string;
  cover_image: string | null;
  profile_pic: string | null;
}

export function hasPostGroupLink(postId: string, links: FeedRow[]): boolean {
  return links.some((row) => text(row.post_id) === postId && !!text(row.group_id));
}

export function hasPostPageLink(postId: string, links: FeedRow[]): boolean {
  return links.some((row) => text(row.post_id) === postId && !!text(row.page_id));
}

/**
 * group_posts RLS only exposes a share to members of that group. The service
 * role bypasses RLS, so the Function re-applies membership here. A group the
 * viewer explicitly unfollowed is omitted too, and a missing group row can
 * never produce a partial label.
 */
export function groupAttributionForPost(
  postId: string,
  links: FeedRow[],
  groups: Map<string, FeedRow>,
  memberGroupIds: Set<string>,
  unfollowedGroupIds: Set<string>
): GroupAttribution | null {
  const link = links.find((row) => text(row.post_id) === postId);
  if (!link) return null;
  const groupId = text(link.group_id);
  if (!groupId || !memberGroupIds.has(groupId) || unfollowedGroupIds.has(groupId)) return null;
  const group = groups.get(groupId);
  const name = group && text(group.name);
  if (!name) return null;
  return { id: groupId, name };
}

/** Pages are public, but an attribution requires both a link and a live page row. */
export function pageAttributionForPost(
  postId: string,
  links: FeedRow[],
  pages: Map<string, FeedRow>
): PageAttribution | null {
  const link = links.find((row) => text(row.post_id) === postId);
  if (!link) return null;
  const pageId = text(link.page_id);
  if (!pageId) return null;
  const page = pages.get(pageId);
  const name = page && text(page.name);
  if (!name) return null;
  return {
    id: pageId,
    name,
    cover_image: typeof page?.cover_image === 'string' ? page.cover_image : null,
    // `pages` has no profile_pic column; feed cards fall back to cover_image.
    profile_pic: null,
  };
}

export interface ProjectionInput {
  row: FeedRow;
  author: FeedAuthor | null;
  group?: GroupAttribution | null;
  page?: PageAttribution | null;
  sharedPost?: Record<string, unknown> | null;
}

/**
 * Construct the response row from the allow-list only. Never spread a database
 * row: a future sensitive column must not silently become feed output.
 */
export function projectFeedPost(input: ProjectionInput): Record<string, unknown> {
  const { row, author, group, page, sharedPost } = input;
  if (!author) throw new Error('Cannot project a post without a complete author');
  const out: Record<string, unknown> = {};
  for (const key of POST_FEED_COLUMNS) {
    out[key] = row[key] ?? null;
  }
  out.media_type = text(row.media_type) === 'image' || text(row.media_type) === 'video'
    ? text(row.media_type)
    : null;
  out.profiles = author;
  out.group_name = group?.name ?? null;
  out.group_id = group?.id ?? null;
  out.page = page ?? null;
  out.shared_post = sharedPost ?? null;
  return out;
}

export function projectSharedPost(
  row: FeedRow,
  author: FeedAuthor | null,
  page: PageAttribution | null
): Record<string, unknown> {
  if (!author) throw new Error('Cannot project a shared post without a complete author');
  const out: Record<string, unknown> = {};
  for (const key of SHARED_POST_COLUMNS) {
    out[key] = row[key] ?? null;
  }
  out.media_type = text(row.media_type) === 'image' || text(row.media_type) === 'video'
    ? text(row.media_type)
    : null;
  out.page = page ?? null;
  out.profiles = author;
  return out;
}

/** Complete friend IDs from the authoritative `friends` table. */
export function friendIdsFromCanonicalRows(
  rows: FeedRow[],
  viewerId: string
): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    const requester = text(row.requester_id);
    const receiver = text(row.receiver_id);
    if (text(row.status) !== 'accepted') continue;
    if (requester === viewerId && receiver) ids.add(receiver);
    if (receiver === viewerId && requester) ids.add(requester);
  }
  return ids;
}

/** Legacy `friendships(sender_id, receiver_id, status='ACCEPTED')` fallback. */
export function friendIdsFromLegacyRows(
  rows: FeedRow[],
  viewerId: string
): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    const sender = text(row.sender_id);
    const receiver = text(row.receiver_id);
    if (text(row.status) !== 'ACCEPTED') continue;
    if (sender === viewerId && receiver) ids.add(receiver);
    if (receiver === viewerId && sender) ids.add(sender);
  }
  return ids;
}

/**
 * Bidirectional block peers. Only `full` blocks hide feed content; a
 * messaging-only block does not. A legacy row with no block_type is treated as
 * a full block (the schema default and the safer interpretation).
 */
export function blockedIdsFromRows(rows: FeedRow[], viewerId: string): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    const rawType = text(row.block_type);
    if (rawType && rawType !== 'full') continue;
    const blocker = text(row.blocker_id);
    const blocked = text(row.blocked_id);
    if (!blocker || !blocked) continue;
    const other = blocker === viewerId ? blocked : blocked === viewerId ? blocker : null;
    if (other && other !== viewerId) ids.add(other);
  }
  return ids;
}

/** Authors whose `is_restricted(author, viewer)` row is present. */
export function restrictedAuthorIdsFromRows(rows: FeedRow[], viewerId: string): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (text(row.restricted_user_id) !== viewerId) continue;
    const author = text(row.user_id);
    if (author && author !== viewerId) ids.add(author);
  }
  return ids;
}

/** audience_lists actually available to this verified viewer. */
export function allowedListIdsFromRows(rows: FeedRow[], viewerId: string): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    const id = text(row.id);
    if (id && Array.isArray(row.member_ids) && row.member_ids.includes(viewerId)) ids.add(id);
  }
  return ids;
}
