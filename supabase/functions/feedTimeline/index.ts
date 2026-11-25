// Narrow cross-project read for the authenticated Home Feed timeline.
//
// The central Auth project and the posts project are different Supabase
// projects. A central-auth JWT is rejected by the posts project's PostgREST
// (401 PGRST301), so a direct browser read cannot see a signed-in user's
// friends-only/specific/own posts. This Function is the trusted bridge:
//   1. verify the caller's central Auth JWT server-side;
//   2. read exactly one registered posts project with a Function-only key;
//   3. apply the canonical visibility matrix, restrictions, full blocks and
//      group/page membership server-side;
//   4. return only the explicit projection the feed cards render;
//   5. page the whole timeline with a stable `(created_at, id)` cursor.
//
// It is deliberately not a generic feed API: no writes, no arbitrary table or
// select, no client-provided identity, no cross-project fan-out. Guests do not
// call this Function — their public feed is a direct anon-key read whose RLS is
// authoritative.
//
// Function secrets: CENTRAL_AUTH_URL, CENTRAL_AUTH_ANON_KEY,
// POSTS_PROJECT_URL, POSTS_SERVICE_ROLE_KEY,
// PROFILES_PROJECT_URL, PROFILES_SERVICE_ROLE_KEY,
// FRIENDS_PROJECT_URL, FRIENDS_SERVICE_ROLE_KEY,
// BLOCKING_PROJECT_URL, BLOCKING_SERVICE_ROLE_KEY.
//
// Authoritative local schema evidence:
//   posts(id, user_id, created_at, audience_*, status, visibility, ...)
//   profiles(id, username, display_name, profile_pic)
//   friends(requester_id, receiver_id, status='accepted')   [canonical]
//   friendships(sender_id, receiver_id, status='ACCEPTED')  [legacy fallback]
//   blocks(blocker_id, blocked_id, block_type='full')
//   restricted_users(user_id, restricted_user_id)           [blocking project]
//   audience_lists(id, member_ids)
//   group_posts(group_id, post_id) / groups(id,name,privacy) / group_members
//   page_posts(page_id, post_id) / pages(id,name,cover_image)

import { jsonResponse, serviceClient } from '../_shared/crossProject.ts';
import {
  assertFields,
  handleRequest,
  viewerBlockedIds,
  viewerFriendIds,
  type VerifiedContext,
} from '../_shared/operation.ts';
import {
  allowedListIdsFromRows,
  AUDIENCE_LIST_COLUMNS,
  AUTHOR_COLUMNS,
  authorProjection,
  buildCursorFilter,
  canViewFeedPost,
  chunkIds,
  dedupeRows,
  FEED_REQUEST_FIELDS,
  GROUP_COLUMNS,
  GROUP_FOLLOW_COLUMNS,
  GROUP_MEMBER_COLUMNS,
  GROUP_POST_COLUMNS,
  groupAttributionForPost,
  hasPostGroupLink,
  hasPostPageLink,
  PAGE_COLUMNS,
  PAGE_POST_COLUMNS,
  pageAttributionForPost,
  parseFeedRequest,
  POST_FEED_COLUMNS,
  projectFeedPost,
  projectSharedPost,
  RESTRICTION_COLUMNS,
  restrictedAuthorIdsFromRows,
  SHARED_POST_COLUMNS,
  text,
  toFeedPage,
  type FeedRow,
  type VisibilityContext,
} from '../_shared/feedTimelineCore.ts';

type Client = ReturnType<typeof serviceClient>;

const REQUIRED_SECRETS = [
  'CENTRAL_AUTH_URL',
  'CENTRAL_AUTH_ANON_KEY',
  'POSTS_PROJECT_URL',
  'POSTS_SERVICE_ROLE_KEY',
  'PROFILES_PROJECT_URL',
  'PROFILES_SERVICE_ROLE_KEY',
  'FRIENDS_PROJECT_URL',
  'FRIENDS_SERVICE_ROLE_KEY',
  'BLOCKING_PROJECT_URL',
  'BLOCKING_SERVICE_ROLE_KEY',
] as const;

const ID_CHUNK = 100;

function missingRouting(): Response | null {
  const missing = REQUIRED_SECRETS.filter((name) => !Deno.env.get(name));
  if (missing.length === 0) return null;
  // Only variable NAMES are logged; never a URL or key value.
  console.error('[feedTimeline] missing Function secrets', missing.join(','));
  return jsonResponse(
    { data: null, error: { message: 'Feed routing is not configured', code: 'FEED_ROUTE_MISSING' } },
    503
  );
}

function privateOk(data: unknown): Response {
  // jsonResponse applies no-store + Vary: Authorization to every response.
  return jsonResponse({ data, error: null });
}

function idsFrom(rows: FeedRow[], key: string): string[] {
  return [...new Set(rows.map((row) => text(row[key])).filter((id): id is string => !!id))];
}

