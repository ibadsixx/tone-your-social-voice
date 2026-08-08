import { gateway } from './client';
import type { ApiResult } from './client';

export type BlockType = 'messaging' | 'full';

export interface BlockedUserRow {
  blocked_id: string;
  created_at: string;
  block_type: string;
}

export interface BlockRelation {
  isBlocked: boolean;
  isBlockedBy: boolean;
}

export async function blockUser(blockerId: string, blockedId: string, blockType: BlockType = 'full'): Promise<ApiResult<null>> {
  return gateway.rpc('block_user', {
    p_blocker: blockerId,
    p_blocked: blockedId,
    p_block_type: blockType,
  }) as Promise<ApiResult<null>>;
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<ApiResult<null>> {
  return gateway.rpc('unblock_user', { p_blocker: blockerId, p_blocked: blockedId }) as Promise<ApiResult<null>>;
}

export async function getBlockedUsers(userId: string): Promise<ApiResult<BlockedUserRow[]>> {
  return gateway.rpc('get_blocked_users', { p_user: userId }) as Promise<ApiResult<BlockedUserRow[]>>;
}

export async function getBlockStatus(userA: string, userB: string): Promise<BlockRelation> {
  const { data } = await gateway.rpc('get_block_relation', { user1_id: userA, user2_id: userB });
  const rows = Array.isArray(data) ? data as Record<string, unknown>[] : [];
  const rel = rows[0] ?? {};
  return {
    isBlocked: rel.user1_blocked_user2 === true,
    isBlockedBy: rel.user2_blocked_user1 === true,
  };
}

export async function getBlockedUserIds(userId: string): Promise<ApiResult<string[]>> {
  const { data, error } = await gateway.rpc('get_user_blocks', { p_user: userId });
  if (error) return { data: null, error };
  const rows = Array.isArray(data) ? data as Record<string, unknown>[] : [];
  return { data: rows.map(r => String(r.peer_id)).filter(Boolean), error: null };
}

export async function restrictUser(userId: string, restrictedUserId: string): Promise<ApiResult<null>> {
  return gateway.rpc('restrict_user', { p_user: userId, p_restricted: restrictedUserId }) as Promise<ApiResult<null>>;
}

export async function unrestrictUser(userId: string, restrictedUserId: string): Promise<ApiResult<null>> {
  return gateway.rpc('unrestrict_user', { p_user: userId, p_restricted: restrictedUserId }) as Promise<ApiResult<null>>;
}

export async function getRestrictedUsers(userId: string): Promise<ApiResult<{ id: string; restricted_user_id: string; created_at: string }[]>> {
  return gateway.rpc('get_restricted_users', { p_user: userId }) as Promise<ApiResult<{ id: string; restricted_user_id: string; created_at: string }[]>>;
}

export async function isRestricted(userId: string, targetId: string): Promise<boolean> {
  const { data } = await gateway.rpc('is_restricted', { p_user: userId, p_target: targetId });
  const rows = Array.isArray(data) ? data as Record<string, unknown>[] : [];
  return rows[0]?.is_restricted === true;
}

export interface BlockedNickname {
  id: string;
  nickname: string;
  created_at: string;
}

export async function getBlockedNicknames(userId: string): Promise<ApiResult<BlockedNickname[]>> {
  return gateway.rpc('get_blocked_nicknames', { p_user: userId }) as Promise<ApiResult<BlockedNickname[]>>;
}

export async function addBlockedNickname(userId: string, nickname: string): Promise<ApiResult<null>> {
  return gateway.rpc('add_blocked_nickname', { p_user: userId, p_nickname: nickname }) as Promise<ApiResult<null>>;
}

export async function removeBlockedNickname(id: string): Promise<ApiResult<null>> {
  return gateway.rpc('remove_blocked_nickname', { p_id: id }) as Promise<ApiResult<null>>;
}

export type BlockedSenderTable = 'blocked_message_senders' | 'blocked_app_invite_senders' | 'blocked_event_invite_senders';

export interface BlockedSender {
  id: string;
  blocked_user_id: string;
  created_at: string;
}

export async function getBlockedSenders(table: BlockedSenderTable, userId: string): Promise<ApiResult<BlockedSender[]>> {
  return gateway.rpc('get_blocked_senders', { p_table: table, p_user: userId }) as Promise<ApiResult<BlockedSender[]>>;
}

export async function addBlockedSender(table: BlockedSenderTable, userId: string, blockedUserId: string): Promise<ApiResult<null>> {
  return gateway.rpc('add_blocked_sender', { p_table: table, p_user: userId, p_blocked: blockedUserId }) as Promise<ApiResult<null>>;
}

export async function removeBlockedSender(table: BlockedSenderTable, id: string): Promise<ApiResult<null>> {
  return gateway.rpc('remove_blocked_sender', { p_table: table, p_id: id }) as Promise<ApiResult<null>>;
}
