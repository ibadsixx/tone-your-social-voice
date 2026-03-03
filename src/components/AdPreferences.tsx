import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronRight, Target, Database, Users, Building2, Info, Shield, ExternalLink } from 'lucide-react';
import { useAdActivity, useAdTopics, useAdAdvertisers, useAdSettings } from '@/hooks/useAdPreferences';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const AdPreferences = () => {
  const [activeTab, setActiveTab] = useState('customize');
  const { data: adActivity, isLoading: loadingActivity } = useAdActivity();
  const { data: adTopics, isLoading: loadingTopics } = useAdTopics();
  const { data: adAdvertisers, isLoading: loadingAdvertisers } = useAdAdvertisers();
  const { data: adSettings, isLoading: loadingSettings } = useAdSettings();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const updateSetting = async (field: string, value: boolean | string) => {
    if (!user) return;
    const { error } = await supabase
      .from('ad_settings')
      .upsert({ user_id: user.id, [field]: value }, { onConflict: 'user_id' });
    if (error) {
      toast.error('Failed to update setting');
    } else {
      toast.success('Setting updated');
      queryClient.invalidateQueries({ queryKey: ['ad-settings'] });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground mb-1">Ad Preferences</h2>
        <p className="text-sm text-muted-foreground">
          Take charge of your ad experience and the data used to display your ads.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="customize" className="text-sm font-medium">Customize ads</TabsTrigger>
          <TabsTrigger value="manage" className="text-sm font-medium">Manage info</TabsTrigger>
        </TabsList>

        {/* ========== CUSTOMIZE ADS TAB ========== */}
        <TabsContent value="customize" className="space-y-8">
          {/* --- Ad activity --- */}
          <Section title="Ad activity" action="See all">
            {loadingActivity ? (
              <div className="flex gap-4">
                <Skeleton className="h-48 w-52 rounded-lg" />
                <Skeleton className="h-48 w-52 rounded-lg" />
              </div>
            ) : adActivity && adActivity.length > 0 ? (
              <div className="flex gap-4 overflow-x-auto pb-2">
                {adActivity.slice(0, 4).map((ad) => (
                  <div key={ad.id} className="flex-shrink-0 w-52 rounded-lg overflow-hidden border border-border bg-card">
                    <div className="h-28 bg-muted flex items-center justify-center overflow-hidden">
                      {ad.image_url ? (
                        <img src={ad.image_url} alt={ad.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-muted" />
                      )}
                    </div>
                    <div className="p-3 space-y-2">
                      <p className="text-sm font-medium text-foreground truncate">{ad.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{ad.advertiser}</p>
                      <Button variant="default" size="sm" className="w-full text-xs">Ad details</Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No recent ad interactions recorded.</p>
            )}
          </Section>

          {/* --- Saved ads --- */}
          <Section title="Ads you bookmarked" action="See all">
            {loadingActivity ? (
              <div className="flex gap-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-20 rounded-lg" />)}
              </div>
            ) : adActivity && adActivity.filter(a => a.image_url).length > 0 ? (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {adActivity.filter(a => a.image_url).slice(0, 8).map((ad) => (
                  <div key={ad.id} className="flex-shrink-0 w-20 space-y-1">
                    <div className="w-20 h-20 rounded-lg overflow-hidden border border-border">
                      <img src={ad.image_url!} alt={ad.title} className="w-full h-full object-cover" />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{ad.title}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No bookmarked advertisements yet.</p>
            )}
          </Section>

          {/* --- Advertisers --- */}
          <Section title="Advertisers who showed you ads" action="See all">
            {loadingAdvertisers ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
              </div>
            ) : adAdvertisers && adAdvertisers.length > 0 ? (
              <div className="border border-border rounded-lg divide-y divide-border">
                {adAdvertisers.slice(0, 5).map((adv) => (
                  <button key={adv.id} className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={adv.icon || ''} />
                        <AvatarFallback className="text-xs bg-muted">{adv.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-foreground">{adv.name}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No advertiser records found.</p>
            )}
          </Section>

          {/* --- Ad topics --- */}
          <Section title="Ad topics" subtitle="Manage subjects and browse what you prefer to view less of." action="See all">
            {loadingTopics ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
              </div>
            ) : adTopics && adTopics.length > 0 ? (
              <div className="space-y-3">
                <div className="h-36 rounded-lg bg-gradient-to-br from-primary/20 via-accent/30 to-secondary/40 flex items-center justify-center">
                  <Target className="w-10 h-10 text-primary/60" />
                </div>
                <div className="border border-border rounded-lg divide-y divide-border">
                  {adTopics.slice(0, 5).map((topic) => (
                    <button key={topic.id} className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                          <span className="text-sm">{topic.icon || '📌'}</span>
                        </div>
                        <span className="text-sm text-foreground">{topic.name}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No ad topics configured yet.</p>
            )}
          </Section>
        </TabsContent>

        {/* ========== MANAGE INFO TAB ========== */}
        <TabsContent value="manage" className="space-y-8">
          {loadingSettings ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
            </div>
          ) : (
            <>
              {/* --- Information used to display your ads --- */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-primary">Information used to display your ads</h3>
                <div className="border border-border rounded-lg divide-y divide-border">
                  <RowItem
                    title="Categories used to reach you"
                    description="Details you share on your profile or other classifications used to reach you."
                    titleColor="text-green-400"
                  />
                  <RowItem
                    title="Activity data from ad partners"
                    description="Select whether to utilize this data to present you ads that are more relevant to you."
                    subtitle="View more details"
                    titleColor="text-green-400"
                    toggle
                    checked={adSettings?.use_partner_data ?? false}
                    onToggle={(val) => updateSetting('use_partner_data', val)}
                  />
                  <RowItem
                    title="Audience-based advertising"
                    description="Advertisers leveraging your activity or data."
                    titleColor="text-green-400"
                  />
                </div>
              </div>

              {/* --- Ads displayed outside of Tone --- */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-yellow-400">Ads displayed outside of Tone</h3>
                <div className="border border-border rounded-lg divide-y divide-border">
                  <RowItem
                    title="Ads in external apps"
                    description="Select whether you see ads from Tone Audience Network in third-party apps."
                    subtitle="View more details"
                    titleColor="text-yellow-400"
                    toggle
                    checked={adSettings?.show_ads_in_external_apps ?? false}
                    onToggle={(val) => updateSetting('show_ads_in_external_apps', val)}
                  />
                  <RowItem
                    title="Promotions about Tone"
                    description="Select whether we leverage your activity to display you ads about Tone on other platforms."
                    subtitle="Usage information"
                    titleColor="text-yellow-400"
                    toggle
                    checked={adSettings?.use_activity_for_external_ads ?? false}
                    onToggle={(val) => updateSetting('use_activity_for_external_ads', val)}
                  />
                </div>
              </div>

              {/* --- Other settings --- */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Other settings</h3>
                <div className="border border-border rounded-lg">
                  <RowItem
                    title="Social interactions"
                    description="Select who can view your social interactions alongside ads."
                  />
                </div>
              </div>

              {/* --- Learn more about ads privacy --- */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Learn more about ads privacy</h3>
                <p className="text-xs text-muted-foreground">
                  Find out more about what data is utilized to display you ads, and how you can manage your privacy.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="border border-border rounded-lg p-4 space-y-2">
                    <h4 className="text-sm font-semibold text-foreground">What data is utilized to display me ads?</h4>
                    <p className="text-xs text-muted-foreground">
                      We present you ads based on your details and activity. You get to manage these settings.
                    </p>
                    <Button variant="default" size="sm" className="w-full text-xs mt-2">More details</Button>
                  </div>
                  <div className="border border-border rounded-lg p-4 space-y-2">
                    <h4 className="text-sm font-semibold text-foreground">Does Tone sell my data?</h4>
                    <p className="text-xs text-muted-foreground">
                      No. We never sell your personal information.
                    </p>
                    <Button variant="default" size="sm" className="w-full text-xs mt-2">More details</Button>
                  </div>
                </div>
              </div>

              {/* --- Bottom links --- */}
              <div className="space-y-3">
                <Button variant="outline" className="w-full text-sm justify-center">
                  Learn more in Privacy Center
                </Button>
                <Button variant="outline" className="w-full text-sm justify-center">
                  Learn more about Tone Ads
                </Button>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

/* ---------- Section wrapper ---------- */
const Section = ({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: string; children: React.ReactNode }) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <button className="text-xs text-primary hover:underline font-medium">{action}</button>}
    </div>
    {children}
  </div>
);

/* ---------- Row item for Manage Info ---------- */
const RowItem = ({
  title,
  description,
  subtitle,
  titleColor,
  toggle,
  checked,
  onToggle,
}: {
  title: string;
  description: string;
  subtitle?: string;
  titleColor?: string;
  toggle?: boolean;
  checked?: boolean;
  onToggle?: (val: boolean) => void;
}) => (
  <div className="flex items-start justify-between p-4 hover:bg-muted/50 transition-colors">
    <div className="flex-1 min-w-0 space-y-0.5">
      <p className={`text-sm font-medium ${titleColor || 'text-foreground'}`}>{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
      {subtitle && (
        <button className="text-xs text-primary hover:underline mt-1">{subtitle}</button>
      )}
    </div>
    {toggle ? (
      <Switch checked={checked} onCheckedChange={onToggle} className="ml-3 mt-1" />
    ) : (
      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-2 mt-1" />
    )}
  </div>
);

export default AdPreferences;
