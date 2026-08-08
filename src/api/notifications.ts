import { gateway } from './client';
import type { ApiResult } from './client';
import type { Notification } from './types';

export async function getNotifications(userId: string, limit = 50): Promise<ApiResult<Notification[]>> {
  return gateway.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit) as Promise<ApiResult<Notification[]>>;
}

export async function createNotification(data: Partial<Notification>): Promise<ApiResult<Notification>> {
  return gateway.from('notifications').insert(data).select().single() as Promise<ApiResult<Notification>>;
}

export async function markAsRead(id: string): Promise<ApiResult<null>> {
  return gateway.from('notifications').update({ is_read: true }).eq('id', id) as Promise<ApiResult<null>>;
}

export async function markAllAsRead(userId: string): Promise<ApiResult<null>> {
  return gateway.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false) as Promise<ApiResult<null>>;
}

export async function deleteNotification(id: string): Promise<ApiResult<null>> {
  return gateway.from('notifications').delete().eq('id', id) as Promise<ApiResult<null>>;
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { data } = await gateway.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_read', false);
  return (data as unknown as number) || 0;
}
