// feedTimeline Phase 2A regression suite.
//
// The Edge Function is a thin Deno adapter around `feedTimelineCore.ts`. These
// tests import that pure core directly, so every privacy decision and every
// boundary that used to be capped can be exercised locally without deploying a
// Function or executing SQL.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  allowedListIdsFromRows,
  AUDIENCE_LIST_COLUMNS,
  authorProjection,
  AUTHOR_COLUMNS,
  blockedIdsFromRows,
  buildCursorFilter,
  canViewFeedPost,
  chunkIds,
  compareFeedPosts,
  FEED_CURSOR_FIELDS,
  FEED_REQUEST_FIELDS,
  friendIdsFromCanonicalRows,
  friendIdsFromLegacyRows,
  groupAttributionForPost,
  hasPostGroupLink,
  hasPostPageLink,
  isStrictlyOlder,
  PAGE_COLUMNS,
  pageAttributionForPost,
  parseFeedRequest,
  POST_FEED_COLUMNS,
  PRIVATE_RESPONSE_HEADERS,
  projectFeedPost,
  projectSharedPost,
  readAllPages,
  restrictedAuthorIdsFromRows,
  RESTRICTION_COLUMNS,
  SHARED_POST_COLUMNS,
  toFeedPage,
  type FeedRow,
  type VisibilityContext,
} from '../../supabase/functions/_shared/feedTimelineCore.ts';

const VIEWER = '00000000-0000-4000-8000-0000000000ff';
const AUTHOR = '00000000-0000-4000-8000-000000000001';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ts = (offsetMs: number) => new Date(Date.UTC(2026, 0, 1) - offsetMs).toISOString();

function context(overrides: Partial<VisibilityContext> = {}): VisibilityContext {
  return {
    viewerId: VIEWER,
    friendIds: new Set<string>(),
    blockedIds: new Set<string>(),
    restrictedAuthorIds: new Set<string>(),
    allowedListIds: new Set<string>(),
    ...overrides,
  };
}

function post(overrides: FeedRow = {}): FeedRow {
  return {
    id: uuid(100),
    user_id: AUTHOR,
    created_at: ts(0),
    type: 'normal_post',
    status: 'published',
    audience_type: 'public',
    content: 'hello',
    media_url: null,
    shared_post_id: null,
    ...overrides,
  };
}

function author(id: string) {
  return { id, username: 'user-' + id.slice(-4), display_name: 'User ' + id.slice(-4), profile_pic: null };
}

// ---------------------------------------------------------------------------
// 1, 2. Explicit allow-lists and safe response projection
// ---------------------------------------------------------------------------