async function readIn(
  client: Client,
  table: string,
  columns: readonly string[],
  column: string,
  values: string[]
): Promise<FeedRow[]> {
  const rows: FeedRow[] = [];
  for (const chunk of chunkIds(values, ID_CHUNK)) {
    const { data, error } = await client
      .from(table)
      .select(columns.join(','))
      .in(column, chunk);
    if (error) throw error;
    rows.push(...((data ?? []) as FeedRow[]));
  }
  return rows;
}

async function readViewerLinks(
  client: Client,
  table: string,
  columns: readonly string[],
  groupIds: string[],
  viewerId: string
): Promise<FeedRow[]> {
  const rows: FeedRow[] = [];
  for (const chunk of chunkIds(groupIds, ID_CHUNK)) {
    const { data, error } = await client
      .from(table)
      .select(columns.join(','))
      .in('group_id', chunk)
      .eq('user_id', viewerId);
    if (error) throw error;
    rows.push(...((data ?? []) as FeedRow[]));
  }
  return rows;
}

async function loadVisibilityContext(
  posts: Client,
  blocking: Client,
  viewerId: string,
  rows: FeedRow[],
  friendIds: Set<string>,
  blockedIds: Set<string>
): Promise<VisibilityContext> {
  const authorIds = idsFrom(rows, 'user_id');
  const restrictionRows = await readIn(
    blocking,
    'restricted_users',
    RESTRICTION_COLUMNS,
    'user_id',
    authorIds
  );
  const restrictedAuthorIds = restrictedAuthorIdsFromRows(restrictionRows, viewerId);

  const listIds = dedupeRows(rows)
    .filter((row) => text(row.audience_type)?.toLowerCase() === 'custom_list'
      || text(row.visibility)?.toLowerCase() === 'custom_list')
    .map((row) => text(row.audience_list_id))
    .filter((id): id is string => !!id);
  const listRows = await readIn(posts, 'audience_lists', AUDIENCE_LIST_COLUMNS, 'id', listIds);
  const allowedListIds = allowedListIdsFromRows(listRows, viewerId);

  return { viewerId, friendIds, blockedIds, restrictedAuthorIds, allowedListIds };
}

interface Enrichment {
  groupLinks: FeedRow[];
  groups: Map<string, FeedRow>;
  memberGroupIds: Set<string>;
  unfollowedGroupIds: Set<string>;
  pageLinks: FeedRow[];
  pages: Map<string, FeedRow>;
}

async function loadEnrichment(
  posts: Client,
  viewerId: string,
  postIds: string[]
): Promise<Enrichment> {
  const groupLinks = await readIn(posts, 'group_posts', GROUP_POST_COLUMNS, 'post_id', postIds);
  const groupIds = idsFrom(groupLinks, 'group_id');
  const groupRows = await readIn(posts, 'groups', GROUP_COLUMNS, 'id', groupIds);
  const groups = new Map<string, FeedRow>();
  for (const row of groupRows) {
    const id = text(row.id);
    if (id) groups.set(id, row);
  }
  const memberRows = await readViewerLinks(
    posts, 'group_members', GROUP_MEMBER_COLUMNS, groupIds, viewerId
  );
  const followRows = await readViewerLinks(
    posts, 'group_follows', GROUP_FOLLOW_COLUMNS, groupIds, viewerId
  );
  const memberGroupIds = new Set(idsFrom(memberRows, 'group_id'));
  const unfollowedGroupIds = new Set(idsFrom(followRows, 'group_id'));

  const pageLinks = await readIn(posts, 'page_posts', PAGE_POST_COLUMNS, 'post_id', postIds);
  const pageIds = idsFrom(pageLinks, 'page_id');
  const pageRows = await readIn(posts, 'pages', PAGE_COLUMNS, 'id', pageIds);
  const pages = new Map<string, FeedRow>();
  for (const row of pageRows) {
    const id = text(row.id);
    if (id) pages.set(id, row);
  }

  return {
    groupLinks,
    groups,
    memberGroupIds,
    unfollowedGroupIds,
    pageLinks,
    pages,
  };
}

/**
 * A service-role read bypasses the RLS on group_posts/page_posts. Re-apply the
 * application rules: a group share requires current membership and must not be
 * in the viewer's unfollow set; a page share requires a live page row. A broken
 * link hides the post instead of silently showing a misleading identity.
 */
function hasValidAttribution(postId: string, enrichment: Enrichment): boolean {
  if (hasPostGroupLink(postId, enrichment.groupLinks)) {
    const group = groupAttributionForPost(
      postId, enrichment.groupLinks, enrichment.groups,
      enrichment.memberGroupIds, enrichment.unfollowedGroupIds
    );
    if (!group) return false;
  }
  if (hasPostPageLink(postId, enrichment.pageLinks)) {
    if (!pageAttributionForPost(postId, enrichment.pageLinks, enrichment.pages)) return false;
  }
  return true;
}

