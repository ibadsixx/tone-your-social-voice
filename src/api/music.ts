import { gateway } from './client';
import type { ApiResult } from './client';

export async function searchMusic(query: string): Promise<ApiResult<{ id: string; title: string; artist: string; url: string }[]>> {
  return gateway.from('music_library').select('*').ilike('title', `%${query}%`).limit(20) as Promise<ApiResult<{ id: string; title: string; artist: string; url: string }[]>>;
}

export async function getMusicById(id: string): Promise<ApiResult<{ id: string; title: string; artist: string; url: string }>> {
  return gateway.from('music_library').select('*').eq('id', id).single() as Promise<ApiResult<{ id: string; title: string; artist: string; url: string }>>;
}
