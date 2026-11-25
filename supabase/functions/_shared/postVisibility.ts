// Canonical post-visibility predicates for Edge Functions.
//
// These mirror the predicates that used to live in the abandoned Gateway
// (`contentAudience.ts`, `reactionUsers.ts`, `scheduledPostPrivacy.ts`,
// `profileContent.ts`). Keeping one copy here means a profile-content read and
// a public sitemap read cannot disagree about whether the same row is public.
// No service keys and no project routing live in this file.
//
// Assumed post columns (confirm against the live posts project):
//   user_id, status, audience_type, visibility,
//   audience_user_ids, audience_excluded_user_ids,
//   type, media_type, shared_post_id, created_at.

export type PostRow = Record<string, unknown>;

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** PostgREST arrays come back as unknown[]; only UUID-shaped strings are used. */
export function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export function canonicalAudienceType(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  switch (raw.toLowerCase().replace(/[\s-]+/g, '_')) {
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

/** Viewer-aware audience. Only used when the caller has a verified identity. */
export function resolveContentAudience(row: PostRow): string {
  const declared = canonicalAudienceType(row.audience_type);
  if (declared !== null) return declared;
  const legacy = canonicalAudienceType(row.visibility);
  return legacy ?? 'public';
}

function exactlyPublic(value: unknown): boolean {
  return text(value) === 'public';
}

/**
 * The public/anonymous boundary: exact `audience_type = 'public'`, legacy
 * `visibility` must not contradict it, and the status must be guest-readable.
 * No aliases, no case-folding and no "missing means public" here.
 */
export function isGuestSafePublicContent(row: PostRow): boolean {
  if (!row || typeof row !== 'object') return false;
  if (!exactlyPublic(row.audience_type)) return false;
  const legacy = row.visibility;
  if (legacy !== null && legacy !== undefined && !exactlyPublic(legacy)) return false;
  const status = text(row.status);
  return status === null || status === 'published' || status === 'live';
}

/** Sitemap is stricter than a guest read: RLS denies a NULL/unknown status. */
export function isAnonymousReadablePost(row: PostRow): boolean {
  return isGuestSafePublicContent(row) && text(row.status) === 'published';
}

export function isScheduledPost(row: PostRow): boolean {
  return row.status === 'scheduled';
}

/**
 * Same predicate as the app's `canViewerViewPost`: owner bypass, then status,
 * then the audience matrix. Unrecognised audiences fail closed.
 */
export function canViewerViewPost(
  row: PostRow | null | undefined,
  viewerId: string | null,
  friendIds: Set<string> = new Set()
): boolean {
  if (!row || typeof row !== 'object') return false;
  const owner = text(row.user_id);
  if (owner && owner === viewerId) return true;
  if (!viewerId) return isGuestSafePublicContent(row);

  const status = text(row.status);
  if (status && status !== 'published' && status !== 'live') return false;

  const audience = resolveContentAudience(row);
  const excluded = stringArray(row.audience_excluded_user_ids);
  if (audience === 'public') return !excluded.includes(viewerId);
  if (audience === 'friends') return !!owner && friendIds.has(owner);
  if (audience === 'friends_except') return !!owner && friendIds.has(owner) && !excluded.includes(viewerId);
  if (audience === 'specific') return stringArray(row.audience_user_ids).includes(viewerId);
  return false;
}
