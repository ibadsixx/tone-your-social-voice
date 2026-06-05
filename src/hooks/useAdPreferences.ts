import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export interface AdActivity {
  id: string;
  title: string;
  advertiser: string;
  image_url: string;
  interaction_type: string;
}

export interface SavedAd {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string;
}

export interface AdAdvertiser {
  id: string;
  name: string;
  icon: string;
}

export interface AdTopic {
  id: string;
  name: string;
  icon: string;
  preference: string;
}

export interface AdSettings {
  use_categories: boolean;
  use_partner_data: boolean;
  audience_based_advertising: boolean;
  show_ads_in_external_apps: boolean;
  use_activity_for_external_ads: boolean;
  social_interactions_visibility: string;
}

const defaultSettings: AdSettings = {
  use_categories: true,
  use_partner_data: true,
  audience_based_advertising: true,
  show_ads_in_external_apps: true,
  use_activity_for_external_ads: true,
  social_interactions_visibility: 'friends',
};

export const useAdPreferences = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [adActivity, setAdActivity] = useState<AdActivity[]>([]);
  const [savedAds, setSavedAds] = useState<SavedAd[]>([]);
  const [advertisers, setAdvertisers] = useState<AdAdvertiser[]>([]);
  const [adTopics, setAdTopics] = useState<AdTopic[]>([]);
  const [adSettings, setAdSettings] = useState<AdSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    fetchAll();
  }, [user]);

  const fetchAll = async () => {
    if (!user) return;
    setLoading(true);
    const [actRes, savedRes, advRes, topRes, setRes] = await Promise.all([
      supabase.from('ad_activity').select('id, title, advertiser, image_url, interaction_type').eq('user_id', user.id).order('clicked_at', { ascending: false }),
      supabase.from('saved_ads').select('id, title, subtitle, image_url').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('ad_advertisers').select('id, name, icon').eq('user_id', user.id).order('last_shown_at', { ascending: false }),
      supabase.from('ad_topics').select('id, name, icon, preference').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('ad_settings').select('*').eq('user_id', user.id).maybeSingle(),
    ]);
    if (actRes.data) setAdActivity(actRes.data);
    if (savedRes.data) setSavedAds(savedRes.data);
    if (advRes.data) setAdvertisers(advRes.data);
    if (topRes.data) setAdTopics(topRes.data);
    if (topRes.data && topRes.data.length === 0) {
      await supabase.rpc('seed_default_ad_topics', { p_user_id: user.id });
      const refetch = await supabase.from('ad_topics').select('id, name, icon, preference').eq('user_id', user.id).order('created_at', { ascending: false });
      if (refetch.data) setAdTopics(refetch.data);
    }
    if (setRes.data) {
      setAdSettings({
        use_categories: setRes.data.use_categories ?? true,
        use_partner_data: setRes.data.use_partner_data ?? true,
        audience_based_advertising: setRes.data.audience_based_advertising ?? true,
        show_ads_in_external_apps: setRes.data.show_ads_in_external_apps ?? true,
        use_activity_for_external_ads: setRes.data.use_activity_for_external_ads ?? true,
        social_interactions_visibility: setRes.data.social_interactions_visibility ?? 'friends',
      });
    }
    setLoading(false);
  };

  const updateSettings = async (partial: Partial<AdSettings>) => {
    if (!user) return;
    const merged = { ...adSettings, ...partial };
    setAdSettings(merged);
    const { error } = await supabase.from('ad_settings').upsert({
      user_id: user.id,
      ...merged,
    }, { onConflict: 'user_id' });
    if (error) {
      toast({ title: 'Error saving settings', description: error.message, variant: 'destructive' });
    }
  };

  const removeSavedAd = async (id: string) => {
    if (!user) return;
    setSavedAds(prev => prev.filter(a => a.id !== id));
    await supabase.from('saved_ads').delete().eq('id', id).eq('user_id', user.id);
  };

  const removeAdActivity = async (id: string) => {
    if (!user) return;
    setAdActivity(prev => prev.filter(a => a.id !== id));
    await supabase.from('ad_activity').delete().eq('id', id).eq('user_id', user.id);
  };

  const updateTopicPreference = async (topicId: string, preference: string) => {
    setAdTopics(prev => prev.map(t => t.id === topicId ? { ...t, preference } : t));
    await supabase.from('ad_topics').update({ preference }).eq('id', topicId);
  };

  return {
    adActivity,
    savedAds,
    advertisers,
    adTopics,
    adSettings,
    loading,
    updateSettings,
    removeSavedAd,
    removeAdActivity,
    updateTopicPreference,
    refetch: fetchAll,
  };
};
