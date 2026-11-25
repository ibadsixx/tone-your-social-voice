import { dataClient } from '@/lib/supabase/dataClient';
import type { ApiResult } from '@/lib/supabase/dataClient';
import type { Comment } from './types';

const COMMENT_SELECT = `
  *,
  profiles:user_id (username, display_name, profile_pic)
`;

export async function createComment(data: Partial<Comment>): Promise<ApiResult<Comment>> {
  return dataClient.from('comments').insert(data).select().single() as Promise<ApiResult<Comment>>;
}

export async function getCommentsByPost(postId: string): Promise<ApiResult<Comment[]>> {
  return dataClient.from('comments').select(COMMENT_SELECT).eq('post_id', postId).order('created_at', { ascending: true }) as Promise<ApiResult<Comment[]>>;
}

export async function getCommentById(id: string): Promise<ApiResult<Comment>> {
  return dataClient.from('comments').select(COMMENT_SELECT).eq('id', id).single() as Promise<ApiResult<Comment>>;
}

export async function updateComment(id: string, data: Partial<Comment>): Promise<ApiResult<null>> {
  return dataClient.from('comments').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteComment(id: string): Promise<ApiResult<null>> {
  return dataClient.from('comments').delete().eq('id', id) as Promise<ApiResult<null>>;
}

export async function getCommentCount(postId: string): Promise<ApiResult<number>> {
  return dataClient.from('comments').select('*', { count: 'exact', head: true }).eq('post_id', postId) as Promise<ApiResult<number>>;
}
