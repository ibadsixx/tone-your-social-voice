// Cross-project reaction summaries.
//
// Reaction rows, profiles and the content whose reactions are being listed can
// live in different projects. The verified central Auth caller is checked
// against the content's own audience before any reactor identity is returned:
// an unauthorized caller gets the same 403 shape the Gateway used, with no
// count or hint that a private list exists. Aggregate-only mode
// (`includeUsers: false`) never queries reactor identities at all.
//
// Function secrets: CENTRAL_AUTH_URL, CENTRAL_AUTH_ANON_KEY,
// REACTIONS_PROJECT_URL, REACTIONS_SERVICE_ROLE_KEY,
// PROFILES_PROJECT_URL, PROFILES_SERVICE_ROLE_KEY,
// POSTS_PROJECT_URL, POSTS_SERVICE_ROLE_KEY,
// COMMENTS_PROJECT_URL, COMMENTS_SERVICE_ROLE_KEY,
// FRIENDS_PROJECT_URL, FRIENDS_SERVICE_ROLE_KEY.
//
// Assumed tables/columns (confirm externally):
//   reactions project: post_reactions(post_id, user_id, reaction_type, created_at),
//                      comment_reactions(comment_id, user_id, reaction_type, created_at)
//   posts project: posts(id, user_id, status, audience_type, visibility,
//                        audience_user_ids, audience_excluded_user_ids)
//   comments project: comments(id, post_id)
//   profiles project: profiles(id, username, display_name, profile_pic)
//   friends project: friendships(requester_id, receiver_id, status)

import { serviceClient } from '../_shared/crossProject.ts';
import {
  assertFields,
  badRequest,
  bool,
  boundedInt,
  forbidden,
  handleRequest,
  notFound,
  ok,
  oneOf,
  optionalText,
  requireUuid,
  uuidArray,
  viewerFriendIds,
  type VerifiedContext,
} from '../_shared/operation.ts';
import { canViewerViewPost, type PostRow } from '../_shared/postVisibility.ts';

const KINDS = ['postUsers', 'commentUsers', 'postCount', 'commentCounts'] as const;
const POST_COLUMNS = 'id, user_id, status, audience_type, visibility, audience_user_ids, audience_excluded_user_ids';
const TYPE_SAMPLE_LIMIT = 5000;

function reactions() { return serviceClient('REACTIONS_PROJECT_URL', 'REACTIONS_SERVICE_ROLE_KEY'); }
function profiles() { return serviceClient('PROFILES_PROJECT_URL', 'PROFILES_SERVICE_ROLE_KEY'); }
function posts() { return serviceClient('POSTS_PROJECT_URL', 'POSTS_SERVICE_ROLE_KEY'); }
function comments() { return serviceClient('COMMENTS_PROJECT_URL', 'COMMENTS_SERVICE_ROLE_KEY'); }
function friends() { return serviceClient('FRIENDS_PROJECT_URL', 'FRIENDS_SERVICE_ROLE_KEY'); }

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** The content being read is authorized with the same predicate as a feed row. */
async function assertPostVisible(postId: string, callerId: string, friendIds: Set<string>): Promise<void> {
  const { data, error } = await posts().from('posts').select(POST_COLUMNS).eq('id', postId).maybeSingle();
  if (error) throw error;
  if (!data) notFound('Not found');
  if (!canViewerViewPost(data as PostRow, callerId, friendIds)) {
    forbidden('Reaction users are not available for this content');
  }
}

async function assertCommentVisible(commentId: string, callerId: string, friendIds: Set<string>): Promise<void> {
  const { data, error } = await comments().from('comments').select('id, post_id').eq('id', commentId).maybeSingle();
  if (error) throw error;
  const parentId = text(data?.post_id);
  if (!parentId) notFound('Not found');
  await assertPostVisible(parentId, callerId, friendIds);
}

/** Batch variant of the comment check: only comments on visible posts survive. */
async function visibleCommentIds(ids: string[], callerId: string, friendIds: Set<string>): Promise<string[]> {
  const { data, error } = await comments().from('comments').select('id, post_id').in('id', ids);
  if (error) throw error;
  const parentIds = [...new Set((data ?? []).map((row) => text(row.post_id)).filter((id): id is string => id !== null))];
  if (parentIds.length === 0) return [];
  const { data: parentPosts, error: postError } = await posts().from('posts').select(POST_COLUMNS).in('id', parentIds);
  if (postError) throw postError;
  const visibleParents = new Set(
    (parentPosts ?? [])
      .filter((row) => canViewerViewPost(row as PostRow, callerId, friendIds))
      .map((row) => row.id)
      .filter((id): id is string => typeof id === 'string')
  );
  return (data ?? [])
    .filter((row) => visibleParents.has(row.post_id))
    .map((row) => row.id)
    .filter((id): id is string => typeof id === 'string');
}

function scoped(query: any, column: string, ids: string[]): any {
  return ids.length === 1 ? query.eq(column, ids[0]) : query.in(column, ids);
}

