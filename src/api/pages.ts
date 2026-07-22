import { gateway } from './client';
import type { ApiResult } from './client';
import type { Page } from './types';

export async function getPageById(id: string): Promise<ApiResult<Page>> {
  return gateway.from('pages').select('*').eq('id', id).single() as Promise<ApiResult<Page>>;
}

export async function getPagesByAdmin(adminId: string): Promise<ApiResult<Page[]>> {
  return gateway.from('pages').select('*').eq('admin_id', adminId).order('created_at', { ascending: false }) as Promise<ApiResult<Page[]>>;
}

export async function createPage(data: Partial<Page>): Promise<ApiResult<Page>> {
  return gateway.from('pages').insert(data).select().single() as Promise<ApiResult<Page>>;
}

export async function updatePage(id: string, data: Partial<Page>): Promise<ApiResult<null>> {
  return gateway.from('pages').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deletePage(id: string): Promise<ApiResult<null>> {
  return gateway.from('pages').delete().eq('id', id) as Promise<ApiResult<null>>;
}

export async function searchPages(query: string): Promise<ApiResult<Page[]>> {
  return gateway.from('pages').select('*').ilike('name', `%${query}%`).limit(20) as Promise<ApiResult<Page[]>>;
}
