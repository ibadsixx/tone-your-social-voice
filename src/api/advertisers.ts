import { dataClient } from '@/lib/supabase/dataClient';
import type { ApiResult } from '@/lib/supabase/dataClient';

export async function createAdvertiser(data: { name: string; domain?: string; logo_url?: string }): Promise<ApiResult<{ id: string; name: string }>> {
  return dataClient.from('advertisers').insert(data).select().single() as Promise<ApiResult<{ id: string; name: string }>>;
}

export async function getAdvertiserById(id: string): Promise<ApiResult<{ id: string; name: string; domain?: string; logo_url?: string }>> {
  return dataClient.from('advertisers').select('*').eq('id', id).single() as Promise<ApiResult<{ id: string; name: string; domain?: string; logo_url?: string }>>;
}
