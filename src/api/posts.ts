import { gateway } from './client';
import type { ApiResult } from './client';
import type { Post } from './types';

const POST_SELECT_FULL = `
  *,
  profiles!posts_user_id_fkey (username, display_name, profile_pic),
  likes (id, user_id),
  comments (id, content, profiles:user_id (display_name)),
  shared_post:shared_post_id (id, content, media_url, media_type, type, created_at, profiles!posts_user_id_fkey (username, display_name, profile_pic)),
  group_posts (group_id, groups:group_id (id, name))
`;

const POST_SELECT_BASIC = `
  *,
  profiles!posts_user_id_fkey (username, display_name, profile_pic),
  shared_post:shared_post_id (id, content, media_url, media_type, type, created_at, profiles!posts_user_id_fkey (username, display_name, profile_pic))
`;

const POST_SELECT_REEL = `
  id, user_id, media_url, media_type, duration, music_url, music_source, music_start,
  music_video_id, content, likes_count, comments_count, share_count, created_at,
  profiles:user_id (username, display_name, profile_pic)
`;

export async function createPost(data: Partial<Post>): Promise<ApiResult<{ id: string }>> {
  return gateway.from('posts').insert(data).select('id').single();
}

export async function createPostReturnAll(data: Partial<Post>): Promise<ApiResult<Post>> {
  return gateway.from('posts').insert([data]).select().single() as Promise<ApiResult<Post>>;
}

export async function createPosts(data: Partial<Post>[]): Promise<ApiResult<Post[]>> {
  return gateway.from('posts').insert(data) as Promise<ApiResult<Post[]>>;
}

export async function getPostById(id: string): Promise<ApiResult<Post>> {
  return gateway.from('posts').select(POST_SELECT_FULL).eq('id', id).maybeSingle() as Promise<ApiResult<Post>>;
}

export async function getPostByIdBasic(id: string): Promise<ApiResult<Post>> {
  return gateway.from('posts').select(POST_SELECT_BASIC).eq('id', id).maybeSingle() as Promise<ApiResult<Post>>;
}

export async function getPostByIdSingle(id: string): Promise<ApiResult<Post>> {
  return gateway.from('posts').select('*').eq('id', id).single() as Promise<ApiResult<Post>>;
}

export async function getFeedPosts(offset: number, limit: number): Promise<ApiResult<Post[]>> {
  return gateway.from('posts').select(POST_SELECT_FULL).order('created_at', { ascending: false }).range(offset, offset + limit - 1) as Promise<ApiResult<Post[]>>;
}

export async function getUserPosts(userId: string): Promise<ApiResult<Post[]>> {
  return gateway.from('posts').select(POST_SELECT_BASIC).eq('user_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<Post[]>>;
}

export async function getExplorePosts(offset: number, limit: number): Promise<ApiResult<Post[]>> {
  return gateway.from('posts').select(`
    *,
    profiles!posts_user_id_fkey (username, display_name, profile_pic),
    likes (count),
    comments (count)
  `).not('media_url', 'is', null).order('created_at', { ascending: false }).range(offset, offset + limit - 1) as Promise<ApiResult<Post[]>>;
}

export async function getPostsByHashtag(postIds: string[]): Promise<ApiResult<Post[]>> {
  return gateway.from('posts').select(POST_SELECT_BASIC).in('id', postIds).eq('status', 'published').order('created_at', { ascending: false }) as Promise<ApiResult<Post[]>>;
}

export async function getMentionsPosts(postIds: string[]): Promise<ApiResult<Post[]>> {
  return gateway.from('posts').select('id, content, user_id, created_at').in('id', postIds) as Promise<ApiResult<Post[]>>;
}

export async function getReelById(id: string): Promise<ApiResult<Post>> {
  return gateway.from('posts').select(POST_SELECT_REEL).eq('id', id).single() as Promise<ApiResult<Post>>;
}

export async function getReels(limit: number = 10, cursor?: string): Promise<ApiResult<Post[]>> {
  let query = gateway.from('posts').select(POST_SELECT_REEL)
    .eq('type', 'reel')
    .eq('status', 'published')
    .not('media_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (cursor) query = query.lt('created_at', cursor);
  return query as Promise<ApiResult<Post[]>>;
}

export async function getHorizontalReels(limit: number = 10): Promise<ApiResult<Post[]>> {
  return gateway.from('posts').select(`
    id, user_id, media_url, media_type, duration, content, likes_count, comments_count, created_at,
    profiles:user_id (username, display_name, profile_pic)
  `).eq('status', 'published').eq('media_type', 'video').not('media_url', 'is', null).order('created_at', { ascending: false }).limit(limit) as Promise<ApiResult<Post[]>>;
}

export async function getReelIds(): Promise<ApiResult<{ id: string }[]>> {
  return gateway.from('posts').select('id').eq('type', 'reel').order('created_at', { ascending: false }).limit(100) as Promise<ApiResult<{ id: string }[]>>;
}

export async function getReelCounts(id: string): Promise<ApiResult<{ likes_count: number; comments_count: number; share_count: number }>> {
  return gateway.from('posts').select('likes_count, comments_count, share_count').eq('id', id).single() as Promise<ApiResult<{ likes_count: number; comments_count: number; share_count: number }>>;
}

export async function getReelMedia(id: string): Promise<ApiResult<{ media_url: string; media_type: string; thumbnail: string | null }>> {
  return gateway.from('posts').select('media_url, media_type, thumbnail').eq('id', id).single() as Promise<ApiResult<{ media_url: string; media_type: string; thumbnail: string | null }>>;
}

export async function getReelShareCounts(id: string): Promise<ApiResult<{ share_count: number; shares_count: number }>> {
  return gateway.from('posts').select('share_count, shares_count').eq('id', id).single() as Promise<ApiResult<{ share_count: number; shares_count: number }>>;
}

export async function getReelOwnerId(id: string): Promise<ApiResult<{ user_id: string }>> {
  return gateway.from('posts').select('user_id').eq('id', id).maybeSingle() as Promise<ApiResult<{ user_id: string }>>;
}

export async function getScheduledPosts(userId: string): Promise<ApiResult<Post[]>> {
  return gateway.from('posts').select(POST_SELECT_BASIC).eq('user_id', userId).eq('status', 'scheduled').order('scheduled_at', { ascending: true }) as Promise<ApiResult<Post[]>>;
}

export async function getUserPhotos(userId: string): Promise<ApiResult<{ media_url: string }[]>> {
  return gateway.from('posts').select('media_url').eq('user_id', userId).not('media_url', 'is', null).order('created_at', { ascending: false }) as Promise<ApiResult<{ media_url: string }[]>>;
}

export async function updatePost(id: string, data: Partial<Post>): Promise<ApiResult<null>> {
  return gateway.from('posts').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function updatePostReturnAll(id: string, data: Partial<Post>): Promise<ApiResult<Post>> {
  return gateway.from('posts').update(data).eq('id', id).select().single() as Promise<ApiResult<Post>>;
}

export async function deletePost(id: string): Promise<ApiResult<null>> {
  return gateway.from('posts').delete().eq('id', id) as Promise<ApiResult<null>>;
}
