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
import { ArrowLeft, Trash2, User, Monitor, Tag, ShieldBan, X, ChevronRight, Check, UserPlus, Phone, Search } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import whoCanSeeImg from '@/assets/privacy/who-can-see.png';
import howPeopleFindImg from '@/assets/privacy/how-people-find.png';
import dataSettingsImg from '@/assets/privacy/data-settings.png';
import accountSecureImg from '@/assets/privacy/account-secure.png';
import adPreferencesImg from '@/assets/privacy/ad-preferences.png';

interface ProfileData {
  email: string;
  birthday: string;
  relationship: string;
  email_visibility: string;
  birth_date_visibility: string;
  birth_year_visibility: string;
  relationship_visibility: string;
  friends_visibility: string;
  following_visibility: string;
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
type SharingStep = 'intro' | 'profile_info' | 'audience' | 'mentioning' | 'blocking' | 'completion';
type DiscoverStep = 'intro' | 'ally_requests' | 'contact_lookup' | 'search_engines' | 'completion';

const privacyOptions = [
  { value: 'public', label: 'Everyone' },
  { value: 'friends', label: 'Allies' },
  { value: 'friends_of_friends', label: 'Wider Circle' },
  { value: 'only_me', label: 'Only Me' }
];

const visibilityLabel = (val: string | null | undefined) => {
  if (!val) return 'Allies';
  const found = privacyOptions.find(o => o.value === val);
  return found?.label || val.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

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
  const [showSharingWizard, setShowSharingWizard] = useState(false);
  const [discoverStep, setDiscoverStep] = useState<DiscoverStep>('intro');
  const [showDiscoverIntro, setShowDiscoverIntro] = useState(false);
  const [showDiscoverWizard, setShowDiscoverWizard] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData>({
    email: '', birthday: '', relationship: '',
    email_visibility: 'only_me', birth_date_visibility: 'friends',
    birth_year_visibility: 'friends', relationship_visibility: 'friends',
    friends_visibility: 'only_me', following_visibility: 'only_me',
  });
  const [privacySettings, setPrivacySettings] = useState<Record<string, string>>({});
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [showBlockedList, setShowBlockedList] = useState(false);

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
          .select('email, birthday, relationship, email_visibility, birth_date_visibility, birth_year_visibility, relationship_visibility, friends_visibility, following_visibility')
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
        email_visibility: profileRes.data?.email_visibility || 'only_me',
        birth_date_visibility: profileRes.data?.birth_date_visibility || 'friends',
        birth_year_visibility: profileRes.data?.birth_year_visibility || 'friends',
        relationship_visibility: profileRes.data?.relationship_visibility || 'friends',
        friends_visibility: profileRes.data?.friends_visibility || 'only_me',
        following_visibility: String(profileRes.data?.following_visibility ?? 'only_me'),
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

  const saveProfileField = async (field: string, value: string) => {
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

    toast({ title: 'Saved', description: 'Preference recorded' });
  };

  const updateProfileVisibility = async (field: string, value: string) => {
    if (!user?.id) return;
    setProfileData(prev => ({ ...prev, [field]: value }));
    
    const { error } = await supabase
      .from('profiles')
      .update({ [field]: value })
      .eq('id', user.id);

    if (error) {
      toast({ title: 'Error', description: 'Could not save visibility', variant: 'destructive' });
      await fetchUserData();
      return;
    }

    toast({ title: 'Saved', description: 'Visibility updated' });
  };

  const updatePrivacySetting = async (name: string, value: string) => {
    if (!user?.id) return;

    const previousValue = privacySettings[name];
    setPrivacySettings(prev => ({ ...prev, [name]: value }));

    const { error } = await supabase
      .from('privacy_settings')
      .upsert(
        { user_id: user.id, setting_name: name, setting_value: value },
        { onConflict: 'user_id,setting_name' }
      );

    if (error) {
      setPrivacySettings(prev => {
        const next = { ...prev };
        if (previousValue === undefined) delete next[name];
        else next[name] = previousValue;
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
      supabase.from('blocks').delete().eq('blocker_id', user.id).eq('blocked_id', blockedUserId),
      supabase.from('blocked_users').delete().eq('user_id', user.id).eq('blocked_user_id', blockedUserId),
    ]);

    if (blocksDelete.error && legacyBlocksDelete.error) {
      toast({ title: 'Error', description: 'Could not lift restriction', variant: 'destructive' });
      return;
    }

    setBlockedUsers(prev => prev.filter(blocked => blocked.blocked_user_id !== blockedUserId));
    toast({ title: 'Done', description: 'Restriction removed' });
  };

  if (loading) return <div className="p-6 text-center text-muted-foreground">Loading privacy preferences...</div>;

  // Format birthday display
  const formatBirthdayDate = (birthday: string) => {
    if (!birthday) return 'Not set';
    const date = new Date(birthday);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  };

  const formatBirthdayYear = (birthday: string) => {
    if (!birthday) return 'Not set';
    const date = new Date(birthday);
    return date.getFullYear().toString();
  };

  const getRelationshipLabel = (value: string) => {
    const map: Record<string, string> = {
      single: 'Uncommitted',
      in_relationship: 'In a Union',
      married: 'Married',
      engaged: 'Betrothed',
      divorced: 'Separated',
      widowed: 'Widowed',
      its_complicated: 'Complex',
      prefer_not_to_say: 'Undisclosed',
    };
    return map[value] || value || 'Not set';
  };

  const sharingSteps: SharingStep[] = ['profile_info', 'audience', 'mentioning', 'blocking', 'completion'];
  const currentStepIndex = sharingSteps.indexOf(sharingStep);
  const progressPercent = sharingStep === 'intro' ? 0 : sharingStep === 'completion' ? 100 : ((currentStepIndex + 1) / (sharingSteps.length - 1)) * 100;

  const handleSharingNext = () => {
    const idx = sharingSteps.indexOf(sharingStep);
    if (idx < sharingSteps.length - 1) {
      setSharingStep(sharingSteps[idx + 1]);
    } else {
      setShowSharingWizard(false);
      setSharingStep('intro');
    }
  };

  const handleSharingBack = () => {
    const idx = sharingSteps.indexOf(sharingStep);
    if (idx > 0) {
      setSharingStep(sharingSteps[idx - 1]);
    } else {
      setShowSharingWizard(false);
      setShowSharingIntro(true);
    }
  };

  // Inline visibility editor row
  const VisibilityRow = ({ label, sublabel, field, value }: { label: string; sublabel: string; field: string; value: string }) => (
    <div className="relative">
      <button
        className="w-full flex items-center justify-between py-3 px-1 hover:bg-muted/50 rounded-lg transition-colors text-left"
        onClick={() => setEditingField(editingField === field ? null : field)}
      >
        <div>
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{sublabel}</p>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </button>
      {editingField === field && (
        <div className="pb-3 px-1">
          <Select value={value} onValueChange={(v) => { updateProfileVisibility(field, v); setEditingField(null); }}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {privacyOptions.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );

  // Sharing wizard step: Profile Particulars
  const renderProfileInfoStep = () => (
    <div className="space-y-1">
      {/* Email Section */}
      <div>
        <h4 className="text-sm font-bold text-foreground px-1 pt-2 pb-1">Email address</h4>
        <VisibilityRow
          label={profileData.email || 'No email set'}
          sublabel={visibilityLabel(profileData.email_visibility)}
          field="email_visibility"
          value={profileData.email_visibility}
        />
      </div>

      {/* Birthday Section */}
      <div>
        <h4 className="text-sm font-bold text-foreground px-1 pt-2 pb-1">Date of Birth</h4>
        <VisibilityRow
          label={formatBirthdayDate(profileData.birthday)}
          sublabel={visibilityLabel(profileData.birth_date_visibility)}
          field="birth_date_visibility"
          value={profileData.birth_date_visibility}
        />
        <VisibilityRow
          label={formatBirthdayYear(profileData.birthday)}
          sublabel={visibilityLabel(profileData.birth_year_visibility)}
          field="birth_year_visibility"
          value={profileData.birth_year_visibility}
        />
      </div>

      {/* Relationship Section */}
      <div>
        <h4 className="text-sm font-bold text-foreground px-1 pt-2 pb-1">Union Status</h4>
        <VisibilityRow
          label={getRelationshipLabel(profileData.relationship)}
          sublabel={visibilityLabel(profileData.relationship_visibility)}
          field="relationship_visibility"
          value={profileData.relationship_visibility}
        />
      </div>

      {/* Friends and following Section */}
      <div>
        <h4 className="text-sm font-bold text-foreground px-1 pt-2 pb-1">Allies and Tracking</h4>
        <VisibilityRow
          label="Who can observe your allies list?"
          sublabel={visibilityLabel(profileData.friends_visibility)}
          field="friends_visibility"
          value={profileData.friends_visibility}
        />
        <VisibilityRow
          label="Who can observe the people and Pages you track?"
          sublabel={visibilityLabel(profileData.following_visibility)}
          field="following_visibility"
          value={profileData.following_visibility === 'true' ? 'public' : profileData.following_visibility === 'false' ? 'only_me' : profileData.following_visibility}
        />
      </div>
    </div>
  );

  // Sharing wizard step: Audience
  const renderAudienceStep = () => {
    const futurePostsVal = privacySettings.future_posts_visibility || 'public';
    const storiesVal = privacySettings.stories_visibility || 'friends';

    const handleLimitPastPosts = async () => {
      await updatePrivacySetting('past_posts_visibility', 'friends');
      toast({ title: 'Done', description: 'Prior posts are now restricted to Allies only' });
    };

    return (
      <div className="space-y-1">
        {/* Future posts */}
        <div className="relative">
          <button
            className="w-full flex items-center justify-between py-4 px-1 hover:bg-muted/50 rounded-lg transition-colors text-left"
            onClick={() => setEditingField(editingField === 'future_posts_visibility' ? null : 'future_posts_visibility')}
          >
            <div>
              <p className="text-sm font-semibold text-foreground">Who can observe your upcoming posts?</p>
              <p className="text-xs text-muted-foreground">{visibilityLabel(futurePostsVal)}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
          {editingField === 'future_posts_visibility' && (
            <div className="pb-3 px-1">
              <Select value={futurePostsVal} onValueChange={(v) => { updatePrivacySetting('future_posts_visibility', v); setEditingField(null); }}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {privacyOptions.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <Separator />

        {/* Stories */}
        <div className="relative">
          <button
            className="w-full flex items-center justify-between py-4 px-1 hover:bg-muted/50 rounded-lg transition-colors text-left"
            onClick={() => setEditingField(editingField === 'stories_visibility' ? null : 'stories_visibility')}
          >
            <div>
              <p className="text-sm font-semibold text-foreground">Who can observe your narratives?</p>
              <p className="text-xs text-muted-foreground">{visibilityLabel(storiesVal)}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
          {editingField === 'stories_visibility' && (
            <div className="pb-3 px-1">
              <Select value={storiesVal} onValueChange={(v) => { updatePrivacySetting('stories_visibility', v); setEditingField(null); }}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {privacyOptions.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <Separator />

        {/* Limit past posts */}
        <div className="flex items-center justify-between py-4 px-1">
          <p className="text-sm font-semibold text-foreground">Curb who can observe prior posts</p>
          <Button
            variant="outline"
            size="sm"
            className="text-xs font-medium"
            onClick={handleLimitPastPosts}
          >
            Curb prior posts
          </Button>
        </div>
      </div>
    );
  };

  // Sharing wizard step: Mentioning
  const renderMentioningStep = () => {
    const taggedPostsVal = privacySettings.tagged_posts_visibility || 'friends';
    const tagAudienceVal = privacySettings.tag_audience_expansion || 'friends';

    return (
      <div className="space-y-1">
        {/* Intro text */}
        <p className="text-xs text-muted-foreground px-1 pb-2">
          If you&apos;re cited in a post, it will be visible to the audience chosen by the post creator, as well as the audiences you select for these preferences.
        </p>

        {/* Who can see tagged posts */}
        <div className="relative">
          <button
            className="w-full flex items-center justify-between py-4 px-1 hover:bg-muted/50 rounded-lg transition-colors text-left"
            onClick={() => setEditingField(editingField === 'tagged_posts_visibility' ? null : 'tagged_posts_visibility')}
          >
            <div>
              <p className="text-sm font-semibold text-foreground">Who can observe posts you&apos;re cited in on your profile?</p>
              <p className="text-xs text-muted-foreground">{visibilityLabel(taggedPostsVal)}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
          {editingField === 'tagged_posts_visibility' && (
            <div className="pb-3 px-1">
              <Select value={taggedPostsVal} onValueChange={(v) => { updatePrivacySetting('tagged_posts_visibility', v); setEditingField(null); }}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {privacyOptions.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <Separator />

        {/* Tag audience expansion */}
        <div className="relative">
          <button
            className="w-full flex items-center justify-between py-4 px-1 hover:bg-muted/50 rounded-lg transition-colors text-left"
            onClick={() => setEditingField(editingField === 'tag_audience_expansion' ? null : 'tag_audience_expansion')}
          >
            <div className="pr-4">
              <p className="text-sm font-semibold text-foreground">When you&apos;re cited in a post, who do you want to include in the audience if they can&apos;t already observe it?</p>
              <p className="text-xs text-muted-foreground">{visibilityLabel(tagAudienceVal)}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          </button>
          {editingField === 'tag_audience_expansion' && (
            <div className="pb-3 px-1">
              <Select value={tagAudienceVal} onValueChange={(v) => { updatePrivacySetting('tag_audience_expansion', v); setEditingField(null); }}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {privacyOptions.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <Separator />

        {/* Review tags toggle */}
        <div className="flex items-start justify-between py-4 px-1 gap-4">
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Examine citations others append to your posts before they appear on Tone?</p>
            <p className="text-xs text-muted-foreground mt-1">
              If someone you&apos;re not allies with appends a citation to your post, you&apos;ll still be prompted to examine it.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Remember: When you approve a citation, the person cited and their allies may be able to observe your post.
            </p>
          </div>
          <Switch
            checked={privacySettings.review_tags === 'true'}
            onCheckedChange={c => updatePrivacySetting('review_tags', c.toString())}
          />
        </div>

        <Separator />

        {/* Review tagged posts toggle */}
        <div className="flex items-start justify-between py-4 px-1 gap-4">
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Examine posts you&apos;re cited in before the post surfaces on your profile?</p>
            <p className="text-xs text-muted-foreground mt-1">
              This only governs what&apos;s permitted on your profile. Posts you&apos;re cited in still surface in search, Feed and other areas on Tone.
            </p>
          </div>
          <Switch
            checked={privacySettings.review_tagged_posts === 'true'}
            onCheckedChange={c => updatePrivacySetting('review_tagged_posts', c.toString())}
          />
        </div>
      </div>
    );
  };

  // Sharing wizard step: Blocking
  const renderBlockingStep = () => {
    if (showBlockedList) {
      return (
        <div className="space-y-3">
          <button
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowBlockedList(false)}
          >
            <ArrowLeft className="h-4 w-4" /> Back to Blocking
          </button>
          <h4 className="font-semibold text-foreground">Barred Users</h4>
          {blockedUsers.length === 0 ? (
            <p className="text-muted-foreground text-sm">No barred users at present</p>
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
                    <Trash2 className="h-4 w-4 mr-2" /> Lift Restriction
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-1">
        {/* Intro text */}
        <p className="text-sm text-muted-foreground px-1 pb-2">
          When you bar someone, they will no longer observe things you post on your profile, cite you, invite you to events or groups, initiate a conversation with you or add you as an ally.
        </p>

        {/* Tip */}
        <div className="flex items-start gap-3 bg-muted/50 rounded-lg p-3 mx-1">
          <span className="text-lg">💡</span>
          <p className="text-xs text-muted-foreground">
            Tip: When you bar someone, we won&apos;t notify them that you&apos;ve barred them.
          </p>
        </div>

        <Separator className="my-2" />

        {/* Blocking link */}
        <button
          className="w-full flex items-center justify-between py-4 px-1 hover:bg-muted/50 rounded-lg transition-colors text-left"
          onClick={() => setShowBlockedList(true)}
        >
          <p className="text-sm font-semibold text-foreground">Blocking</p>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>
    );
  };

  const renderCompletionStep = () => {
    const completedItems = [
      { label: 'Profile Particulars', done: true },
      { label: 'Audience', done: true },
      { label: 'Mentioning', done: true },
      { label: 'Blocking', done: true },
    ];

    return (
      <div className="flex flex-col items-center text-center py-6 space-y-5">
        <h3 className="text-xl font-bold text-foreground">You're all set!</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Thank you for reviewing Who can observe what you share. You can make adjustments at any time in settings.
        </p>
        <div className="w-full space-y-3 text-left">
          {completedItems.map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <Check className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-sm text-foreground">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const sharingStepTitles: Record<string, string> = {
    profile_info: 'Profile Particulars',
    audience: 'Audience',
    mentioning: 'Mentioning',
    blocking: 'Blocking',
    completion: 'Complete',
  };

  const sharingStepRenderers: Record<string, () => JSX.Element> = {
    profile_info: renderProfileInfoStep,
    audience: renderAudienceStep,
    mentioning: renderMentioningStep,
    blocking: renderBlockingStep,
    completion: renderCompletionStep,
  };

  // === Discover wizard logic ===
  const discoverSteps: DiscoverStep[] = ['ally_requests', 'contact_lookup', 'search_engines', 'completion'];
  const discoverCurrentStepIndex = discoverSteps.indexOf(discoverStep);
  const discoverProgressPercent = discoverStep === 'intro' ? 0 : discoverStep === 'completion' ? 100 : ((discoverCurrentStepIndex + 1) / (discoverSteps.length - 1)) * 100;

  const handleDiscoverNext = () => {
    const idx = discoverSteps.indexOf(discoverStep);
    if (idx < discoverSteps.length - 1) {
      setDiscoverStep(discoverSteps[idx + 1]);
    } else {
      setShowDiscoverWizard(false);
      setDiscoverStep('intro');
    }
  };

  const handleDiscoverBack = () => {
    const idx = discoverSteps.indexOf(discoverStep);
    if (idx > 0) {
      setDiscoverStep(discoverSteps[idx - 1]);
    } else {
      setShowDiscoverWizard(false);
      setShowDiscoverIntro(true);
    }
  };

  const renderAllyRequestsStep = () => {
    const friendRequestsVal = privacySettings.friend_requests_from || 'everyone';
    return (
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground px-1 pb-2">
          Specify who is authorized to dispatch companion appeals on Tone.
        </p>
        <div className="relative">
          <button
            className="w-full flex items-center justify-between py-4 px-1 hover:bg-muted/50 rounded-lg transition-colors text-left"
            onClick={() => setEditingField(editingField === 'friend_requests_from' ? null : 'friend_requests_from')}
          >
            <div>
              <p className="text-sm font-semibold text-foreground">Who can dispatch you companion appeals?</p>
              <p className="text-xs text-muted-foreground">
                {friendRequestsVal === 'everyone' ? 'Everyone' : friendRequestsVal === 'friends_of_friends' ? 'Wider Circle' : 'Nobody'}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
          {editingField === 'friend_requests_from' && (
            <div className="pb-3 px-1">
              <Select value={friendRequestsVal} onValueChange={(v) => { updatePrivacySetting('friend_requests_from', v); setEditingField(null); }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="everyone">Everyone</SelectItem>
                  <SelectItem value="friends_of_friends">Wider Circle</SelectItem>
                  <SelectItem value="no_one">Nobody</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderContactLookupStep = () => {
    const findByEmailVal = privacySettings.findable_by_email || 'friends';
    const findByPhoneVal = privacySettings.findable_by_phone || 'friends';
    return (
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground px-1 pb-2">
          Decide who can locate your profile using your phone number or email address.
        </p>
        <div className="relative">
          <button
            className="w-full flex items-center justify-between py-4 px-1 hover:bg-muted/50 rounded-lg transition-colors text-left"
            onClick={() => setEditingField(editingField === 'findable_by_email' ? null : 'findable_by_email')}
          >
            <div>
              <p className="text-sm font-semibold text-foreground">Who can locate you via your email address?</p>
              <p className="text-xs text-muted-foreground">
                {findByEmailVal === 'everyone' ? 'Everyone' : findByEmailVal === 'friends' ? 'Allies' : 'Nobody'}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
          {editingField === 'findable_by_email' && (
            <div className="pb-3 px-1">
              <Select value={findByEmailVal} onValueChange={(v) => { updatePrivacySetting('findable_by_email', v); setEditingField(null); }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="everyone">Everyone</SelectItem>
                  <SelectItem value="friends">Allies</SelectItem>
                  <SelectItem value="no_one">Nobody</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <Separator />

        <div className="relative">
          <button
            className="w-full flex items-center justify-between py-4 px-1 hover:bg-muted/50 rounded-lg transition-colors text-left"
            onClick={() => setEditingField(editingField === 'findable_by_phone' ? null : 'findable_by_phone')}
          >
            <div>
              <p className="text-sm font-semibold text-foreground">Who can locate you via your phone number?</p>
              <p className="text-xs text-muted-foreground">
                {findByPhoneVal === 'everyone' ? 'Everyone' : findByPhoneVal === 'friends' ? 'Allies' : 'Nobody'}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
          {editingField === 'findable_by_phone' && (
            <div className="pb-3 px-1">
              <Select value={findByPhoneVal} onValueChange={(v) => { updatePrivacySetting('findable_by_phone', v); setEditingField(null); }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="everyone">Everyone</SelectItem>
                  <SelectItem value="friends">Allies</SelectItem>
                  <SelectItem value="no_one">Nobody</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSearchEnginesStep = () => (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground px-1 pb-2">
        Determine whether search engines beyond Tone are permitted to reference your profile.
      </p>
      <div className="flex items-start justify-between py-4 px-1 gap-4">
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Permit search engines beyond Tone to reference your profile?</p>
          <p className="text-xs text-muted-foreground mt-1">
            Disabling this may take some time since search engines maintain their own catalogues.
          </p>
        </div>
        <Switch
          checked={privacySettings.search_engine_indexing === 'true'}
          onCheckedChange={c => updatePrivacySetting('search_engine_indexing', c.toString())}
        />
      </div>
    </div>
  );

  const renderDiscoverCompletionStep = () => {
    const completedItems = [
      { label: 'Ally Solicitations', done: true },
      { label: 'Phone number and email', done: true },
      { label: 'Search engines', done: true },
    ];

    return (
      <div className="flex flex-col items-center text-center py-6 space-y-5">
        <h3 className="text-xl font-bold text-foreground">You're all set!</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Thank you for reviewing How others can discover you on Tone. You can make adjustments at any time in settings.
        </p>
        <div className="w-full space-y-3 text-left">
          {completedItems.map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <Check className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-sm text-foreground">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const discoverStepTitles: Record<string, string> = {
    ally_requests: 'Companion Appeals',
    contact_lookup: 'Phone number and email',
    search_engines: 'Search engines',
    completion: 'Complete',
  };

  const discoverStepRenderers: Record<string, () => JSX.Element> = {
    ally_requests: renderAllyRequestsStep,
    contact_lookup: renderContactLookupStep,
    search_engines: renderSearchEnginesStep,
    completion: renderDiscoverCompletionStep,
  };

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
                } else if (card.id === 'discoverability') {
                  setDiscoverStep('intro');
                  setShowDiscoverIntro(true);
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
            <div className="bg-primary/80 relative">
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
                  <span className="text-sm font-medium text-foreground">Profile Particulars</span>
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
                  <span className="text-sm font-medium text-foreground">Blocking</span>
                </div>
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  setShowSharingIntro(false);
                  setSharingStep('profile_info');
                  setShowSharingWizard(true);
                }}
              >
                Continue
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Sharing Wizard Modal */}
        <Dialog open={showSharingWizard} onOpenChange={(open) => {
          setShowSharingWizard(open);
          if (!open) setSharingStep('intro');
        }}>
          <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-xl border-border max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <button onClick={handleSharingBack} className="p-1 hover:bg-muted rounded-full transition-colors">
                <ArrowLeft className="h-5 w-5 text-foreground" />
              </button>
              <h3 className="text-base font-bold text-foreground">{sharingStepTitles[sharingStep] || 'Profile Particulars'}</h3>
              <button onClick={() => { setShowSharingWizard(false); setSharingStep('intro'); }} className="p-1 hover:bg-muted rounded-full transition-colors">
                <X className="h-5 w-5 text-foreground" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {sharingStepRenderers[sharingStep]?.()}
            </div>

            {/* Footer */}
            <div className="border-t border-border px-4 py-3 space-y-3">
              {sharingStep !== 'completion' && <Progress value={progressPercent} className="h-1.5" />}
              <div className="flex items-center justify-between">
                {sharingStep === 'completion' ? (
                  <Button className="w-full" onClick={() => { setShowSharingWizard(false); setSharingStep('intro'); }}>
                    Review another topic
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" onClick={handleSharingBack}>
                      Back
                    </Button>
                    <Button onClick={handleSharingNext}>
                      {currentStepIndex === sharingSteps.length - 2 ? 'Finish' : 'Next'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Discover Intro Modal */}
        <Dialog open={showDiscoverIntro} onOpenChange={setShowDiscoverIntro}>
          <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-xl border-border">
            <div className="bg-primary/80 relative">
              <img src={howPeopleFindImg} alt="How others can discover you on Tone" className="w-full h-48 object-cover" />
              <button
                onClick={() => setShowDiscoverIntro(false)}
                className="absolute top-3 right-3 bg-background/80 hover:bg-background rounded-full p-1.5 transition-colors"
              >
                <X className="h-4 w-4 text-foreground" />
              </button>
            </div>
            <div className="p-6 pt-4 space-y-4">
              <div>
                <h3 className="text-lg font-bold text-foreground">How others can discover you on Tone</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Thank you for reviewing How others can discover you on Tone. You can make adjustments at any time in settings.
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                    <UserPlus className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-medium text-foreground">Companion Appeals</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-medium text-foreground">Phone number and email</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                    <Search className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-medium text-foreground">Search engines</span>
                </div>
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  setShowDiscoverIntro(false);
                  setDiscoverStep('ally_requests');
                  setShowDiscoverWizard(true);
                }}
              >
                Continue
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Discover Wizard Modal */}
        <Dialog open={showDiscoverWizard} onOpenChange={(open) => {
          setShowDiscoverWizard(open);
          if (!open) setDiscoverStep('intro');
        }}>
          <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-xl border-border max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <button onClick={handleDiscoverBack} className="p-1 hover:bg-muted rounded-full transition-colors">
                <ArrowLeft className="h-5 w-5 text-foreground" />
              </button>
              <h3 className="text-base font-bold text-foreground">{discoverStepTitles[discoverStep] || 'Companion Appeals'}</h3>
              <button onClick={() => { setShowDiscoverWizard(false); setDiscoverStep('intro'); }} className="p-1 hover:bg-muted rounded-full transition-colors">
                <X className="h-5 w-5 text-foreground" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {discoverStepRenderers[discoverStep]?.()}
            </div>

            {/* Footer */}
            <div className="border-t border-border px-4 py-3 space-y-3">
              {discoverStep !== 'completion' && <Progress value={discoverProgressPercent} className="h-1.5" />}
              <div className="flex items-center justify-between">
                {discoverStep === 'completion' ? (
                  <Button className="w-full" onClick={() => { setShowDiscoverWizard(false); setDiscoverStep('intro'); }}>
                    Review another topic
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" onClick={handleDiscoverBack}>
                      Back
                    </Button>
                    <Button onClick={handleDiscoverNext}>
                      {discoverCurrentStepIndex === discoverSteps.length - 2 ? 'Finish' : 'Next'}
                    </Button>
                  </>
                )}
              </div>
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
          <Label htmlFor="birthday">Date of Birth</Label>
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
          <Label>Who can observe people, Pages, and lists you track?</Label>
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
        <h4 className="font-semibold text-foreground">Mention Audience Expansion</h4>
        <div>
          <Label>When you&apos;re cited in a post, who can be appended to the audience?</Label>
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
    sharing: () => {
      if (!showSharingWizard) {
        setSharingStep('profile_info');
        setShowSharingWizard(true);
        setActiveView(null);
      }
      return <div />;
    },
    discoverability: () => {
      if (!showDiscoverWizard) {
        setDiscoverStep('ally_requests');
        setShowDiscoverWizard(true);
        setActiveView(null);
      }
      return <div />;
    },
    data: renderDataView,
    security: renderSecurityView,
    ads: renderAdsView,
  };

  return <div className="max-w-2xl mx-auto">{views[activeView]?.()}</div>;
};

export default PrivacyCheckup;
