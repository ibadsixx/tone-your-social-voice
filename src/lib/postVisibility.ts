import { gateway } from '@/lib/gateway';

export interface PostVisibilityFields {
  user_id: string;
  visibility?: string | null;
  audience_type?: string | null;
  audience_user_ids?: string[] | null;
  audience_excluded_user_ids?: string[] | null;
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

export function isPostVisibleToViewer(
  post: PostVisibilityFields,
  viewerId: string,
  friendIds: Set<string>
): boolean {
  const authorId = post.user_id;

  if (viewerId === authorId) return true;

  if (post.visibility && post.visibility !== 'public') return false;

  const audience = post.audience_type;

  if (!audience || audience === 'public') return true;

  if (audience === 'only_me') return false;

  if (audience === 'friends') return friendIds.has(authorId);

  if (audience === 'friends_except') {
    if (!friendIds.has(authorId)) return false;
    const excluded = post.audience_excluded_user_ids;
    return !excluded || !excluded.includes(viewerId);
  }

  if (audience === 'specific') {
    const allowed = post.audience_user_ids;
    return !!allowed && allowed.includes(viewerId);
  }

  if (audience === 'custom_list') return false;

  return false;
}