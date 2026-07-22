import { gateway } from './client';
import type { ApiResult } from './client';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  profile_pic: string | null;
  cover_photo: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  manual_status: string | null;
  status_visibility: string | null;
  notification_sounds: boolean;
  do_not_disturb_until: string | null;
  dark_mode: boolean;
  show_read_indicator: boolean;
  check_keys_in_conversations: boolean;
  remember_browser: boolean;
  disable_auto_uploads: boolean;
  preview_mode: boolean;
  vault_pin: string | null;
  vault_recovery_code: string | null;
  security_warnings: boolean;
  created_at: string;
  [key: string]: unknown;
}

export async function getProfileById(id: string): Promise<ApiResult<Profile>> {
  return gateway.from('profiles').select('*').eq('id', id).maybeSingle() as Promise<ApiResult<Profile>>;
}

export async function getProfileByUsername(username: string): Promise<ApiResult<Profile>> {
  return gateway.from('profiles').select('*').eq('username', username).maybeSingle() as Promise<ApiResult<Profile>>;
}

export async function updateProfile(id: string, data: Partial<Profile>): Promise<ApiResult<null>> {
  return gateway.from('profiles').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function searchProfiles(query: string): Promise<ApiResult<Profile[]>> {
  return gateway.from('profiles').select('id, username, display_name, profile_pic').ilike('username', `%${query}%`).limit(20) as Promise<ApiResult<Profile[]>>;
}
