// Idempotent blocking-state projection for profile reads.
//
// Blocks are owned by the Blocking project, but profile reads need to know them
// without querying that project on every page view. This function projects the
// VERIFIED caller's own bidirectional block state into a small row in the
// profiles project. The source `blocks` rows are never modified or deleted; the
// projection is keyed by the natural id (user_id), so a retry or partial failure
// simply rewrites the same row with fresh data. This is a synchronization
// record required for correctness, not a temporary cache.
//
// Function secrets: CENTRAL_AUTH_URL, CENTRAL_AUTH_ANON_KEY,
// BLOCKING_PROJECT_URL, BLOCKING_SERVICE_ROLE_KEY,
// PROFILES_PROJECT_URL, PROFILES_SERVICE_ROLE_KEY.
//
// Assumed tables/columns (confirm externally before deployment):
//   blocking project: blocks(blocker_id, blocked_id, block_type, created_at)
//   profiles project: block_projection(user_id PRIMARY KEY,
//                       blocked_user_ids jsonb, blocked_by_ids jsonb,
//                       updated_at timestamptz)
// If the live projection table or its column names differ, only the two
// `.from(...)` calls and the row object below need to change.

import { serviceClient } from '../_shared/crossProject.ts';
import {
  assertFields,
  badRequest,
  handleRequest,
  ok,
  oneOf,
  type VerifiedContext,
} from '../_shared/operation.ts';

const ACTIONS = ['sync'] as const;
const MAX_BLOCKS = 1000;

Deno.serve((req) => handleRequest(req, ['POST'], async (ctx: VerifiedContext) => {
  assertFields(ctx.body, ['action']);
  const action = oneOf(ctx.body.action, 'action', ACTIONS);
  if (action !== 'sync') badRequest('Unknown blocking sync action');

  const blocking = serviceClient('BLOCKING_PROJECT_URL', 'BLOCKING_SERVICE_ROLE_KEY');
  const { data, error } = await blocking
    .from('blocks')
    .select('blocker_id, blocked_id, block_type')
    .or(`blocker_id.eq.${ctx.callerId},blocked_id.eq.${ctx.callerId}`)
    .limit(MAX_BLOCKS);
  if (error) throw error;

  const blockedUserIds = new Set<string>();
  const blockedByIds = new Set<string>();
  for (const row of data ?? []) {
    if (typeof row.blocker_id !== 'string' || typeof row.blocked_id !== 'string') continue;
    if (row.blocker_id === ctx.callerId) blockedUserIds.add(row.blocked_id);
    if (row.blocked_id === ctx.callerId) blockedByIds.add(row.blocker_id);
  }

  const profiles = serviceClient('PROFILES_PROJECT_URL', 'PROFILES_SERVICE_ROLE_KEY');
  const syncedAt = new Date().toISOString();
  const { error: writeError } = await profiles.from('block_projection').upsert({
    user_id: ctx.callerId,
    blocked_user_ids: [...blockedUserIds],
    blocked_by_ids: [...blockedByIds],
    updated_at: syncedAt,
  }, { onConflict: 'user_id' });
  if (writeError) throw writeError;

  return ok({
    status: 'ok',
    blocked_count: blockedUserIds.size,
    blocked_by_count: blockedByIds.size,
    synced_at: syncedAt,
  });
}));
