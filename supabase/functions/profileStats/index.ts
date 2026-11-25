// Cross-project public relationship counts.
//
// Friend, follower and blocking data live in separate projects. The function
// verifies the central Auth caller, then returns only aggregate counts for the
// requested profile. No relationship rows, block targets or private profiles
// are returned. Read-only and retry-safe; no cache is written.
//
// Function secrets: CENTRAL_AUTH_URL, CENTRAL_AUTH_ANON_KEY,
// FRIENDS_PROJECT_URL, FRIENDS_SERVICE_ROLE_KEY,
// FOLLOWERS_PROJECT_URL, FOLLOWERS_SERVICE_ROLE_KEY,
// BLOCKING_PROJECT_URL, BLOCKING_SERVICE_ROLE_KEY.
//
// Assumed tables/columns: friendships(requester_id, receiver_id),
// followers(follower_id, following_id), blocks(blocker_id, blocked_id).

import { serviceClient } from '../_shared/crossProject.ts';
import {
  assertFields,
  handleRequest,
  ok,
  requireUuid,
  type VerifiedContext,
} from '../_shared/operation.ts';

type Client = ReturnType<typeof serviceClient>;

async function countWhere(
  client: Client,
  table: string,
  columns: string[],
  profileId: string
): Promise<number> {
  let total = 0;
  for (const column of columns) {
    const { count, error } = await client
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(column, profileId);
    if (error) throw error;
    total += count ?? 0;
  }
  return total;
}

Deno.serve((req) => handleRequest(req, ['POST'], async (ctx: VerifiedContext) => {
  assertFields(ctx.body, ['profileId']);
  const profileId = requireUuid(ctx.body.profileId, 'profileId');

  const friends = serviceClient('FRIENDS_PROJECT_URL', 'FRIENDS_SERVICE_ROLE_KEY');
  const followers = serviceClient('FOLLOWERS_PROJECT_URL', 'FOLLOWERS_SERVICE_ROLE_KEY');
  const blocking = serviceClient('BLOCKING_PROJECT_URL', 'BLOCKING_SERVICE_ROLE_KEY');

  const [friendCount, followerCount, blockedCount] = await Promise.all([
    countWhere(friends, 'friendships', ['requester_id', 'receiver_id'], profileId),
    countWhere(followers, 'followers', ['follower_id', 'following_id'], profileId),
    countWhere(blocking, 'blocks', ['blocker_id'], profileId),
  ]);

  return ok({ friends: friendCount, followers: followerCount, blocking: blockedCount });
}));
