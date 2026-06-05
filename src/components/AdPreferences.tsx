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
          {/* Data used to display ads */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Data utilized to present ads</h3>
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-foreground">Segments applied to find you</p>
                  <p className="text-xs text-muted-foreground">Details you share on your profile or other segments applied to find you.</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-3" />
              </div>
              <Separator />
              <div
                className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer"
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
              <Separator />
              <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-foreground">Interest-driven promotion</p>
                  <p className="text-xs text-muted-foreground">Promoters leveraging your engagement or details</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-3" />
              </div>
            </div>
          </div>

          <Separator />

          {/* Ads beyond the platform */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Ads beyond the platform</h3>
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer"
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
              <Separator />
              <div
                className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer"
                onClick={() => updateSettings({ use_activity_for_external_ads: !adSettings.use_activity_for_external_ads })}
              >
                <div>
                  <p className="text-sm font-medium text-foreground">Ads regarding the platform</p>
                  <p className="text-xs text-muted-foreground">Decide whether we leverage your engagement to display ads about the platform on other services.</p>
                  <p className="text-xs text-primary font-medium mt-0.5">
                    {adSettings.use_activity_for_external_ads ? 'Leveraging this data' : 'Not leveraging this data'}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-3" />
              </div>
            </div>
          </div>

          <Separator />

          {/* Other settings */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Additional preferences</h3>
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-foreground">Social engagements</p>
                  <p className="text-xs text-muted-foreground">Decide who can view your social engagements alongside ads.</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-3" />
              </div>
            </div>
          </div>

          <Separator />

          {/* Learn more */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-1">Discover more about ads privacy</h3>
            <p className="text-xs text-muted-foreground mb-3">Explore what data is leveraged to present ads, and how you can manage your privacy.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border/50 p-4 flex flex-col justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">What data is leveraged to present ads?</p>
                  <p className="text-xs text-muted-foreground mt-1">We present ads based on your details and engagement. You have the ability to manage these preferences.</p>
                </div>
                <button className="w-full mt-3 text-xs font-medium text-primary-foreground bg-primary rounded-md py-2 hover:bg-primary/90 transition-colors">
                  More details
                </button>
              </div>
              <div className="rounded-lg border border-border/50 p-4 flex flex-col justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Do we sell your data?</p>
                  <p className="text-xs text-muted-foreground mt-1">No. We never sell your personal data.</p>
                </div>
                <button className="w-full mt-3 text-xs font-medium text-primary-foreground bg-primary rounded-md py-2 hover:bg-primary/90 transition-colors">
                  More details
                </button>
              </div>
            </div>
          </div>

          {/* Footer links */}
          <div className="space-y-2">
            <button className="w-full text-xs font-medium text-muted-foreground border border-border/50 rounded-lg py-2.5 hover:bg-muted/40 transition-colors">
              Discover more in Privacy Center
            </button>
            <button className="w-full text-xs font-medium text-muted-foreground border border-border/50 rounded-lg py-2.5 hover:bg-muted/40 transition-colors">
              Discover more about Platform Ads
            </button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdPreferences;