describe('explicit post allow-lists', () => {
  it('does not read legacy, private, or unpublished-only columns', () => {
    const forbidden = [
      'product_details', 'tagged_people', 'alt_text', 'ai_label',
      'hide_like_count', 'hide_share_count', 'post_to_story', 'boost',
      'like_count', 'likes_count', 'comment_count', 'comments_count',
      'share_count', 'shares_count', 'scheduled_at', 'updated_at',
    ];
    for (const column of forbidden) expect(POST_FEED_COLUMNS).not.toContain(column);
  });

  it('projects exactly the declared columns plus feed enrichments', () => {
    const row = post({
      live_session_id: 'live-1',
      product_details: { price: 1 },
      tagged_people: ['secret'],
      ai_label: true,
    });
    const projected = projectFeedPost({
      row,
      author: author(AUTHOR),
      group: { id: uuid(200), name: 'Group' },
      page: { id: uuid(300), name: 'Page', cover_image: null, profile_pic: null },
      sharedPost: null,
    });

    const expected = [
      ...POST_FEED_COLUMNS,
      'profiles', 'group_name', 'group_id', 'page', 'shared_post',
    ].sort();
    expect(Object.keys(projected).sort()).toEqual(expected);
    expect(projected.product_details).toBeUndefined();
    expect(projected.tagged_people).toBeUndefined();
    expect(projected.ai_label).toBeUndefined();
    expect(projected.live_session_id).toBe('live-1');
    expect(projected.group_name).toBe('Group');
    expect(projected.profiles).toEqual(author(AUTHOR));
  });

  it('projects shared originals through an even narrower allow-list', () => {
    const projected = projectSharedPost(post({ status: 'published' }), author(AUTHOR), null);
    expect(Object.keys(projected).sort()).toEqual(
      [...SHARED_POST_COLUMNS, 'page', 'profiles'].sort()
    );
    expect(projected.status).toBeUndefined();
    expect(projected.audience_type).toBeUndefined();
  });

  it('never substitutes a placeholder identity for an incomplete author row', () => {
    const projected = authorProjection(author(AUTHOR));
    expect(projected).toEqual({
      username: author(AUTHOR).username,
      display_name: author(AUTHOR).display_name,
      profile_pic: null,
    });
    expect(projected).not.toHaveProperty('id');
    expect(authorProjection({ id: AUTHOR, username: 'only-a-username' })).toBeNull();
    expect(authorProjection(null)).toBeNull();
  });

  it('uses the exact narrow projections for every related lookup', () => {
    expect(AUTHOR_COLUMNS).toEqual(['id', 'username', 'display_name', 'profile_pic']);
    expect(RESTRICTION_COLUMNS).toEqual(['user_id', 'restricted_user_id']);
    expect(AUDIENCE_LIST_COLUMNS).toEqual(['id', 'member_ids']);
    expect(PAGE_COLUMNS).not.toContain('service_key');
  });
});

// ---------------------------------------------------------------------------
// 3. Restriction parity with can_view_post()/is_restricted()
// ---------------------------------------------------------------------------

