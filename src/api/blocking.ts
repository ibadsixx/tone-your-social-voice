import { gateway } from './client';
import type { ApiResult } from './client';

export async function blockUser(blockerId: string, blockedId: string): Promise<ApiResult<null>> {
  return gateway.from('blocking').insert({ blocker_id: blockerId, blocked_id: blockedId }) as Promise<ApiResult<null>>;
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<ApiResult<null>> {
  return gateway.from('blocking').delete().eq('blocker_id', blockerId).eq('blocked_id', blockedId) as Promise<ApiResult<null>>;
}

export async function getBlockedUsers(userId: string): Promise<ApiResult<{ blocked_id: string }[]>> {
  return gateway.from('blocking').select('blocked_id').eq('blocker_id', userId) as Promise<ApiResult<{ blocked_id: string }[]>>;
}

export async function isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  const { data } = await gateway.from('blocking').select('blocked_id').eq('blocker_id', blockerId).eq('blocked_id', blockedId).limit(1);
  return (data && Array.isArray(data) && data.length > 0) || false;
}

export async function restrictUser(restricterId: string, targetId: string): Promise<ApiResult<null>> {
  return gateway.from('restricted_users').insert({ restricter_id: restricterId, target_id: targetId }) as Promise<ApiResult<null>>;
}

export async function unrestrictUser(restricterId: string, targetId: string): Promise<ApiResult<null>> {
  return gateway.from('restricted_users').delete().eq('restricter_id', restricterId).eq('target_id', targetId) as Promise<ApiResult<null>>;
}

export async function getRestrictedUsers(userId: string): Promise<ApiResult<{ target_id: string }[]>> {
  return gateway.from('restricted_users').select('target_id').eq('restricter_id', userId) as Promise<ApiResult<{ target_id: string }[]>>;
}
