import { gateway } from './client';
import type { ApiResult } from './client';
import type { Group } from './types';

export async function getGroupById(id: string): Promise<ApiResult<Group>> {
  return gateway.from('groups').select('*').eq('id', id).single() as Promise<ApiResult<Group>>;
}

export async function getGroupsByUser(userId: string): Promise<ApiResult<Group[]>> {
  return gateway.from('groups').select('*').eq('admin_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<Group[]>>;
}

export async function createGroup(data: Partial<Group>): Promise<ApiResult<Group>> {
  return gateway.from('groups').insert(data).select().single() as Promise<ApiResult<Group>>;
}

export async function updateGroup(id: string, data: Partial<Group>): Promise<ApiResult<null>> {
  return gateway.from('groups').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteGroup(id: string): Promise<ApiResult<null>> {
  return gateway.from('groups').delete().eq('id', id) as Promise<ApiResult<null>>;
}
