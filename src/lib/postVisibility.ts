import { gateway } from '@/lib/gateway';

export interface PostVisibilityFields {
  user_id: string;
  visibility?: string | null;
  audience_type?: string | null;
  audience_user_ids?: string[] | null;
  audience_excluded_user_ids?: string[] | null;
  status?: string | null;
}

export async function loadFriendIds(userId?: string): Promise<Set<string>> {
  if (!userId) return new Set();
  const { data } = await gateway
    .from('friends')
    .select('requester_id, receiver_id')
    .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
    .eq('status', 'accepted');
  const ids = new Set<string>();
  for (const row of (data || []) as Array<{ requester_id: string; receiver_id: string }>) {
    if (row.requester_id !== userId) ids.add(row.requester_id);
    if (row.receiver_id !== userId) ids.add(row.receiver_id);
  }
  return ids;
}

// Canonical audience resolution for post-shaped content (posts, reels, photos).
//
// The Gateway enforces the audience for every read (see
// gateway/src/features/contentVisibility.ts) and the RLS policy
// `Posts are viewable based on audience and status` enforces it for direct
// Supabase access. This module is the client-side defense-in-depth layer: it
// must never hide content the viewer is ALLOWED to see, and it must never show
// content a hidden row already leaked.
//
// `audience_type` is the canonical, RLS-authoritative column (column DEFAULT
// 'public'). The legacy `visibility` column is only consulted when
// `audience_type` carries no value, and it must never shadow it: the reel
// composer wrote both columns with the same value, so the previous
// `if (post.visibility && post.visibility !== 'public') return false` ran
// before the audience check and reduced a Friends post to owner-only. That
// ordering bug is what made Friends content look like "Only me" while the
// unfiltered API made it look public to everyone else.

/** A stored audience value we could not interpret. Fails closed. */
export const DENIED_AUDIENCE = 'denied';

/**
 * Normalize a stored audience value to a canonical token. Returns `null` when
 * the field carries no value (caller may fall back to another column) and
 * `DENIED_AUDIENCE` when the value is present but unrecognized, so an unknown
 * audience can never be silently upgraded to public.
 */
export function canonicalAudienceType(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().toLowerCase();
  if (raw === '') return null;
  switch (raw.replace(/[\s-]+/g, '_')) {
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
      return DENIED_AUDIENCE;
  }
}

/** Resolve the audience of a row, preferring the canonical `audience_type`. */
export function resolvePostAudience(post: PostVisibilityFields): string {
  const declared = canonicalAudienceType(post.audience_type);
  if (declared !== null) return declared;
  const legacy = canonicalAudienceType(post.visibility);
  if (legacy === null) return 'public';
  return legacy;
}

/**
 * True when the row is public content any viewer — including a guest — may see.
 * Public discovery surfaces (Explore, search, hashtags) use this so
 * friends-only content can never appear there even for an authorized friend.
 */
export function isPublicAudience(post: PostVisibilityFields): boolean {
  if (post.status && post.status !== 'published') return false;
  return resolvePostAudience(post) === 'public';
}

export function isPostVisibleToViewer(
  post: PostVisibilityFields,
  viewerId: string,
  friendIds: Set<string>
): boolean {
  const authorId = post.user_id;

  // The owner always sees their own content, in every audience.
  if (viewerId && viewerId === authorId) return true;

  // A guest (no viewer id) is never a friend: only public content passes.
  if (!viewerId) return isPublicAudience(post);

  // Drafts and scheduled posts are author-only.
  if (post.status && post.status !== 'published') return false;

  const audience = resolvePostAudience(post);

  if (audience === 'public') {
    return !post.audience_excluded_user_ids?.includes(viewerId);
  }

  if (audience === 'friends') return friendIds.has(authorId);

  if (audience === 'friends_except') {
    if (!friendIds.has(authorId)) return false;
    return !post.audience_excluded_user_ids?.includes(viewerId);
  }

  if (audience === 'specific') {
    return !!post.audience_user_ids?.includes(viewerId);
  }

  // only_me, custom_list (needs a list-membership reader) and any unrecognized
  // value are denied.
  return false;
}