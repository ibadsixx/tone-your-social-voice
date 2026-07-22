import { gateway } from './client';
import type { ApiResult } from './client';

export async function createAdvertiser(data: { name: string; domain?: string; logo_url?: string }): Promise<ApiResult<{ id: string; name: string }>> {
  return gateway.from('advertisers').insert(data).select().single() as Promise<ApiResult<{ id: string; name: string }>>;
}

export async function getAdvertiserById(id: string): Promise<ApiResult<{ id: string; name: string; domain?: string; logo_url?: string }>> {
  return gateway.from('advertisers').select('*').eq('id', id).single() as Promise<ApiResult<{ id: string; name: string; domain?: string; logo_url?: string }>>;
}
