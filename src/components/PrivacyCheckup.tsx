import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Trash2, User, Monitor, Tag, ShieldBan, X } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import whoCanSeeImg from '@/assets/privacy/who-can-see.png';
import howPeopleFindImg from '@/assets/privacy/how-people-find.png';
import dataSettingsImg from '@/assets/privacy/data-settings.png';
import accountSecureImg from '@/assets/privacy/account-secure.png';
import adPreferencesImg from '@/assets/privacy/ad-preferences.png';

interface ProfileData {
  email: string;
  birthday: string;
  relationship: string;
}

interface BlockedUser {
  blocked_user_id: string;
  profiles: {
    display_name: string;
    username: string;
    profile_pic: string | null;
  };
}

type ActiveView = null | 'sharing' | 'discoverability' | 'data' | 'security' | 'ads';
type SharingStep = 'intro' | 'details';

const privacyOptions = [
  { value: 'public', label: 'Everyone' },
  { value: 'friends', label: 'Allies' },
  { value: 'friends_of_friends', label: 'Wider Circle' },
  { value: 'only_me', label: 'Only Me' }
];

const fallbackBlockedProfile = {
  display_name: 'Unknown Ally',
  username: 'unknown',
  profile_pic: null,
};

const PrivacyCheckup = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeView, setActiveView] = useState<ActiveView>(null);
  const [sharingStep, setSharingStep] = useState<SharingStep>('intro');
  const [showSharingIntro, setShowSharingIntro] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData>({ email: '', birthday: '', relationship: '' });
  const [privacySettings, setPrivacySettings] = useState<Record<string, string>>({});
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUserData = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [profileRes, settingsRes, blocksRes, legacyBlocksRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('email, birthday, relationship')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('privacy_settings')
          .select('setting_name, setting_value')
          .eq('user_id', user.id),
        supabase
          .from('blocks')
          .select('blocked_id')
          .eq('blocker_id', user.id),
        supabase
          .from('blocked_users')
          .select('blocked_user_id')
          .eq('user_id', user.id),
      ]);

      if (profileRes.error) throw profileRes.error;
      if (settingsRes.error) throw settingsRes.error;
      if (blocksRes.error) throw blocksRes.error;
      if (legacyBlocksRes.error) throw legacyBlocksRes.error;

      setProfileData({
        email: profileRes.data?.email || '',
        birthday: profileRes.data?.birthday || '',
        relationship: profileRes.data?.relationship || '',
      });

      const settingsObject = (settingsRes.data ?? []).reduce((acc: Record<string, string>, setting) => {
        acc[setting.setting_name] = setting.setting_value;
        return acc;
      }, {});
      setPrivacySettings(settingsObject);

      const blockedIds = Array.from(
        new Set([
          ...(blocksRes.data ?? []).map(block => block.blocked_id),
          ...(legacyBlocksRes.data ?? []).map(block => block.blocked_user_id),
        ])
      );

      if (blockedIds.length === 0) {
        setBlockedUsers([]);
      } else {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, display_name, username, profile_pic')
          .in('id', blockedIds);

        if (profilesError) throw profilesError;

        const profileMap = new Map((profiles ?? []).map(profile => [profile.id, profile]));

        setBlockedUsers(
          blockedIds.map((blockedId) => ({
            blocked_user_id: blockedId,
            profiles: profileMap.get(blockedId) || fallbackBlockedProfile,
          }))
        );
      }
    } catch {
      toast({ title: 'Error', description: 'Unable to retrieve privacy preferences', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast, user?.id]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  const saveProfileField = async (field: keyof ProfileData, value: string) => {
    if (!user?.id) return;

    const { error } = await supabase
      .from('profiles')
      .update({ [field]: value })
      .eq('id', user.id);

    if (error) {
      toast({ title: 'Error', description: 'Could not save changes', variant: 'destructive' });
      await fetchUserData();
      return;
    }

    toast({ title: 'Saved', description: 'Profile detail refreshed' });
  };

  const updatePrivacySetting = async (name: string, value: string) => {
    if (!user?.id) return;

    const previousValue = privacySettings[name];
    setPrivacySettings(prev => ({ ...prev, [name]: value }));

    const { error } = await supabase
      .from('privacy_settings')
      .upsert(
        {
          user_id: user.id,
          setting_name: name,
          setting_value: value,
        },
        {
          onConflict: 'user_id,setting_name',
        }
      );

    if (error) {
      setPrivacySettings(prev => {
        const next = { ...prev };
        if (previousValue === undefined) {
          delete next[name];
        } else {
          next[name] = previousValue;
        }
        return next;
      });
      toast({ title: 'Error', description: 'Could not persist preference', variant: 'destructive' });
      return;
    }

    toast({ title: 'Saved', description: 'Preference recorded' });
  };

  const unblockUser = async (blockedUserId: string) => {
    if (!user?.id) return;

    const [blocksDelete, legacyBlocksDelete] = await Promise.all([
      supabase
        .from('blocks')
        .delete()
        .eq('blocker_id', user.id)
        .eq('blocked_id', blockedUserId),
      supabase
        .from('blocked_users')
        .delete()
        .eq('user_id', user.id)
        .eq('blocked_user_id', blockedUserId),
    ]);

    if (blocksDelete.error && legacyBlocksDelete.error) {
      toast({ title: 'Error', description: 'Could not lift restriction', variant: 'destructive' });
      return;
    }

    setBlockedUsers(prev => prev.filter(blocked => blocked.blocked_user_id !== blockedUserId));
    toast({ title: 'Done', description: 'Restriction removed' });
  };

  if (loading) return <div className="p-6 text-center text-muted-foreground">Loading privacy preferences...</div>;

  const cards: { id: ActiveView; title: string; image: string; bg: string }[] = [
    { id: 'sharing', title: 'Who can observe what you share', image: whoCanSeeImg, bg: 'bg-amber-100 dark:bg-amber-950/30' },
    { id: 'discoverability', title: 'How others can discover you on Tone', image: howPeopleFindImg, bg: 'bg-sky-100 dark:bg-sky-950/30' },
    { id: 'data', title: 'Your data controls on Tone', image: dataSettingsImg, bg: 'bg-emerald-100 dark:bg-emerald-950/30' },
    { id: 'security', title: 'How to keep your account secure', image: accountSecureImg, bg: 'bg-blue-100 dark:bg-blue-950/30' },
    { id: 'ads', title: 'Your ad preferences on Tone', image: adPreferencesImg, bg: 'bg-pink-100 dark:bg-pink-950/30' },
  ];

  // Landing page
  if (!activeView) {
    return (
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-foreground mb-1">Privacy Checkup</h2>
        <p className="text-muted-foreground mb-6 text-sm leading-relaxed">
          We&apos;ll guide you through key controls so you can tailor the right privacy choices for your account.
          Which area would you like to start with?
        </p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          {cards.slice(0, 2).map(card => (
            <button
              key={card.id}
              onClick={() => {
                if (card.id === 'sharing') {
                  setSharingStep('intro');
                  setShowSharingIntro(true);
                } else {
                  setActiveView(card.id);
                }
              }}
              className={`${card.bg} rounded-xl overflow-hidden text-left transition-all hover:shadow-lg hover:scale-[1.02] border border-border/30`}
            >
              <img src={card.image} alt={card.title} className="w-full h-36 object-cover" />
              <p className="font-semibold text-sm text-foreground p-3 pt-2">{card.title}</p>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4 mb-6">
          {cards.slice(2).map(card => (
            <button
              key={card.id}
              onClick={() => setActiveView(card.id)}
              className={`${card.bg} rounded-xl overflow-hidden text-left transition-all hover:shadow-lg hover:scale-[1.02] border border-border/30`}
            >
              <img src={card.image} alt={card.title} className="w-full h-28 object-cover" />
              <p className="font-semibold text-sm text-foreground p-3 pt-2">{card.title}</p>
            </button>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">
          You can review more privacy controls in{' '}
          <span className="text-primary font-medium cursor-pointer">Settings Preferences</span>
        </p>

        {/* Sharing Intro Modal */}
        <Dialog open={showSharingIntro} onOpenChange={setShowSharingIntro}>
          <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-xl border-border">
            <div className="bg-amber-500 relative">
              <img src={whoCanSeeImg} alt="Who can observe what you share" className="w-full h-48 object-cover" />
              <button
                onClick={() => setShowSharingIntro(false)}
                className="absolute top-3 right-3 bg-background/80 hover:bg-background rounded-full p-1.5 transition-colors"
              >
                <X className="h-4 w-4 text-foreground" />
              </button>
            </div>
            <div className="p-6 pt-4 space-y-4">
              <div>
                <h3 className="text-lg font-bold text-foreground">Who can observe what you share</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Thank you for reviewing who can observe what you share. You can make adjustments at any time in settings.
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-medium text-foreground">Profile Details</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-medium text-foreground">Audience</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-medium text-foreground">Mentioning</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                    <ShieldBan className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-medium text-foreground">Restricting</span>
                </div>
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  setShowSharingIntro(false);
                  setActiveView('sharing');
                }}
              >
                Continue
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Detail views
  const renderBackButton = () => (
    <Button variant="ghost" size="sm" onClick={() => setActiveView(null)} className="mb-4 -ml-2 text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4 mr-1" /> Back to overview
    </Button>
  );

  const renderSharingView = () => (
    <div className="space-y-6">
      {renderBackButton()}
      <h3 className="text-xl font-bold text-foreground">Who can observe what you share</h3>

      <div className="space-y-4">
        <div>
          <Label>Who can observe your future posts?</Label>
          <Select value={privacySettings.future_posts_visibility || 'friends'} onValueChange={v => updatePrivacySetting('future_posts_visibility', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{privacyOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Who can observe your stories?</Label>
          <Select value={privacySettings.stories_visibility || 'friends'} onValueChange={v => updatePrivacySetting('stories_visibility', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{privacyOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Limit who can observe older posts</Label>
          <Select value={privacySettings.past_posts_visibility || 'friends'} onValueChange={v => updatePrivacySetting('past_posts_visibility', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{privacyOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Who can observe your allies list?</Label>
          <Select value={privacySettings.friends_list_visibility || 'friends'} onValueChange={v => updatePrivacySetting('friends_list_visibility', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{privacyOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Who can observe posts where you&apos;re mentioned on your profile?</Label>
          <Select value={privacySettings.tagged_posts_visibility || 'friends'} onValueChange={v => updatePrivacySetting('tagged_posts_visibility', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{privacyOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h4 className="font-semibold text-foreground">Tag Review</h4>
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Review tags allies add before they appear</Label>
            <p className="text-sm text-muted-foreground">Tags need your approval before they show on your profile</p>
          </div>
          <Switch checked={privacySettings.review_tags === 'true'} onCheckedChange={c => updatePrivacySetting('review_tags', c.toString())} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Review posts where you&apos;re mentioned before they appear on your profile</Label>
            <p className="text-sm text-muted-foreground">Mentioned posts need approval before appearing on your timeline</p>
          </div>
          <Switch checked={privacySettings.review_tagged_posts === 'true'} onCheckedChange={c => updatePrivacySetting('review_tagged_posts', c.toString())} />
        </div>
      </div>
    </div>
  );

  const renderDiscoverabilityView = () => (
    <div className="space-y-6">
      {renderBackButton()}
      <h3 className="text-xl font-bold text-foreground">How others can discover you on Tone</h3>

      <div className="space-y-4">
        <div>
          <Label>Who can send you ally requests?</Label>
          <Select value={privacySettings.friend_requests_from || 'everyone'} onValueChange={v => updatePrivacySetting('friend_requests_from', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="everyone">Everyone</SelectItem>
              <SelectItem value="friends_of_friends">Wider Circle</SelectItem>
              <SelectItem value="no_one">Nobody</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Who can discover your profile with your email address?</Label>
          <Select value={privacySettings.findable_by_email || 'friends'} onValueChange={v => updatePrivacySetting('findable_by_email', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="everyone">Everyone</SelectItem>
              <SelectItem value="friends">Allies</SelectItem>
              <SelectItem value="no_one">Nobody</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Who can discover your profile with your phone number?</Label>
          <Select value={privacySettings.findable_by_phone || 'friends'} onValueChange={v => updatePrivacySetting('findable_by_phone', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="everyone">Everyone</SelectItem>
              <SelectItem value="friends">Allies</SelectItem>
              <SelectItem value="no_one">Nobody</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Allow search engines to list your profile</Label>
            <p className="text-sm text-muted-foreground">Let search engines outside Tone reference your profile</p>
          </div>
          <Switch checked={privacySettings.search_engine_indexing === 'true'} onCheckedChange={c => updatePrivacySetting('search_engine_indexing', c.toString())} />
        </div>
      </div>
    </div>
  );

  const renderDataView = () => (
    <div className="space-y-6">
      {renderBackButton()}
      <h3 className="text-xl font-bold text-foreground">Your data controls on Tone</h3>

      <div className="space-y-4">
        <div>
          <Label htmlFor="email">Email Address</Label>
          <Input
            id="email"
            type="email"
            value={profileData.email}
            onChange={e => setProfileData(prev => ({ ...prev, email: e.target.value }))}
            onBlur={() => saveProfileField('email', profileData.email)}
            placeholder="Enter your email"
          />
        </div>
        <div>
          <Label htmlFor="birthday">Birth Date</Label>
          <Input
            id="birthday"
            type="date"
            value={profileData.birthday}
            onChange={e => setProfileData(prev => ({ ...prev, birthday: e.target.value }))}
            onBlur={() => saveProfileField('birthday', profileData.birthday)}
          />
        </div>
        <div>
          <Label htmlFor="relationship">Union Status</Label>
          <Select
            value={profileData.relationship}
            onValueChange={(value) => {
              setProfileData(prev => ({ ...prev, relationship: value }));
              saveProfileField('relationship', value);
            }}
          >
            <SelectTrigger><SelectValue placeholder="Pick union status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="single">Uncommitted</SelectItem>
              <SelectItem value="in_relationship">In a Union</SelectItem>
              <SelectItem value="married">Married</SelectItem>
              <SelectItem value="its_complicated">It&apos;s Complex</SelectItem>
              <SelectItem value="prefer_not_to_say">Prefer Not to Say</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Who can observe people, Pages, and lists you follow?</Label>
          <Select value={privacySettings.following_visibility || 'friends'} onValueChange={v => updatePrivacySetting('following_visibility', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{privacyOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  const renderSecurityView = () => (
    <div className="space-y-6">
      {renderBackButton()}
      <h3 className="text-xl font-bold text-foreground">How to keep your account secure</h3>

      <div className="space-y-4">
        <h4 className="font-semibold text-foreground">Barred Users</h4>
        {blockedUsers.length === 0 ? (
          <p className="text-muted-foreground">No barred users for now</p>
        ) : (
          <div className="space-y-3">
            {blockedUsers.map(blocked => (
              <div key={blocked.blocked_user_id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                <div className="flex items-center space-x-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={blocked.profiles?.profile_pic || ''} />
                    <AvatarFallback>{blocked.profiles?.display_name?.charAt(0)?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-foreground">{blocked.profiles?.display_name}</p>
                    <p className="text-sm text-muted-foreground">@{blocked.profiles?.username}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => unblockUser(blocked.blocked_user_id)} className="text-destructive hover:text-destructive/80">
                  <Trash2 className="h-4 w-4 mr-2" /> Remove Restriction
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-4">
        <h4 className="font-semibold text-foreground">Tag Audience Expansion</h4>
        <div>
          <Label>When you&apos;re mentioned in a post, who can be added to the audience?</Label>
          <Select value={privacySettings.tag_audience_expansion || 'friends'} onValueChange={v => updatePrivacySetting('tag_audience_expansion', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{privacyOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  const renderAdsView = () => (
    <div className="space-y-6">
      {renderBackButton()}
      <h3 className="text-xl font-bold text-foreground">Your ad preferences on Tone</h3>
      <p className="text-muted-foreground text-sm">
        Tailor how ads are customized for you. Go to Ad Preferences in Settings for full controls.
      </p>
    </div>
  );

  const views: Record<string, () => JSX.Element> = {
    sharing: renderSharingView,
    discoverability: renderDiscoverabilityView,
    data: renderDataView,
    security: renderSecurityView,
    ads: renderAdsView,
  };

  return <div className="max-w-2xl mx-auto">{views[activeView]?.()}</div>;
};

export default PrivacyCheckup;
