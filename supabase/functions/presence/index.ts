// Cross-project presence coordination.
//
// Presence rows live in the `presence` project; friend ownership lives in the
// `friends` project. The verified central Auth user may update only their own
// presence row. Heartbeats are idempotent upserts keyed by user_id, logout is an
// idempotent delete, and online-friends is a read-only intersection. No cache
// table is created or needed.
//
// Function secrets: CENTRAL_AUTH_URL, CENTRAL_AUTH_ANON_KEY,
// PRESENCE_PROJECT_URL, PRESENCE_SERVICE_ROLE_KEY,
// FRIENDS_PROJECT_URL, FRIENDS_SERVICE_ROLE_KEY.
//
// Assumed tables/columns: presence.user_presence(user_id, last_seen_at, status)
// and friends.friendships(requester_id, receiver_id, status).

import { serviceClient } from '../_shared/crossProject.ts';
import {
  assertFields,
  handleRequest,
  ok,
  oneOf,
  type VerifiedContext,
} from '../_shared/operation.ts';

const ACTIONS = ['heartbeat', 'logout', 'online-friends'] as const;

Deno.serve((req) => handleRequest(req, ['POST'], async (ctx: VerifiedContext) => {
  assertFields(ctx.body, ['action']);
  const action = oneOf(ctx.body.action, 'action', ACTIONS);
  const presence = serviceClient('PRESENCE_PROJECT_URL', 'PRESENCE_SERVICE_ROLE_KEY');

  if (action === 'heartbeat') {
    const { error } = await presence.from('user_presence').upsert({
      user_id: ctx.callerId,
      last_seen_at: new Date().toISOString(),
      status: 'online',
    }, { onConflict: 'user_id' });
    if (error) throw error;
    return ok({ ok: true, updated: 1 });
  }

  if (action === 'logout') {
    const { error } = await presence.from('user_presence').delete().eq('user_id', ctx.callerId);
    if (error) throw error;
    return ok({ ok: true, deleted: 1 });
  }

  const friends = serviceClient('FRIENDS_PROJECT_URL', 'FRIENDS_SERVICE_ROLE_KEY');
  const { data: relationships, error: friendsError } = await friends
    .from('friendships')
    .select('requester_id, receiver_id')
    .or(`requester_id.eq.${ctx.callerId},receiver_id.eq.${ctx.callerId}`)
    .eq('status', 'accepted');
  if (friendsError) throw friendsError;

  const friendIds = (relationships ?? []).map((row) =>
    row.requester_id === ctx.callerId ? row.receiver_id : row.requester_id
  ).filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (friendIds.length === 0) return ok({ online: [] });

  const { data: rows, error: presenceError } = await presence
    .from('user_presence')
    .select('user_id, last_seen_at, status')
    .in('user_id', friendIds)
    .eq('status', 'online');
  if (presenceError) throw presenceError;
  return ok({ online: rows ?? [] });
}));
