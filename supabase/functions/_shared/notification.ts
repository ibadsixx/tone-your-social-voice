// Shared, bounded notification write used by cross-project functions.
//
// Notifications live in their own project. Only this helper (inside an Edge
// Function) holds that project's service-role client; the browser never does.
// The deterministic row id makes repeated deliveries of the same logical event
// idempotent without a cache or a DELETE of permanent data.
//
// Required Function secrets: NOTIFICATIONS_PROJECT_URL,
// NOTIFICATIONS_SERVICE_ROLE_KEY (plus the caller's CENTRAL_AUTH_* secrets).

import { operationId, serviceClient } from './crossProject.ts';

export const NOTIFICATION_TYPES = [
  'like', 'comment', 'mention', 'follow', 'tag', 'share',
  'post_from_followed', 'group_post', 'poke', 'hashtag_post',
  'friend_request', 'message_request', 'invitation',
  'group_membership_accepted', 'security_login', 'channel_post',
  'group_member_removed', 'group_member_banned', 'group_member_unbanned',
  'group_member_restricted', 'group_member_unrestricted',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationInput {
  actorId: string;
  userId: string;
  type: NotificationType;
  message: string;
  postId?: string | null;
  commentId?: string | null;
  groupId?: string | null;
  /** Caller-supplied dedupe key; combined with the natural fields below. */
  dedupeKey?: string | null;
}

/**
 * Insert (or re-return) one notification row. The primary key is derived from
 * the logical event, so a retry after a partial failure cannot create a second
 * row. `ignoreDuplicates` preserves the first successful write.
 */
export async function insertNotification(input: NotificationInput): Promise<Record<string, unknown> | null> {
  if (input.actorId === input.userId) return null; // never notify yourself

  const client = serviceClient('NOTIFICATIONS_PROJECT_URL', 'NOTIFICATIONS_SERVICE_ROLE_KEY');
  // Bucket identical events by hour: an accidental retry is deduped, while a
  // genuinely new action an hour later is still a new notification.
  const hourBucket = new Date().toISOString().slice(0, 13);
  const id = await operationId(input.actorId, `notify:${input.type}:${hourBucket}`, {
    userId: input.userId,
    message: input.message,
    postId: input.postId ?? null,
    commentId: input.commentId ?? null,
    groupId: input.groupId ?? null,
    dedupeKey: input.dedupeKey ?? null,
  });

  const row = {
    id,
    user_id: input.userId,
    actor_id: input.actorId,
    type: input.type,
    message: input.message,
    is_read: false,
    post_id: input.postId ?? null,
    comment_id: input.commentId ?? null,
    group_id: input.groupId ?? null,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from('notifications')
    .upsert(row, { onConflict: 'id', ignoreDuplicates: true })
    .select('id, user_id, actor_id, type, message, is_read, post_id, comment_id, group_id, created_at')
    .maybeSingle();
  if (error) throw error;

  if (data) return data as Record<string, unknown>;

  // A concurrent retry won the upsert; read the already-committed row.
  const { data: existing, error: readError } = await client
    .from('notifications')
    .select('id, user_id, actor_id, type, message, is_read, post_id, comment_id, group_id, created_at')
    .eq('id', id)
    .maybeSingle();
  if (readError) throw readError;
  return existing as Record<string, unknown> | null;
}
