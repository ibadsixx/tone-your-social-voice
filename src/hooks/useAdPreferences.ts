import { useEffect, useState } from 'react';
import { adsApi } from '@/api';
import type { AdActivity, AdAdvertiser, AdSettings, AdTopic, SavedAdItem } from '@/api/ads';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

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
  const [savedAds, setSavedAds] = useState<SavedAdItem[]>([]);
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
      adsApi.getAdActivity(user.id),
      adsApi.getSavedAds(user.id),
      adsApi.getAdAdvertisers(user.id),
      adsApi.getAdTopics(user.id),
      adsApi.getAdSettings(user.id),
    ]);
    if (actRes.data) setAdActivity(actRes.data);
    if (savedRes.data) setSavedAds(savedRes.data);
    if (advRes.data) setAdvertisers(advRes.data);
    if (topRes.data) setAdTopics(topRes.data);
    if (topRes.data && topRes.data.length === 0) {
      await adsApi.seedDefaultAdTopics(user.id);
      const refetch = await adsApi.getAdTopics(user.id);
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
    const { error } = await adsApi.upsertAdSettings(user.id, merged);
    if (error) {
      toast({ title: 'Error saving settings', description: error.message, variant: 'destructive' });
    }
  };

  const removeSavedAd = async (id: string) => {
    if (!user) return;
    setSavedAds(prev => prev.filter(a => a.id !== id));
    await adsApi.removeSavedAd(id, user.id);
  };

  const removeAdActivity = async (id: string) => {
    if (!user) return;
    setAdActivity(prev => prev.filter(a => a.id !== id));
    await adsApi.removeAdActivity(id, user.id);
  };

  const updateTopicPreference = async (topicId: string, preference: string) => {
    setAdTopics(prev => prev.map(t => t.id === topicId ? { ...t, preference } : t));
    await adsApi.updateAdTopicPreference(topicId, preference);
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