Deno.serve((req) => handleRequest(req, ['POST'], async (ctx: VerifiedContext) => {
  assertFields(ctx.body, ['kind', 'contentId', 'limit', 'offset', 'ids', 'includeUsers', 'type']);
  const kind = oneOf(ctx.body.kind, 'kind', KINDS);
  const includeUsers = ctx.body.includeUsers === undefined
    ? true
    : bool(ctx.body.includeUsers, 'includeUsers');
  const type = optionalText(ctx.body.type, 'type', 40);
  const friendIds = await viewerFriendIds(friends(), ctx.callerId);

  const contentColumn = kind.startsWith('post') ? 'post_id' : 'comment_id';
  const table = kind.startsWith('post') ? 'post_reactions' : 'comment_reactions';
  let ids: string[];

  if (kind === 'commentCounts') {
    const requested = uuidArray(ctx.body.ids, 'ids', 100);
    if (requested.length === 0) badRequest('Invalid ids');
    ids = await visibleCommentIds(requested, ctx.callerId, friendIds);
    if (ids.length === 0) return ok({ counts: {} });

    // One bounded read groups counts per comment; no reactor identities are
    // serialized unless they belong to the verified viewer.
    const { data, error } = await scoped(
      reactions().from(table).select(`${contentColumn}, reaction_type, user_id`), contentColumn, ids
    ).limit(TYPE_SAMPLE_LIMIT);
    if (error) throw error;
    const counts: Record<string, {
      reaction_count: number;
      reaction_types: Record<string, number>;
      viewer_reactions: unknown[];
    }> = {};
    for (const id of ids) counts[id] = { reaction_count: 0, reaction_types: {}, viewer_reactions: [] };
    for (const row of data ?? []) {
      const bucket = counts[row[contentColumn]];
      if (!bucket || typeof row.reaction_type !== 'string') continue;
      bucket.reaction_count += 1;
      bucket.reaction_types[row.reaction_type] = (bucket.reaction_types[row.reaction_type] ?? 0) + 1;
      if (row.user_id === ctx.callerId) bucket.viewer_reactions.push(row);
    }
    return ok({ counts });
  }

  const contentId = requireUuid(ctx.body.contentId, 'contentId');
  if (kind.startsWith('post')) await assertPostVisible(contentId, ctx.callerId, friendIds);
  else await assertCommentVisible(contentId, ctx.callerId, friendIds);
  ids = [contentId];

  const limit = boundedInt(ctx.body.limit, 'limit', 1, 100, 25);
  const offset = boundedInt(ctx.body.offset, 'offset', 0, 10_000, 0);

  // Exact total via a head count. Type buckets come from a bounded sample;
  // this keeps the response fast without a materialized counter table.
  const { count, error: countError } = await scoped(
    reactions().from(table).select('id', { count: 'exact', head: true }), contentColumn, ids
  );
  if (countError) throw countError;
  const reactionCount = count ?? 0;

  const { data: sampled, error: sampleError } = await scoped(
    reactions().from(table).select('reaction_type, user_id'), contentColumn, ids
  ).limit(TYPE_SAMPLE_LIMIT);
  if (sampleError) throw sampleError;
  const reactionTypes: Record<string, number> = {};
  for (const row of sampled ?? []) {
    if (typeof row.reaction_type !== 'string') continue;
    reactionTypes[row.reaction_type] = (reactionTypes[row.reaction_type] ?? 0) + 1;
  }
  const viewerReactions = (sampled ?? []).filter((row) => row.user_id === ctx.callerId);

  if (!includeUsers) {
    return ok({
      content_type: kind.startsWith('post') ? 'post' : 'comment',
      content_id: contentId,
      reaction_count: reactionCount,
      reaction_types: reactionTypes,
      filtered_reaction_count: type ? (reactionTypes[type] ?? 0) : reactionCount,
      users: [],
      viewer_reactions: viewerReactions,
      has_more: false,
      next_offset: null,
    });
  }

  let pageQuery = scoped(reactions().from(table).select('*'), contentColumn, ids)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (type) pageQuery = pageQuery.eq('reaction_type', type);
  const { data: rows, error: pageError } = await pageQuery;
  if (pageError) throw pageError;

  const userIds = [...new Set((rows ?? []).map((row) => row.user_id))]
    .filter((id): id is string => typeof id === 'string');
  const profileById = new Map<string, Record<string, unknown>>();
  if (userIds.length > 0) {
    const { data: users, error: profileError } = await profiles()
      .from('profiles')
      .select('id, username, display_name, profile_pic')
      .in('id', userIds);
    if (profileError) throw profileError;
    for (const user of users ?? []) profileById.set(user.id, user as Record<string, unknown>);
  }
  const enriched = (rows ?? []).map((row) => ({ ...row, ...(profileById.get(row.user_id) ?? {}) }));
  const filteredCount = type ? (reactionTypes[type] ?? 0) : reactionCount;
  const hasMore = offset + enriched.length < filteredCount;

  return ok({
    content_type: kind.startsWith('post') ? 'post' : 'comment',
    content_id: contentId,
    reaction_count: reactionCount,
    reaction_types: reactionTypes,
    filtered_reaction_count: filteredCount,
    users: enriched,
    viewer_reactions: viewerReactions,
    has_more: hasMore,
    next_offset: hasMore ? offset + enriched.length : null,
  });
}));
