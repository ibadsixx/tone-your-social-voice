import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronRight, Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useAdPreferences } from '@/hooks/useAdPreferences';

const AdPreferences = () => {
  const [activeTab, setActiveTab] = useState('customize');
  const {
    adActivity,
    savedAds,
    advertisers,
    adTopics,
    adSettings,
    loading,
    updateSettings,
    updateTopicPreference,
  } = useAdPreferences();

  const SectionHeader = ({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) => (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {onSeeAll && (
        <button className="text-xs font-medium text-primary hover:underline">View all</button>
      )}
    </div>
  );

  const ListItem = ({ name, icon }: { name: string; icon: string }) => (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer">
      <div className="flex items-center gap-3">
        <span className="text-lg">{icon}</span>
        <span className="text-sm text-foreground">{name}</span>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </div>
  );

  const EmptyState = ({ message }: { message: string }) => (
    <div className="rounded-lg border border-border/50 p-6 text-center">
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-foreground mb-2">Ad Preferences</h2>
        <p className="text-sm text-muted-foreground">
          Take charge of your advertising experience and the data used to display ads to you.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-transparent border-b border-border rounded-none w-auto gap-4 h-auto p-0">
          <TabsTrigger
            value="customize"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1 pb-2 text-sm font-medium"
          >
            Tailor ads
          </TabsTrigger>
          <TabsTrigger
            value="manage"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-1 pb-2 text-sm font-medium text-muted-foreground"
          >
            Handle info
          </TabsTrigger>
        </TabsList>

        <TabsContent value="customize" className="mt-6 space-y-6">
          {/* Ad interactions */}
          <div className="space-y-6">
            <h3 className="text-sm font-semibold text-foreground">Ad interactions</h3>

            {/* Ads the user interacted with */}
            <div>
              <SectionHeader title="Ads you viewed" />
              {adActivity.filter(a => a.interaction_type === 'viewed').length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {adActivity.filter(a => a.interaction_type === 'viewed').map((ad) => (
                    <div key={ad.id} className="rounded-lg overflow-hidden border border-border/50 bg-muted/20">
                      <div className="aspect-video bg-muted/50 relative">
                        <img src={ad.image_url} alt={ad.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="p-2">
                        <p className="text-xs text-muted-foreground truncate">{ad.advertiser}</p>
                        <button className="w-full mt-1.5 text-xs font-medium text-primary-foreground bg-primary rounded-md py-1.5 hover:bg-primary/90 transition-colors">
                          Ad info
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState message="No ads viewed yet." />
              )}
            </div>

            {/* Ads they clicked on */}
            <div>
              <SectionHeader title="Ads you clicked" />
              {adActivity.filter(a => a.interaction_type === 'clicked').length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {adActivity.filter(a => a.interaction_type === 'clicked').map((ad) => (
                    <div key={ad.id} className="rounded-lg overflow-hidden border border-border/50 bg-muted/20">
                      <div className="aspect-video bg-muted/50 relative">
                        <img src={ad.image_url} alt={ad.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="p-2">
                        <p className="text-xs text-muted-foreground truncate">{ad.advertiser}</p>
                        <button className="w-full mt-1.5 text-xs font-medium text-primary-foreground bg-primary rounded-md py-1.5 hover:bg-primary/90 transition-colors">
                          Ad info
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState message="No ads clicked yet." />
              )}
            </div>

            {/* Ads they hid */}
            <div>
              <SectionHeader title="Ads you hid" />
              {adActivity.filter(a => a.interaction_type === 'hidden').length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {adActivity.filter(a => a.interaction_type === 'hidden').map((ad) => (
                    <div key={ad.id} className="rounded-lg overflow-hidden border border-border/50 bg-muted/20">
                      <div className="aspect-video bg-muted/50 relative">
                        <img src={ad.image_url} alt={ad.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="p-2">
                        <p className="text-xs text-muted-foreground truncate">{ad.advertiser}</p>
                        <button className="w-full mt-1.5 text-xs font-medium text-primary-foreground bg-primary rounded-md py-1.5 hover:bg-primary/90 transition-colors">
                          Ad info
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState message="No ads hidden yet." />
              )}
            </div>

            {/* Ads they saved */}
            <div>
              <SectionHeader title="Ads you saved" />
              {savedAds.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {savedAds.map((ad) => (
                    <div key={ad.id} className="rounded-lg overflow-hidden border border-border/50 bg-muted/20">
                      <div className="aspect-video bg-muted/50 relative">
                        <img src={ad.image_url} alt={ad.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="p-2">
                        <p className="text-xs text-muted-foreground truncate">{ad.title}</p>
                        {ad.subtitle && <p className="text-[10px] text-muted-foreground truncate">{ad.subtitle}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState message="No saved ads yet." />
              )}
            </div>
          </div>

          <Separator />

          {/* Advertisers */}
          <div>
              <SectionHeader title="Advertisers you saw ads from" onSeeAll={advertisers.length > 0 ? () => {} : undefined} />
            {advertisers.length > 0 ? (
              <div className="rounded-lg border border-border/50 overflow-hidden">
                {advertisers.map((adv, i) => (
                  <React.Fragment key={adv.id}>
                    <ListItem name={adv.name} icon={adv.icon} />
                    {i < advertisers.length - 1 && <Separator />}
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <EmptyState message="No advertisers to display yet." />
            )}
          </div>

          <Separator />

          {/* Ad topics */}
          <div>
            <SectionHeader title="Ad subjects" />
            <p className="text-xs text-muted-foreground mb-3">Specify your interest in certain topics to see more relevant ads.</p>
            {adTopics.length > 0 ? (
              <div className="space-y-2">
                {adTopics.map((topic) => (
                  <div key={topic.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{topic.icon}</span>
                      <span className="text-sm font-medium">{topic.name}</span>
                    </div>
                    <div className="flex gap-1">
                      {['interested', 'neutral', 'not_interested'].map((pref) => {
                        const isActive = topic.preference === pref;
                        const labels: Record<string, string> = {
                          interested: 'Interested',
                          neutral: 'Neutral',
                          not_interested: 'Not interested',
                        };
                        return (
                          <button
                            key={pref}
                            onClick={() => updateTopicPreference(topic.id, pref)}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                              isActive
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-transparent text-muted-foreground border-border hover:border-primary/50'
                            }`}
                          >
                            {labels[pref]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No ad subjects recorded yet." />
            )}
          </div>
        </TabsContent>

        <TabsContent value="manage" className="mt-6 space-y-6">
          {/* Categories Used to Reach You */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Categories Used to Reach You</h3>
            <div
              className="flex items-center justify-between px-4 py-3 border rounded-lg hover:bg-muted/40 transition-colors cursor-pointer"
              onClick={() => updateSettings({ use_categories: !adSettings.use_categories })}
            >
              <div>
                <p className="text-sm font-medium text-foreground">Use categories to find you</p>
                <p className="text-xs text-muted-foreground">Allow us to use categories based on your profile and activity to show relevant ads.</p>
                <p className="text-xs text-primary font-medium mt-0.5">
                  {adSettings.use_categories ? 'Categories enabled' : 'Categories disabled'}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-3" />
            </div>
          </div>

          <Separator />

          {/* Activity Information From Ad Partners */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Activity Information From Ad Partners</h3>
            <div
              className="flex items-center justify-between px-4 py-3 border rounded-lg hover:bg-muted/40 transition-colors cursor-pointer"
              onClick={() => updateSettings({ use_partner_data: !adSettings.use_partner_data })}
            >
              <div>
                <p className="text-sm font-medium text-foreground">Engagement data from ad collaborators</p>
                <p className="text-xs text-muted-foreground">Decide whether we leverage this to present ads that are more aligned to you.</p>
                <p className="text-xs text-primary font-medium mt-0.5">
                  {adSettings.use_partner_data ? 'Leveraging this data' : 'Not leveraging this data'}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-3" />
            </div>
          </div>

          <Separator />

          {/* Audience-Based Advertising */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Audience-Based Advertising</h3>
            <div
              className="flex items-center justify-between px-4 py-3 border rounded-lg hover:bg-muted/40 transition-colors cursor-pointer"
              onClick={() => updateSettings({ audience_based_advertising: !adSettings.audience_based_advertising })}
            >
              <div>
                <p className="text-sm font-medium text-foreground">Interest-driven promotion</p>
                <p className="text-xs text-muted-foreground">Promoters leveraging your engagement or details to reach you with ads.</p>
                <p className="text-xs text-primary font-medium mt-0.5">
                  {adSettings.audience_based_advertising ? 'Audience ads enabled' : 'Audience ads disabled'}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-3" />
            </div>
          </div>

          <Separator />

          {/* Ads From Ad Partners */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Ads From Ad Partners</h3>
            <div
              className="flex items-center justify-between px-4 py-3 border rounded-lg hover:bg-muted/40 transition-colors cursor-pointer"
              onClick={() => updateSettings({ show_ads_in_external_apps: !adSettings.show_ads_in_external_apps })}
            >
              <div>
                <p className="text-sm font-medium text-foreground">Ads in external apps</p>
                <p className="text-xs text-muted-foreground">Decide whether you view ads from the Audience Network in external apps.</p>
                <p className="text-xs text-primary font-medium mt-0.5">
                  {adSettings.show_ads_in_external_apps ? 'Displaying ads in external apps' : 'Not displaying ads in external apps'}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-3" />
            </div>
          </div>

          <Separator />

          {/* Ads About Tone */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Ads About Tone</h3>
            <div
              className="flex items-center justify-between px-4 py-3 border rounded-lg hover:bg-muted/40 transition-colors cursor-pointer"
              onClick={() => updateSettings({ use_activity_for_external_ads: !adSettings.use_activity_for_external_ads })}
            >
              <div>
                <p className="text-sm font-medium text-foreground">Ads regarding the platform</p>
                <p className="text-xs text-muted-foreground">Decide whether we leverage your engagement to display ads about Tone on other services.</p>
                <p className="text-xs text-primary font-medium mt-0.5">
                  {adSettings.use_activity_for_external_ads ? 'Leveraging this data' : 'Not leveraging this data'}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-3" />
            </div>
          </div>

          <Separator />

          {/* Social Interactions */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Social Interactions</h3>
            <div
              className="flex items-center justify-between px-4 py-3 border rounded-lg hover:bg-muted/40 transition-colors cursor-pointer"
              onClick={() => updateSettings({ social_interactions_visibility: adSettings.social_interactions_visibility === 'friends' ? 'only_me' : 'friends' })}
            >
              <div>
                <p className="text-sm font-medium text-foreground">Social engagements</p>
                <p className="text-xs text-muted-foreground">Decide who can view your social engagements alongside ads.</p>
                <p className="text-xs text-primary font-medium mt-0.5">
                  {adSettings.social_interactions_visibility === 'friends' ? 'Visible to friends' : 'Only me'}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-3" />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdPreferences;
