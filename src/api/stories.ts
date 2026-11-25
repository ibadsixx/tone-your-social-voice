import { dataClient } from '@/lib/supabase/dataClient';
import type { ApiResult } from '@/lib/supabase/dataClient';
import type { Story } from './types';

export async function createStory(data: Partial<Story>): Promise<ApiResult<Story>> {
  return dataClient.from('stories').insert(data).select().single() as Promise<ApiResult<Story>>;
}

export async function getStoriesByUser(userId: string): Promise<ApiResult<Story[]>> {
  return dataClient.from('stories').select('*').eq('user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<Story[]>>;
}

export async function getActiveStories(): Promise<ApiResult<Story[]>> {
  return dataClient.from('stories').select('*').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }) as Promise<ApiResult<Story[]>>;
}

export async function getStoryById(id: string): Promise<ApiResult<Story>> {
  return dataClient.from('stories').select('*').eq('id', id).single() as Promise<ApiResult<Story>>;
}

export async function deleteStory(id: string): Promise<ApiResult<null>> {
  return dataClient.from('stories').delete().eq('id', id) as Promise<ApiResult<null>>;
}

export async function updateStory(id: string, data: Partial<Story>): Promise<ApiResult<null>> {
  return dataClient.from('stories').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function hasActiveStories(userId: string): Promise<boolean> {
  const { data } = await dataClient.from('stories').select('id').eq('user_id', userId).gt('expires_at', new Date().toISOString()).limit(1);
  return (data && Array.isArray(data) && data.length > 0) || false;
}
