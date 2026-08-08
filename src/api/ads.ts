import { gateway } from './client';
import type { ApiResult } from './client';

export interface AdActivity {
  id: string;
  user_id: string;
  title: string;
  advertiser: string;
  image_url: string;
  interaction_type: string;
  clicked_at: string;
  created_at: string;
}

export interface SavedAdItem {
  id: string;
  user_id: string;
  title: string;
  subtitle: string | null;
  image_url: string;
  created_at: string;
}

export interface AdAdvertiser {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  last_shown_at: string;
  created_at: string;
}

export interface AdTopic {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  preference: string;
  created_at: string;
}

export interface AdSettings {
  use_categories: boolean;
  use_partner_data: boolean;
  audience_based_advertising: boolean;
  show_ads_in_external_apps: boolean;
  use_activity_for_external_ads: boolean;
  social_interactions_visibility: string;
}

const AD_TOPIC_SELECT = 'id, name, icon, preference';

export async function getAdActivity(userId: string): Promise<ApiResult<AdActivity[]>> {
  return gateway.from('ad_activity')
    .select('id, title, advertiser, image_url, interaction_type')
    .eq('user_id', userId)
    .order('clicked_at', { ascending: false }) as Promise<ApiResult<AdActivity[]>>;
}

export async function getSavedAds(userId: string): Promise<ApiResult<SavedAdItem[]>> {
  return gateway.from('saved_ads')
    .select('id, title, subtitle, image_url')
    .eq('user_id', userId)
    .order('created_at', { ascending: false }) as Promise<ApiResult<SavedAdItem[]>>;
}

export async function getAdAdvertisers(userId: string): Promise<ApiResult<AdAdvertiser[]>> {
  return gateway.from('ad_advertisers')
    .select('id, name, icon')
    .eq('user_id', userId)
    .order('last_shown_at', { ascending: false }) as Promise<ApiResult<AdAdvertiser[]>>;
}

export async function getAdTopics(userId: string): Promise<ApiResult<AdTopic[]>> {
  return gateway.from('ad_topics')
    .select(AD_TOPIC_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false }) as Promise<ApiResult<AdTopic[]>>;
}

export async function getAdSettings(userId: string): Promise<ApiResult<AdSettings>> {
  return gateway.from('ad_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle() as Promise<ApiResult<AdSettings>>;
}

export async function seedDefaultAdTopics(userId: string): Promise<ApiResult<null>> {
  const result = await gateway.rpc('seed_default_ad_topics', { p_user_id: userId });
  if (result.error) {
    return { data: null, error: result.error };
  }
  return { data: null, error: null };
}

export async function upsertAdSettings(userId: string, settings: AdSettings): Promise<ApiResult<null>> {
  const { data: existing } = await gateway.from('ad_settings')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle() as Promise<ApiResult<{ id: string }>>;
  if (existing?.id) {
    return gateway.from('ad_settings').update({ ...settings }).eq('id', existing.id) as Promise<ApiResult<null>>;
  }
  return gateway.from('ad_settings').insert({ user_id: userId, ...settings }) as Promise<ApiResult<null>>;
}

export async function removeSavedAd(id: string, userId: string): Promise<ApiResult<null>> {
  return gateway.from('saved_ads').delete().eq('id', id).eq('user_id', userId) as Promise<ApiResult<null>>;
}

export async function removeAdActivity(id: string, userId: string): Promise<ApiResult<null>> {
  return gateway.from('ad_activity').delete().eq('id', id).eq('user_id', userId) as Promise<ApiResult<null>>;
}

export async function updateAdTopicPreference(topicId: string, preference: string): Promise<ApiResult<null>> {
  return gateway.from('ad_topics').update({ preference }).eq('id', topicId) as Promise<ApiResult<null>>;
}