async function handleFeedRequest(req: Request): Promise<Response> {
  const routingError = missingRouting();
  if (routingError) return routingError;

  return handleRequest(req, ['POST'], async (ctx: VerifiedContext) => {
    assertFields(ctx.body, FEED_REQUEST_FIELDS);
    const request = parseFeedRequest(ctx.body);

    const posts = serviceClient('POSTS_PROJECT_URL', 'POSTS_SERVICE_ROLE_KEY');
    const profiles = serviceClient('PROFILES_PROJECT_URL', 'PROFILES_SERVICE_ROLE_KEY');
    const friends = serviceClient('FRIENDS_PROJECT_URL', 'FRIENDS_SERVICE_ROLE_KEY');
    const blocking = serviceClient('BLOCKING_PROJECT_URL', 'BLOCKING_SERVICE_ROLE_KEY');

    let timelineQuery = posts
      .from('posts')
      .select(POST_FEED_COLUMNS.join(','))
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(request.limit + 1);
    if (request.cursor) timelineQuery = timelineQuery.or(buildCursorFilter(request.cursor));

    const [timelineResult, friendIds, blockedIds] = await Promise.all([
      timelineQuery,
      viewerFriendIds(friends, ctx.callerId),
      viewerBlockedIds(blocking, ctx.callerId),
    ]);
    if (timelineResult.error) throw timelineResult.error;

    // limit+1 is evidence for hasMore; it is never shown to the caller.
    const page = toFeedPage(dedupeRows((timelineResult.data ?? []) as FeedRow[]), request.limit);
    const timelineRows = page.rows;
    const sharedIds = idsFrom(timelineRows, 'shared_post_id');
    const sharedRows = sharedIds.length > 0
      ? await readIn(posts, 'posts', SHARED_POST_COLUMNS, 'id', sharedIds)
      : [];
    const allRows = dedupeRows([...timelineRows, ...sharedRows]);

    const visibility = await loadVisibilityContext(
      posts, blocking, ctx.callerId, allRows, friendIds, blockedIds
    );
    const visibleTimeline = timelineRows.filter((row) => canViewFeedPost(row, visibility));
    const visibleShared = sharedRows.filter((row) => canViewFeedPost(row, visibility));
    const visibleIds = idsFrom([...visibleTimeline, ...visibleShared], 'id');

    // A missing author row is not permission to show a post with a placeholder
    // identity. Such a row is omitted; no partial author data is returned.
    const authorRows = await readIn(
      profiles, 'profiles', AUTHOR_COLUMNS,
      'id', idsFrom([...visibleTimeline, ...visibleShared], 'user_id')
    );
    const authors = new Map<string, NonNullable<ReturnType<typeof authorProjection>>>();
    for (const row of authorRows) {
      const id = text(row.id);
      const projected = authorProjection(row);
      if (id && projected) authors.set(id, projected);
    }
    const authorFor = (row: FeedRow) => {
      const id = text(row.user_id);
      return id ? authors.get(id) ?? null : null;
    };

    const enrichment = visibleIds.length > 0
      ? await loadEnrichment(posts, ctx.callerId, visibleIds)
      : {
        groupLinks: [], groups: new Map<string, FeedRow>(),
        memberGroupIds: new Set<string>(), unfollowedGroupIds: new Set<string>(),
        pageLinks: [], pages: new Map<string, FeedRow>(),
      };

    const sharedById = new Map<string, Record<string, unknown>>();
    for (const row of visibleShared) {
      const author = authorFor(row);
      if (!author) continue;
      const id = text(row.id);
      if (id && hasValidAttribution(id, enrichment)) {
        sharedById.set(id, projectSharedPost(
          row,
          author,
          pageAttributionForPost(id, enrichment.pageLinks, enrichment.pages)
        ));
      }
    }

    const visible: Record<string, unknown>[] = [];
    for (const row of visibleTimeline) {
      const author = authorFor(row);
      if (!author) continue;
      const id = text(row.id);
      if (!id || !hasValidAttribution(id, enrichment)) continue;
      const sharedPostId = text(row.shared_post_id);
      visible.push(projectFeedPost({
        row,
        author,
        group: groupAttributionForPost(
          id, enrichment.groupLinks, enrichment.groups,
          enrichment.memberGroupIds, enrichment.unfollowedGroupIds
        ),
        page: pageAttributionForPost(id, enrichment.pageLinks, enrichment.pages),
        sharedPost: sharedPostId ? sharedById.get(sharedPostId) ?? null : null,
      }));
    }

    return privateOk({
      posts: visible,
      rawCount: timelineRows.length,
      visibleCount: visible.length,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    });
  });
}

Deno.serve(handleFeedRequest);