describe('restriction parity', () => {
  it('lets an author see their own row in every audience and status', () => {
    for (const audience of ['public', 'friends', 'only_me', 'custom_list']) {
      expect(canViewFeedPost(
        post({ user_id: VIEWER, audience_type: audience, status: 'draft' }), context()
      )).toBe(true);
    }
  });

  it('applies is_restricted(author, viewer): public and tagged-specific only', () => {
    const restricted = context({
      restrictedAuthorIds: new Set([AUTHOR]),
      friendIds: new Set([AUTHOR]),
      allowedListIds: new Set([uuid(400)]),
    });
    expect(canViewFeedPost(post({ audience_type: 'public' }), restricted)).toBe(true);
    expect(canViewFeedPost(post({
      audience_type: 'specific', audience_user_ids: [VIEWER],
    }), restricted)).toBe(true);
    expect(canViewFeedPost(post({
      audience_type: 'specific', audience_user_ids: [uuid(9)],
    }), restricted)).toBe(false);
    expect(canViewFeedPost(post({ audience_type: 'friends' }), restricted)).toBe(false);
    expect(canViewFeedPost(post({ audience_type: 'friends_except' }), restricted)).toBe(false);
    expect(canViewFeedPost(post({
      audience_type: 'custom_list', audience_list_id: uuid(400),
    }), restricted)).toBe(false);
    expect(canViewFeedPost(post({ audience_type: 'only_me' }), restricted)).toBe(false);
  });

  it('does not treat a missing or non-published status as permission', () => {
    expect(canViewFeedPost(post({ status: 'published' }), context())).toBe(true);
    expect(canViewFeedPost(post({ status: 'live' }), context())).toBe(true);
    for (const status of ['draft', 'scheduled', null, undefined]) {
      expect(canViewFeedPost(post({ status }), context())).toBe(false);
    }
  });

  it('denies a row with no recognizable audience information', () => {
    expect(canViewFeedPost(post({ audience_type: null, visibility: null }), context())).toBe(false);
    expect(canViewFeedPost(post({ audience_type: 'future-audience' }), context())).toBe(false);
  });

  it('matches the rest of the audience matrix', () => {
    expect(canViewFeedPost(post(), context())).toBe(true);
    expect(canViewFeedPost(post({ audience_excluded_user_ids: [VIEWER] }), context())).toBe(false);
    expect(canViewFeedPost(post({ audience_type: 'friends' }), context())).toBe(false);
    expect(canViewFeedPost(post({ audience_type: 'friends' }), context({
      friendIds: new Set([AUTHOR]),
    }))).toBe(true);
    expect(canViewFeedPost(post({
      audience_type: 'friends_except', audience_excluded_user_ids: [VIEWER],
    }), context({ friendIds: new Set([AUTHOR]) }))).toBe(false);
    expect(canViewFeedPost(post({
      audience_type: 'specific', audience_user_ids: [VIEWER],
    }), context())).toBe(true);
    expect(canViewFeedPost(post({ audience_type: 'only_me' }), context())).toBe(false);
  });

  it('applies a full block even to a public, friendly post', () => {
    expect(canViewFeedPost(post(), context({
      blockedIds: new Set([AUTHOR]),
      friendIds: new Set([AUTHOR]),
    }))).toBe(false);
  });

  it('denies structurally incomplete rows', () => {
    expect(canViewFeedPost(post({ id: null }), context())).toBe(false);
    expect(canViewFeedPost(post({ user_id: null }), context())).toBe(false);
    expect(canViewFeedPost(post({ created_at: null }), context())).toBe(false);
    expect(canViewFeedPost(null, context())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4, 5, 6, 7. Custom lists, canonical friendships, and unbounded block reads
// ---------------------------------------------------------------------------

describe('audience-list, friendship and block sources', () => {
  it('implements custom_list only for a verified member of the referenced list', () => {
    const listId = uuid(400);
    const row = post({ audience_type: 'custom_list', audience_list_id: listId });
    expect(canViewFeedPost(row, context())).toBe(false);
    expect(canViewFeedPost(post({ audience_type: 'custom_list' }), context({
      allowedListIds: new Set([listId]),
    }))).toBe(false);
    expect(canViewFeedPost(row, context({
      allowedListIds: new Set([uuid(401)]),
    }))).toBe(false);
    expect(canViewFeedPost(row, context({
      allowedListIds: new Set([listId]),
    }))).toBe(true);
    expect(allowedListIdsFromRows([
      { id: listId, member_ids: [VIEWER] },
      { id: uuid(401), member_ids: [uuid(9)] },
    ], VIEWER)).toEqual(new Set([listId]));
  });

  it('reads canonical lowercase accepted friends from requester_id/receiver_id', () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({
      id: uuid(i + 1000),
      requester_id: VIEWER,
      receiver_id: uuid(i + 2000),
      status: i % 2 === 0 ? 'accepted' : 'pending',
    }));
    rows.push({
      id: uuid(9999), requester_id: uuid(9000), receiver_id: VIEWER, status: 'accepted',
    });
    const ids = friendIdsFromCanonicalRows(rows, VIEWER);
    expect(ids.size).toBe(251 + 1);
    expect(ids.has(uuid(2000))).toBe(true);
    expect(ids.has(uuid(2001))).toBe(false);
    expect(ids.has(uuid(9000))).toBe(true);
    expect(friendIdsFromCanonicalRows([{
      id: uuid(1), requester_id: VIEWER, receiver_id: uuid(2), status: 'ACCEPTED',
    }], VIEWER).size).toBe(0);
  });

  it('keeps the legacy uppercase friendships table as a schema fallback only', () => {
    const ids = friendIdsFromLegacyRows([
      { id: uuid(1), sender_id: VIEWER, receiver_id: uuid(2), status: 'ACCEPTED' },
      { id: uuid(2), sender_id: uuid(3), receiver_id: VIEWER, status: 'ACCEPTED' },
      { id: uuid(3), sender_id: VIEWER, receiver_id: uuid(4), status: 'accepted' },
      { id: uuid(4), sender_id: VIEWER, receiver_id: uuid(5), status: 'PENDING' },
    ], VIEWER);
    expect(ids).toEqual(new Set([uuid(2), uuid(3)]));
  });

  it('collects every full block in both directions and ignores messaging-only rows', () => {
    const rows: FeedRow[] = [];
    for (let i = 0; i < 600; i++) {
      rows.push({
        id: uuid(i + 10_000),
        blocker_id: i % 2 === 0 ? VIEWER : uuid(i + 20_000),
        blocked_id: i % 2 === 0 ? uuid(i + 20_000) : VIEWER,
        block_type: 'full',
      });
    }
    rows.push({
      id: uuid(99_999), blocker_id: VIEWER, blocked_id: uuid(99_998), block_type: 'messaging',
    });
    const blocked = blockedIdsFromRows(rows, VIEWER);
    expect(blocked.size).toBe(600);
    expect(blocked.has(uuid(20_000))).toBe(true);
    expect(blocked.has(uuid(20_001))).toBe(true);
    expect(blocked.has(uuid(99_998))).toBe(false);
  });

  it('reads every lookup page beyond 500 rows and fails on an incomplete lookup', async () => {
    const rows = Array.from({ length: 1200 }, (_, i) => ({ id: i }));
    let call = 0;
    const all = await readAllPages(
      async (from, to) => {
        expect(from).toBe(call * 500);
        call += 1;
        expect(to - from + 1).toBe(500);
        return { data: rows.slice(from, to + 1), error: null };
      },
      (row) => row.id
    );
    expect(all).toHaveLength(1200);
    expect(call).toBe(3);

    let failingCall = 0;
    await expect(readAllPages(
      async () => ({
        data: failingCall++ === 0 ? rows.slice(0, 500) : null,
        error: failingCall === 2 ? new Error('lookup failed') : null,
      }),
      (row) => row.id
    )).rejects.toThrow('lookup failed');

    let repeatedCall = 0;
    await expect(readAllPages(
      async () => ({
        data: repeatedCall++ === 0 ? rows.slice(0, 500) : rows.slice(0, 500),
        error: null,
      }),
      (row) => row.id
    )).rejects.toThrow('did not progress');

    await expect(readAllPages(
      async () => ({ data: [], error: null }),
      (row) => row.id
    )).resolves.toEqual([]);
  });

  it('identifies the authors who restricted this viewer', () => {
    const ids = restrictedAuthorIdsFromRows([
      { user_id: AUTHOR, restricted_user_id: VIEWER },
      { user_id: VIEWER, restricted_user_id: AUTHOR },
      { user_id: uuid(2), restricted_user_id: uuid(3) },
    ], VIEWER);
    expect(ids).toEqual(new Set([AUTHOR]));
  });
});

// ---------------------------------------------------------------------------
// 8. Authors beyond the old 200-row cap
// ---------------------------------------------------------------------------

describe('author completeness beyond 200 rows', () => {
  it('chunks 250 author ids into bounded PostgREST lookups', () => {
    const ids = Array.from({ length: 250 }, (_, i) => uuid(i + 1));
    const chunks = chunkIds(ids, 100);
    expect(chunks.map((chunk) => chunk.length)).toEqual([100, 100, 50]);
    expect(chunks.flat()).toEqual(ids);
    expect(chunkIds([...ids, ids[0]], 100).flat()).toEqual(ids);
  });
});

// ---------------------------------------------------------------------------
// 9. Group membership and page visibility
// ---------------------------------------------------------------------------

describe('group and page attribution', () => {
  const postId = uuid(100);
  const groupId = uuid(200);
  const pageId = uuid(300);
  const groupLinks = [{ post_id: postId, group_id: groupId }];
  const groups = new Map<string, FeedRow>([[groupId, { id: groupId, name: 'Group' }]]);
  const pageLinks = [{ post_id: postId, page_id: pageId }];
  const pages = new Map<string, FeedRow>([[pageId, { id: pageId, name: 'Page', cover_image: null }]]);

  it('requires current group membership and no explicit unfollow', () => {
    expect(hasPostGroupLink(postId, groupLinks)).toBe(true);
    expect(groupAttributionForPost(
      postId, groupLinks, groups, new Set([groupId]), new Set()
    )).toEqual({ id: groupId, name: 'Group' });
    expect(groupAttributionForPost(
      postId, groupLinks, groups, new Set(), new Set()
    )).toBeNull();
    expect(groupAttributionForPost(
      postId, groupLinks, groups, new Set([groupId]), new Set([groupId])
    )).toBeNull();
    expect(groupAttributionForPost(
      postId, groupLinks, new Map(), new Set([groupId]), new Set()
    )).toBeNull();
  });

  it('requires a live page row before attaching a page identity', () => {
    expect(hasPostPageLink(postId, pageLinks)).toBe(true);
    expect(pageAttributionForPost(postId, pageLinks, pages)).toEqual({
      id: pageId, name: 'Page', cover_image: null, profile_pic: null,
    });
    expect(pageAttributionForPost(postId, pageLinks, new Map())).toBeNull();
    expect(pageAttributionForPost(uuid(999), pageLinks, pages)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 10. Stable server-side keyset pagination
// ---------------------------------------------------------------------------

describe('stable (created_at, id) pagination', () => {
  it('builds a total-order keyset filter with the id tie-breaker', () => {
    const filter = buildCursorFilter({ created_at: ts(0), id: uuid(5) });
    expect(filter).toContain(`created_at.lt."${ts(0)}"`);
    expect(filter).toContain(`created_at.eq."${ts(0)}"`);
    expect(filter).toContain(`id.lt."${uuid(5)}"`);
  });

  it('pages through 501 rows with a limit of 50 without truncating or repeating', () => {
    const all = Array.from({ length: 501 }, (_, i) => ({
      id: uuid(i + 1),
      created_at: ts(i * 1000),
    }));
    const seen: string[] = [];
    let cursor: { created_at: string; id: string } | null = null;
    for (;;) {
      const candidates = cursor ? all.filter((row) => isStrictlyOlder(row, cursor!)) : all;
      const page = toFeedPage(candidates, 50);
      if (!page.rows.length) break;
      seen.push(...page.rows.map((row) => row.id));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual(all.map((row) => row.id));
    expect(new Set(seen).size).toBe(501);
  });

  it('uses id to break timestamp ties deterministically', () => {
    const tied = Array.from({ length: 25 }, (_, i) => ({
      id: uuid(100 - i), created_at: ts(0),
    }));
    expect(tied.map((row) => row.id)).toEqual([...tied].sort(compareFeedPosts).map((row) => row.id));
    const page = toFeedPage(tied, 10);
    expect(page.rows).toHaveLength(10);
    const remainder = tied.filter((row) => isStrictlyOlder(row, page.nextCursor!));
    expect(remainder).toHaveLength(15);
    expect(remainder.some((row) => page.rows.some((shown) => shown.id === row.id))).toBe(false);
  });

  it('returns the extra probe row only as evidence of more data', () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({ id: uuid(i), created_at: ts(i) }));
    const page = toFeedPage(rows, 50);
    expect(page.rows).toHaveLength(50);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toEqual({ created_at: ts(49), id: uuid(49) });
  });
});

// ---------------------------------------------------------------------------
// 11, 12, 13. Headers, strict body validation, and Central Auth preservation
// ---------------------------------------------------------------------------

describe('request contract', () => {
  it('accepts only cursor and limit, with a valid composite cursor', () => {
    expect(FEED_REQUEST_FIELDS).toEqual(['cursor', 'limit']);
    expect(FEED_CURSOR_FIELDS).toEqual(['created_at', 'id']);
    expect(parseFeedRequest({})).toEqual({ cursor: null, limit: 10 });
    expect(parseFeedRequest({
      limit: 50,
      cursor: { created_at: ts(0), id: uuid(1) },
    })).toEqual({ cursor: { created_at: ts(0), id: uuid(1) }, limit: 50 });
  });

  it('rejects unsupported fields and malformed values instead of clamping them', () => {
    expect(() => parseFeedRequest({ userId: uuid(2) })).toThrow('Unknown request fields');
    expect(() => parseFeedRequest({ limit: 0 })).toThrow('Invalid limit');
    expect(() => parseFeedRequest({ limit: 51 })).toThrow('Invalid limit');
    expect(() => parseFeedRequest({ limit: 1.5 })).toThrow('Invalid limit');
    expect(() => parseFeedRequest({ limit: '10' })).toThrow('Invalid limit');
    expect(() => parseFeedRequest({
      cursor: { created_at: ts(0), id: uuid(1), extra: true },
    })).toThrow('Invalid cursor');
    expect(() => parseFeedRequest({
      cursor: { created_at: ts(0), id: 'not-a-uuid' },
    })).toThrow('Invalid cursor');
    expect(() => parseFeedRequest({
      cursor: { created_at: 'yesterday', id: uuid(1) },
    })).toThrow('Invalid cursor');
  });

  it('defines private headers once for every response path', () => {
    expect(PRIVATE_RESPONSE_HEADERS).toEqual({
      'Cache-Control': 'private, no-store, max-age=0',
      Vary: 'Authorization',
    });
    const crossProject = readFileSync(
      'supabase/functions/_shared/crossProject.ts', 'utf8'
    );
    expect(crossProject).toContain("'Cache-Control': 'private, no-store, max-age=0'");
    expect(crossProject).toContain("Vary: 'Authorization'");
    expect(crossProject).toMatch(/export function jsonResponse[\s\S]*privateResponseHeaders/);
  });

  it('keeps Central Auth and Function-only credentials in the thin adapter', () => {
    const edge = readFileSync(
      'supabase/functions/feedTimeline/index.ts', 'utf8'
    );
    expect(edge).toContain("import { jsonResponse, serviceClient } from '../_shared/crossProject.ts'");
    expect(edge).toContain('handleRequest(req, [\'POST\']');
    expect(edge).toContain('ctx.callerId');
    expect(edge).toContain("serviceClient('POSTS_PROJECT_URL', 'POSTS_SERVICE_ROLE_KEY')");
    expect(edge).not.toMatch(/caller[-_ ]?supplied|body\.userId|body\.user_id/i);
    const config = readFileSync('supabase/config.toml', 'utf8');
    expect(config).toMatch(/\[functions\.feedTimeline\]\s*\nverify_jwt\s*=\s*false/);
    expect(config).toMatch(/\[functions\.getProfile\]\s*\nverify_jwt\s*=\s*false/);
  });

  it('removes every old cap and raw select from the shipped Function', () => {
    const edge = readFileSync(
      'supabase/functions/feedTimeline/index.ts', 'utf8'
    );
    const operation = readFileSync(
      'supabase/functions/_shared/operation.ts', 'utf8'
    );
    expect(edge).not.toContain("select('*')");
    expect(edge).not.toMatch(/MAX_TIMELINE_POSTS|MAX_SHARED_TARGETS|MAX_AUTHORS/);
    expect(edge).toContain('POST_FEED_COLUMNS.join(\',\')');
    expect(edge).toContain('limit(request.limit + 1)');
    expect(operation).not.toContain('.limit(500)');
    expect(operation).toContain(".from('friends')");
    expect(operation).toContain(".from('friendships')");
    expect(operation).toContain(".eq('status', 'accepted')");
    expect(operation).toContain(".eq('status', 'ACCEPTED')");
    expect(operation).toContain('readAllPages');
  });
});
