// Bounded notification writes from a verified in-app actor.
//
// Notifications live in their own project. The browser never holds that
// project's service key; this function does, exclusively through Function
// secrets. Caller identity comes only from the central Auth JWT — a client-
// supplied actor_id is never accepted. The shared writer derives a deterministic
// primary key from the logical event so retries and partial failures cannot
// create duplicate rows; nothing is deleted and no cache is written.
//
// Only user-triggerable types are accepted here. Server-only events (security,
// moderation, scheduled posts) must be inserted by the workflow that owns them,
// not by a browser request.
//
// Function secrets: CENTRAL_AUTH_URL, CENTRAL_AUTH_ANON_KEY,
// NOTIFICATIONS_PROJECT_URL, NOTIFICATIONS_SERVICE_ROLE_KEY.
//
// Assumed table/columns in the notifications project (confirm externally):
//   notifications(id, user_id, actor_id, type, message, is_read, post_id,
//                 comment_id, group_id, created_at)
// with a primary key on id (the deterministic hash) and FK constraints to
// users/posts/comments where applicable.

import { insertNotification } from '../_shared/notification.ts';
import {
  assertFields,
  handleRequest,
  ok,
  oneOf,
  optionalText,
  optionalUuid,
  requireUuid,
  requireValue,
  type VerifiedContext,
} from '../_shared/operation.ts';

const CLIENT_TYPES = ['like', 'comment', 'mention', 'tag', 'share', 'follow', 'poke'] as const;
const FIELDS = ['userId', 'type', 'message', 'postId', 'commentId', 'groupId', 'dedupeKey'] as const;

Deno.serve((req) => handleRequest(req, ['POST'], async (ctx: VerifiedContext) => {
  assertFields(ctx.body, FIELDS);
  const userId = requireUuid(ctx.body.userId, 'userId');       // recipient
  const type = oneOf(ctx.body.type, 'type', CLIENT_TYPES);
  const message = requireValue(ctx.body.message, 'message').slice(0, 500);
  const postId = optionalUuid(ctx.body.postId, 'postId');
  const commentId = optionalUuid(ctx.body.commentId, 'commentId');
  const groupId = optionalUuid(ctx.body.groupId, 'groupId');
  const dedupeKey = optionalText(ctx.body.dedupeKey, 'dedupeKey', 120);

  const inserted = await insertNotification({
    actorId: ctx.callerId, // authoritative actor, never from the request body
    userId,
    type,
    message,
    postId,
    commentId,
    groupId,
    dedupeKey,
  });

  return ok({ status: inserted ? 'created' : 'skipped' });
}));
