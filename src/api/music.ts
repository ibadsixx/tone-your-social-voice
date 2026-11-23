// Tone frontend — Music library API.
//
// Public read-only access to the music_library table via the registry-driven
// Supabase client factory. The owning Supabase project and its public anon key
// are resolved from the infrastructure registry by domain ("music"); no project
// URL or key is hardcoded here.

import {
  getDomainSupabaseClient,
  isInfrastructureConfigured,
} from '@/lib/supabase';
import type { ApiResult } from './client';

const MUSIC_DOMAIN = 'music';

async function ensureInfrastructureReady(): Promise<void> {
  if (!isInfrastructureConfigured()) {
    throw new Error(
      'Infrastructure Supabase is not configured. Set VITE_INFRA_SUPABASE_URL and VITE_INFRA_SUPABASE_ANON_KEY.'
    );
  }
}

export async function searchMusic(query: string): Promise<ApiResult<{ id: string; title: string; artist: string; url: string }[]>> {
  try {
    await ensureInfrastructureReady();

    const { client } = await getDomainSupabaseClient(MUSIC_DOMAIN);

    const { data, error } = await client
      .from('music_library')
      .select('*')
      .ilike('title', `%${query}%`)
      .limit(20);

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    return {
      data: (data as { id: string; title: string; artist: string; url: string }[] | null) ?? null,
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'searchMusic failed' },
    };
  }
}

export async function getMusicById(id: string): Promise<ApiResult<{ id: string; title: string; artist: string; url: string }>> {
  try {
    await ensureInfrastructureReady();

    const { client } = await getDomainSupabaseClient(MUSIC_DOMAIN);

    const { data, error } = await client
      .from('music_library')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    return {
      data: (data as { id: string; title: string; artist: string; url: string } | null) ?? null,
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'getMusicById failed' },
    };
  }
}
