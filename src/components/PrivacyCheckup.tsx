import { useState, useEffect } from 'react';
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
import { ArrowLeft, Trash2 } from 'lucide-react';
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
  id: string;
  blocked_user_id: string;
  profiles: {
    display_name: string;
    username: string;
    profile_pic: string | null;
  };
}

type ActiveView = null | 'sharing' | 'discoverability' | 'data' | 'security' | 'ads';

const privacyOptions = [
  { value: 'public', label: 'Everyone' },
  { value: 'friends', label: 'Companions' },
  { value: 'friends_of_friends', label: 'Extended Circle' },
  { value: 'only_me', label: 'Just Me' }
];

const PrivacyCheckup = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeView, setActiveView] = useState<ActiveView>(null);
  const [profileData, setProfileData] = useState<ProfileData>({ email: '', birthday: '', relationship: '' });
  const [privacySettings, setPrivacySettings] = useState<Record<string, string>>({});
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchUserData();
  }, [user]);

  const fetchUserData = async () => {
    try {
      const [profileRes, settingsRes, blockedRes] = await Promise.all([
        supabase.from('profiles').select('email, birthday, relationship').eq('id', user?.id).single(),
        supabase.from('privacy_settings').select('setting_name, setting_value').eq('user_id', user?.id),
        supabase.from('blocked_users').select('id, blocked_user_id').eq('user_id', user?.id)
      ]);

      if (profileRes.data) {
        setProfileData({
          email: profileRes.data.email || '',
          birthday: profileRes.data.birthday || '',
          relationship: profileRes.data.relationship || ''
        });
      }

      if (settingsRes.data) {
        const obj = settingsRes.data.reduce((acc: Record<string, string>, s: any) => {
          acc[s.setting_name] = s.setting_value;
          return acc;
        }, {});
        setPrivacySettings(obj);
      }

      if (blockedRes.data && blockedRes.data.length > 0) {
        const ids = blockedRes.data.map((b: any) => b.blocked_user_id);
        const { data: profiles } = await supabase.from('profiles').select('id, display_name, username, profile_pic').in('id', ids);
        setBlockedUsers(blockedRes.data.map((b: any) => ({
          ...b,
          profiles: profiles?.find((p: any) => p.id === b.blocked_user_id) || { display_name: 'Unknown', username: 'unknown', profile_pic: null }
        })));
      }
    } catch {
      toast({ title: 'Error', description: 'Unable to retrieve privacy preferences', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (field: keyof ProfileData, value: string) => {
    setProfileData(prev => ({ ...prev, [field]: value }));
    const { error } = await supabase.from('profiles').update({ [field]: value }).eq('id', user?.id);
    if (error) toast({ title: 'Error', description: 'Could not save changes', variant: 'destructive' });
    else toast({ title: 'Saved', description: 'Profile detail refreshed' });
  };

  const updatePrivacySetting = async (name: string, value: string) => {
    setPrivacySettings(prev => ({ ...prev, [name]: value }));
    const { error } = await supabase.from('privacy_settings').upsert({ user_id: user?.id, setting_name: name, setting_value: value });
    if (error) toast({ title: 'Error', description: 'Could not persist preference', variant: 'destructive' });
    else toast({ title: 'Saved', description: 'Preference recorded' });
  };

  const unblockUser = async (blockedUserId: string) => {
    const { error } = await supabase.from('blocked_users').delete().eq('user_id', user?.id).eq('blocked_user_id', blockedUserId);
    if (error) toast({ title: 'Error', description: 'Could not lift restriction', variant: 'destructive' });
    else {
      setBlockedUsers(prev => prev.filter(b => b.blocked_user_id !== blockedUserId));
      toast({ title: 'Done', description: 'Restriction removed' });
    }
  };

  if (loading) return <div className="p-6 text-center text-muted-foreground">Loading privacy preferences...</div>;

  const cards: { id: ActiveView; title: string; image: string; bg: string }[] = [
    { id: 'sharing', title: 'Who can observe what you share', image: whoCanSeeImg, bg: 'bg-amber-100 dark:bg-amber-950/30' },
    { id: 'discoverability', title: 'How others can discover you on Tone', image: howPeopleFindImg, bg: 'bg-sky-100 dark:bg-sky-950/30' },
    { id: 'data', title: 'Your data configurations on Tone', image: dataSettingsImg, bg: 'bg-emerald-100 dark:bg-emerald-950/30' },
    { id: 'security', title: 'How to maintain your account protected', image: accountSecureImg, bg: 'bg-blue-100 dark:bg-blue-950/30' },
    { id: 'ads', title: 'Your advertisement preferences on Tone', image: adPreferencesImg, bg: 'bg-pink-100 dark:bg-pink-950/30' },
  ];

  // Landing page
  if (!activeView) {
    return (
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-foreground mb-1">Privacy Checkup</h2>
        <p className="text-muted-foreground mb-6 text-sm leading-relaxed">
          We'll walk you through certain configurations so you can make the appropriate decisions for your account.
          Which subject would you like to begin with?
        </p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          {cards.slice(0, 2).map(card => (
            <button
              key={card.id}
              onClick={() => setActiveView(card.id)}
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
          You can inspect additional privacy configurations on Tone in{' '}
          <span className="text-primary font-medium cursor-pointer">Preferences</span>
        </p>
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
          <Label>Who can observe your forthcoming posts?</Label>
          <Select value={privacySettings.future_posts_visibility || 'friends'} onValueChange={v => updatePrivacySetting('future_posts_visibility', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{privacyOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Who can observe your narratives?</Label>
          <Select value={privacySettings.stories_visibility || 'friends'} onValueChange={v => updatePrivacySetting('stories_visibility', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{privacyOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Limit who can observe earlier posts</Label>
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
          <Label>Who can observe posts you're mentioned in on your profile?</Label>
          <Select value={privacySettings.tagged_posts_visibility || 'friends'} onValueChange={v => updatePrivacySetting('tagged_posts_visibility', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{privacyOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h4 className="font-semibold text-foreground">Tag Supervision</h4>
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Review tags allies attach before they appear</Label>
            <p className="text-sm text-muted-foreground">Tags will need your approval before showing on your profile</p>
          </div>
          <Switch checked={privacySettings.review_tags === 'true'} onCheckedChange={c => updatePrivacySetting('review_tags', c.toString())} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Review posts you're mentioned in before they appear on your profile</Label>
            <p className="text-sm text-muted-foreground">Mentioned posts will need approval to surface on your timeline</p>
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
          <Label>Who can transmit you ally requests?</Label>
          <Select value={privacySettings.friend_requests_from || 'everyone'} onValueChange={v => updatePrivacySetting('friend_requests_from', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="everyone">Everyone</SelectItem>
              <SelectItem value="friends_of_friends">Extended Circle</SelectItem>
              <SelectItem value="no_one">Nobody</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Who can discover your profile through your email?</Label>
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
          <Label>Who can discover your profile through your phone number?</Label>
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
            <Label className="text-sm font-medium">Allow search engines to index your profile</Label>
            <p className="text-sm text-muted-foreground">Permit search engines beyond Tone to reference your profile</p>
          </div>
          <Switch checked={privacySettings.search_engine_indexing === 'true'} onCheckedChange={c => updatePrivacySetting('search_engine_indexing', c.toString())} />
        </div>
      </div>
    </div>
  );

  const renderDataView = () => (
    <div className="space-y-6">
      {renderBackButton()}
      <h3 className="text-xl font-bold text-foreground">Your data configurations on Tone</h3>

      <div className="space-y-4">
        <div>
          <Label htmlFor="email">Electronic Mail</Label>
          <Input id="email" type="email" value={profileData.email} onChange={e => updateProfile('email', e.target.value)} placeholder="Enter your email" />
        </div>
        <div>
          <Label htmlFor="birthday">Birth Date</Label>
          <Input id="birthday" type="date" value={profileData.birthday} onChange={e => updateProfile('birthday', e.target.value)} />
        </div>
        <div>
          <Label htmlFor="relationship">Union Status</Label>
          <Select value={profileData.relationship} onValueChange={v => updateProfile('relationship', v)}>
            <SelectTrigger><SelectValue placeholder="Pick union status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="single">Uncommitted</SelectItem>
              <SelectItem value="in_relationship">In a Union</SelectItem>
              <SelectItem value="married">Married</SelectItem>
              <SelectItem value="its_complicated">It's Complex</SelectItem>
              <SelectItem value="prefer_not_to_say">Prefer Not to Say</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Who can observe the individuals, Pages, and lists you trail?</Label>
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
      <h3 className="text-xl font-bold text-foreground">How to maintain your account protected</h3>

      <div className="space-y-4">
        <h4 className="font-semibold text-foreground">Barred Users</h4>
        {blockedUsers.length === 0 ? (
          <p className="text-muted-foreground">No barred users currently</p>
        ) : (
          <div className="space-y-3">
            {blockedUsers.map(blocked => (
              <div key={blocked.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
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
                  <Trash2 className="h-4 w-4 mr-2" /> Remove Bar
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-4">
        <h4 className="font-semibold text-foreground">Tag Audience Broadening</h4>
        <div>
          <Label>When you're mentioned in a post, who can be appended to the audience?</Label>
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
      <h3 className="text-xl font-bold text-foreground">Your advertisement preferences on Tone</h3>
      <p className="text-muted-foreground text-sm">
        Oversee how advertisements are customized for you. Navigate to the Ad Preferences area in Preferences for thorough controls.
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
