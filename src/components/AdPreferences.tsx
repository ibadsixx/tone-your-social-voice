import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronRight, Target, Database, Users, Building2, Info, Shield, ExternalLink, X } from 'lucide-react';
import { useAdActivity, useAdTopics, useAdAdvertisers, useAdSettings, useAdProfileCategories, useAdAssociatedCategories } from '@/hooks/useAdPreferences';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import adPartnersIllustration from '@/assets/ad-partners-illustration.png';

const AdPreferences = () => {
  const [activeTab, setActiveTab] = useState('customize');
  const [showCategoriesDialog, setShowCategoriesDialog] = useState(false);
  const [showPartnerDataDialog, setShowPartnerDataDialog] = useState(false);
  const [showReviewSettingDialog, setShowReviewSettingDialog] = useState(false);
  const { data: adActivity, isLoading: loadingActivity } = useAdActivity();
  const { data: adTopics, isLoading: loadingTopics } = useAdTopics();
  const { data: adAdvertisers, isLoading: loadingAdvertisers } = useAdAdvertisers();
  const { data: adSettings, isLoading: loadingSettings } = useAdSettings();
  const { data: profileCategories, isLoading: loadingProfileCats } = useAdProfileCategories();
  const { data: associatedCategories, isLoading: loadingAssocCats } = useAdAssociatedCategories();
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

  const removeAssociatedCategory = async (categoryId: string) => {
    const { error } = await supabase
      .from('ad_associated_categories')
      .delete()
      .eq('id', categoryId);
    if (error) {
      toast.error('Failed to dismiss category');
    } else {
      toast.success('Category dismissed');
      queryClient.invalidateQueries({ queryKey: ['ad-associated-categories'] });
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
                    title="Categories utilized to target you"
                    description="Information you provide on your profile or other classifications employed to target you."
                    titleColor="text-green-400"
                    onClick={() => setShowCategoriesDialog(true)}
                  />
                  <RowItem
                    title="Activity data from ad partners"
                    description="Select whether to utilize this data to present you ads that are more relevant to you."
                    subtitle="View more details"
                    titleColor="text-green-400"
                    onClick={() => setShowPartnerDataDialog(true)}
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

      {/* Categories Dialog */}
      <Dialog open={showCategoriesDialog} onOpenChange={setShowCategoriesDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground">Categories utilized to target you</DialogTitle>
            <p className="text-xs text-muted-foreground">Employed for your account</p>
          </DialogHeader>

          <div className="space-y-6 mt-2">
            {/* Profile Information Section */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">Select profile information</h4>
              <p className="text-xs text-muted-foreground">
                Pick which profile details are employed to tailor your advertisements.
              </p>

              {loadingProfileCats ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                </div>
              ) : profileCategories && profileCategories.length > 0 ? (
                <div className="border border-border rounded-lg divide-y divide-border">
                  {profileCategories.map((cat) => (
                    <div key={cat.id} className="flex items-center justify-between p-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{cat.label}</p>
                        <p className="text-xs text-muted-foreground capitalize">{cat.category_type.replace('_', ' ')}</p>
                      </div>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        {cat.is_used ? 'Employed' : 'Unused'} <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-2">No profile classifications recorded yet.</p>
              )}

              <Button variant="outline" className="w-full text-sm mt-2">
                Modify Tone profile
              </Button>
            </div>

            {/* Associated Categories Section */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">Categories linked to you</h4>
              <p className="text-xs text-muted-foreground">
                Advertisers can target you based on additional categories we link to you. You may exclude yourself from any of these classifications.
              </p>

              {loadingAssocCats ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
                </div>
              ) : associatedCategories && associatedCategories.length > 0 ? (
                <div className="border border-border rounded-lg divide-y divide-border">
                  {associatedCategories.map((cat) => (
                    <div key={cat.id} className="flex items-center justify-between p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{cat.title}</p>
                        {cat.description && (
                          <p className="text-xs text-muted-foreground">{cat.description}</p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs ml-3 flex-shrink-0"
                        onClick={() => removeAssociatedCategory(cat.id)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-2">No linked categories found.</p>
              )}

              <Button variant="default" className="w-full text-sm mt-2">
                Browse all
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Partner Data Dialog */}
      <Dialog open={showPartnerDataDialog} onOpenChange={setShowPartnerDataDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground">Activity information from ad partners</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            <div className="rounded-lg overflow-hidden">
              <img
                src={adPartnersIllustration}
                alt="Ad partners illustration"
                className="w-full h-48 object-cover rounded-lg"
              />
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              To present you advertisements that assist you in uncovering new things, it is beneficial to understand what you already enjoy. When you browse an ad partner's website, application, or make a purchase in their outlets, they may transmit us data about that interaction and what you engaged with.{' '}
              <button className="text-primary hover:underline font-medium">Discover more about ad partners</button>
            </p>

            <p className="text-sm text-muted-foreground leading-relaxed">
              This enables us to display advertisements that are pertinent to you and are as captivating as your regular content. However, we'll only employ it for this objective if you permit us to.
            </p>

            <p className="text-sm font-semibold text-foreground">
              You have the option to decide if we utilize this data to assist in presenting the most suitable ads for you.
            </p>

            <Button
              variant="default"
              className="w-full text-sm font-medium"
              onClick={() => {
                setShowPartnerDataDialog(false);
                setShowReviewSettingDialog(true);
              }}
            >
              Review setting
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Review Setting Dialog */}
      <Dialog open={showReviewSettingDialog} onOpenChange={setShowReviewSettingDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <div className="space-y-6">
            <div>
              <button
                className="text-primary hover:underline text-sm mb-3 flex items-center gap-1"
                onClick={() => {
                  setShowReviewSettingDialog(false);
                  setShowPartnerDataDialog(true);
                }}
              >
                ← Back
              </button>
              <h2 className="text-lg font-semibold text-foreground leading-snug">
                Would you like us to leverage your activity data from ad partners to display your ads?
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Applied to {1} account.{' '}
                <button className="text-primary hover:underline font-medium">View</button>
              </p>
            </div>

            {/* Option: Yes */}
            <div
              className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                (adSettings?.use_partner_data ?? false)
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/50'
              }`}
              onClick={() => updateSetting('use_partner_data', true)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    Yes, present me ads that are more tailored by utilizing this data
                  </p>
                  <p className="text-xs text-muted-foreground">
                    You'll receive advertisements that are more pertinent to you based on what you already prefer.
                  </p>
                  {(adSettings?.use_partner_data ?? false) && (
                    <p className="text-xs text-primary font-medium mt-1">Your current preference</p>
                  )}
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-1 ${
                  (adSettings?.use_partner_data ?? false)
                    ? 'border-primary'
                    : 'border-muted-foreground'
                }`}>
                  {(adSettings?.use_partner_data ?? false) && (
                    <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                  )}
                </div>
              </div>
              <button className="text-xs text-primary hover:underline mt-2 font-medium">
                How this influences your ads
              </button>
            </div>

            {/* Option: No */}
            <div
              className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                !(adSettings?.use_partner_data ?? false)
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/50'
              }`}
              onClick={() => updateSetting('use_partner_data', false)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    No, don't enhance my ads' relevance by employing this data
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Your advertisements will rely on less of your data and be more likely to be generic.
                  </p>
                  {!(adSettings?.use_partner_data ?? false) && (
                    <p className="text-xs text-primary font-medium mt-1">Your current preference</p>
                  )}
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-1 ${
                  !(adSettings?.use_partner_data ?? false)
                    ? 'border-primary'
                    : 'border-muted-foreground'
                }`}>
                  {!(adSettings?.use_partner_data ?? false) && (
                    <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                  )}
                </div>
              </div>
              <button className="text-xs text-primary hover:underline mt-2 font-medium">
                How this influences your ads
              </button>
            </div>

            {/* Info bullets */}
            <div className="space-y-3 pt-2">
              <InfoBullet icon="⚙️" text="You can modify your selection at any time" />
              <InfoBullet icon="🔒" text="We always adhere to rigorous security protocols to safeguard your data" />
              <InfoBullet icon="📄" text={<>Certain data may be anonymized and utilized to enhance our products as outlined in our <button className="text-primary hover:underline">Privacy Policy</button>, irrespective of your selection</>} />
              <InfoBullet icon="📋" text={<>This isn't the sole category of data from ad partners that can influence your ads. View details about <button className="text-primary hover:underline">audience-driven advertising</button></>} />
              <InfoBullet icon="ℹ️" text={<>Discover more about <button className="text-primary hover:underline">ad partners</button></>} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
  onClick,
}: {
  title: string;
  description: string;
  subtitle?: string;
  titleColor?: string;
  toggle?: boolean;
  checked?: boolean;
  onToggle?: (val: boolean) => void;
  onClick?: () => void;
}) => (
  <div
    className={`flex items-start justify-between p-4 hover:bg-muted/50 transition-colors ${onClick ? 'cursor-pointer' : ''}`}
    onClick={!toggle ? onClick : undefined}
  >
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

/* ---------- Info bullet ---------- */
const InfoBullet = ({ icon, text }: { icon: string; text: React.ReactNode }) => (
  <div className="flex items-start gap-3">
    <span className="text-base flex-shrink-0 mt-0.5">{icon}</span>
    <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
  </div>
);

export default AdPreferences;
