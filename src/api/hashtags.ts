import { gateway } from './client';
import type { ApiResult } from './client';
import type { Hashtag } from './types';

export async function getHashtagByTag(tag: string): Promise<ApiResult<Hashtag>> {
  return gateway.from('hashtags').select('*').eq('tag', tag).maybeSingle() as Promise<ApiResult<Hashtag>>;
}

export async function getHashtagById(id: string): Promise<ApiResult<Hashtag>> {
  return gateway.from('hashtags').select('*').eq('id', id).single() as Promise<ApiResult<Hashtag>>;
}

export async function createHashtag(tag: string): Promise<ApiResult<Hashtag>> {
  return gateway.from('hashtags').insert({ tag, follower_count: 0 }).select().single() as Promise<ApiResult<Hashtag>>;
}

export async function updateHashtag(id: string, data: Partial<Hashtag>): Promise<ApiResult<null>> {
  return gateway.from('hashtags').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function searchHashtags(query: string): Promise<ApiResult<Hashtag[]>> {
  return gateway.from('hashtags').select('*').ilike('tag', `%${query}%`).limit(20) as Promise<ApiResult<Hashtag[]>>;
}

export async function getTrendingHashtags(): Promise<ApiResult<Hashtag[]>> {
  return gateway.from('hashtags').select('*').order('follower_count', { ascending: false }).limit(10) as Promise<ApiResult<Hashtag[]>>;
}

export async function followHashtag(userId: string, hashtagId: string): Promise<ApiResult<null>> {
  return gateway.from('hashtag_follows').insert({ user_id: userId, hashtag_id: hashtagId }) as Promise<ApiResult<null>>;
}

export async function unfollowHashtag(userId: string, hashtagId: string): Promise<ApiResult<null>> {
  return gateway.from('hashtag_follows').delete().eq('user_id', userId).eq('hashtag_id', hashtagId) as Promise<ApiResult<null>>;
}

export async function getFollowedHashtags(userId: string): Promise<ApiResult<Hashtag[]>> {
  return gateway.from('hashtag_follows').select('hashtags (*)').eq('user_id', userId) as Promise<ApiResult<Hashtag[]>>;
}
