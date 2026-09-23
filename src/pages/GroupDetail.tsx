import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { groupsApi, postsApi } from '@/api';
import type { GroupRule } from '@/api/types';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Users, Globe, Lock, Share2, ChevronDown,
  UserPlus, Search, MoreHorizontal, ArrowLeft,
  MessageSquare, ImageIcon,
  FileText, CalendarDays, Camera, Bell, UserX, LogOut,
  LayoutList, Pin, Flag, ChevronRight, Pencil, ClipboardList, EyeOff
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion } from 'framer-motion';
import InviteToGroupDialog from '@/components/groups/InviteToGroupDialog';
import ShareGroupDialog from '@/components/groups/ShareGroupDialog';
import GroupSearchDialog from '@/components/groups/GroupSearchDialog';
import GroupYourContent from '@/components/groups/GroupYourContent';
import PageContainer from '@/components/PageContainer';
import GroupMediaFiles from '@/components/groups/GroupMediaFiles';
import GroupNotificationSettings from '@/components/groups/GroupNotificationSettings';
import ReportGroupDialog from '@/components/groups/ReportGroupDialog';
import GroupRulesManagerDialog from '@/components/groups/GroupRulesManagerDialog';
import GroupMembersTab from '@/components/groups/GroupMembersTab';
import { validateGroupName, validateGroupPrivacy, PRIVACY_OPTIONS } from '@/lib/groupSettings';
import NewPost from '@/components/NewPost';
import { useHomeFeed } from '@/hooks/useHomeFeed';
import Post from '@/components/Post';

interface GroupDetail {
  id: string;
  name: string;
  description: string | null;
  privacy: string;
  created_at: string;
  created_by: string | null;
  invite_followers: boolean;
  cover_image: string | null;
  rules_enabled: boolean;
}

interface GroupMember {
  user_id: string;
  role: string;
  created_at: string;
  profiles?: {
    username: string;
    display_name: string;
    profile_pic: string | null;
  };
}

// About Tab with inline editing for admins
const AboutTabContent = ({
  group,
  members,
  isAdmin,
  onGroupUpdate,
  formatMemberCount,
}: {
  group: GroupDetail;
  members: GroupMember[];
  isAdmin: boolean;
  onGroupUpdate: (data: Partial<GroupDetail>) => void;
  formatMemberCount: (count: number) => string;
}) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description || '');
  const [privacy, setPrivacy] = useState(group.privacy);
  const [nameError, setNameError] = useState<string | null>(null);
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<GroupRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesManagerOpen, setRulesManagerOpen] = useState(false);
  const [togglingRules, setTogglingRules] = useState(false);
  const { toast } = useToast();

  const rulesEnabled = !!group.rules_enabled;

  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    const { data, error } = await groupsApi.getGroupRules(group.id);
    if (!error) setRules(data || []);
    setRulesLoading(false);
  }, [group.id]);

  useEffect(() => {
    if (rulesEnabled) {
      loadRules();
    } else {
      setRules([]);
    }
  }, [rulesEnabled, loadRules]);

  const startEditing = () => {
    setName(group.name);
    setDescription(group.description || '');
    setPrivacy(group.privacy);
    setNameError(null);
    setPrivacyError(null);
    setEditing(true);
  };

  const handleSave = async () => {
    const nextNameError = validateGroupName(name);
    const nextPrivacyError = validateGroupPrivacy(privacy);
    setNameError(nextNameError);
    setPrivacyError(nextPrivacyError);
    if (nextNameError || nextPrivacyError) return;

    setSaving(true);
    // Settings are validated and authorized by the Gateway; the caller's owner
    // identity is resolved server-side, never sent from here.
    const { data, error } = await groupsApi.updateGroupSettings(group.id, {
      name: name.trim(),
      description: description.trim(),
      privacy,
    });
    setSaving(false);

    if (error) {
      toast({ title: 'Error', description: error.message || 'Failed to update group info.', variant: 'destructive' });
      return;
    }
    onGroupUpdate({
      name: data?.name ?? name.trim(),
      description: data?.description ?? (description.trim() || null),
      privacy: data?.privacy ?? privacy,
    });
    toast({ title: 'Updated', description: 'Group info has been updated.' });
    setEditing(false);
  };

  const handleToggleRules = async (enabled: boolean) => {
    setTogglingRules(true);
    const { data, error } = await groupsApi.setGroupRulesEnabled(group.id, enabled);
    setTogglingRules(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    onGroupUpdate({ rules_enabled: data?.rules_enabled ?? enabled });
    toast({
      title: enabled ? 'Group Rules enabled' : 'Group Rules disabled',
      description: enabled
        ? 'You can now add rules for this group.'
        : 'The group is back to normal/free mode.',
    });
    if (enabled) loadRules();
  };

  const privacyOption = PRIVACY_OPTIONS.find((option) => option.value === group.privacy) ?? PRIVACY_OPTIONS[0];

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">About this group</h3>
          {isAdmin && !editing && (
            <Button variant="ghost" size="sm" onClick={startEditing}>
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
          )}
        </div>

        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">
                Group name <span className="text-destructive">*</span>
              </label>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                maxLength={100}
                aria-invalid={!!nameError}
              />
              {nameError && <p className="text-sm text-destructive mt-1">{nameError}</p>}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="Describe what this group is about..."
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">
                Privacy <span className="text-destructive">*</span>
              </label>
              <Select
                value={privacy}
                onValueChange={(value) => {
                  setPrivacy(value);
                  if (privacyError) setPrivacyError(null);
                }}
              >
                <SelectTrigger aria-invalid={!!privacyError}>
                  <SelectValue placeholder="Select privacy" />
                </SelectTrigger>
                <SelectContent>
                  {PRIVACY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {privacyError && <p className="text-sm text-destructive mt-1">{privacyError}</p>}
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            {group.description ? (
              <p className="text-muted-foreground">{group.description}</p>
            ) : (
              <p className="text-muted-foreground italic">No description provided.</p>
            )}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3 text-sm">
                {group.privacy === 'public' ? (
                  <Globe className="h-5 w-5 text-muted-foreground" />
                ) : group.privacy === 'closed' ? (
                  <EyeOff className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <Lock className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <p className="font-medium">{privacyOption.label}</p>
                  <p className="text-muted-foreground">{privacyOption.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <CalendarDays className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Created</p>
                  <p className="text-muted-foreground">
                    {new Date(group.created_at).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'long', day: 'numeric'
                    })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Users className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{formatMemberCount(members.length)} members</p>
                </div>
              </div>
            </div>

            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-sm">
                  <ClipboardList className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Group Rules</p>
                    <p className="text-muted-foreground">
                      {rulesEnabled
                        ? 'On — members can view the rules below.'
                        : 'Off — the group is in normal/free mode.'}
                    </p>
                  </div>
                </div>
                {isAdmin ? (
                  <Switch
                    checked={rulesEnabled}
                    onCheckedChange={handleToggleRules}
                    disabled={togglingRules}
                    aria-label="Enable Group Rules"
                  />
                ) : (
                  <Badge variant={rulesEnabled ? 'default' : 'secondary'}>
                    {rulesEnabled ? 'ON' : 'OFF'}
                  </Badge>
                )}
              </div>

              {rulesEnabled && (
                <div className="space-y-2 pl-8">
                  {isAdmin && (
                    <Button variant="outline" size="sm" onClick={() => setRulesManagerOpen(true)}>
                      <Pencil className="h-4 w-4 mr-1" /> Manage Group Rules
                    </Button>
                  )}
                  {rulesLoading ? (
                    <p className="text-sm text-muted-foreground">Loading rules...</p>
                  ) : rules.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No rules have been added yet.</p>
                  ) : (
                    <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                      {rules.map((rule) => (
                        <li key={rule.id}>{rule.rule_text}</li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </div>

            <GroupRulesManagerDialog
              open={rulesManagerOpen}
              onOpenChange={setRulesManagerOpen}
              groupId={group.id}
              onRulesChanged={setRules}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
};

const GroupDetailPage = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(true);
  const [isPinned, setIsPinned] = useState(false);
  const [activeTab, setActiveTab] = useState('discussion');
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [showYourContent, setShowYourContent] = useState(false);
  const [notifSettingsOpen, setNotifSettingsOpen] = useState(false);
  const [reportGroupOpen, setReportGroupOpen] = useState(false);
  const { createPost } = useHomeFeed();
  const [groupPosts, setGroupPosts] = useState<any[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);

  const fetchGroupPosts = async () => {
    if (!groupId) return;
    try {
      setPostsLoading(true);
      const { data } = await groupsApi.getGroupPosts(groupId);
      setGroupPosts(data || []);
    } catch (err) {
      console.error('Error fetching group posts:', err);
    } finally {
      setPostsLoading(false);
    }
  };

  const handleGroupPost = async (content: string, media?: File[], taggedUsers?: any[], audience?: any, feeling?: any, scheduledAt?: Date, location?: any) => {
    try {
      const postId = await createPost(content, media, taggedUsers, audience, feeling, scheduledAt, location);
      if (postId && groupId) {
        await groupsApi.createGroupPost(groupId, postId, user!.id);
        fetchGroupPosts();
      }
      return postId;
    } catch (err) {
      console.error('Error creating group post:', err);
      return undefined;
    }
  };

  useEffect(() => {
    if (groupId) {
      fetchGroupDetail();
      fetchGroupPosts();
    }
  }, [groupId, user]);

  const fetchGroupDetail = async () => {
    try {
      setLoading(true);
      const { data: groupData, error: groupError } = await groupsApi.getGroupById(groupId!);

      if (groupError) throw groupError;
      setGroup(groupData);

      const { data: membersData, error: membersError } = await groupsApi.getGroupMembers(groupId!);

      if (membersError) throw membersError;
      setMembers(membersData || []);

      if (user) {
        const membership = membersData?.find(m => m.user_id === user.id);
        setIsMember(!!membership);
        setUserRole(membership?.role || null);

        // A row in `group_follows` indicates the user has explicitly UNFOLLOWED.
        // Without a row, members are treated as following by default.
        const { data: unfollowRow } = await groupsApi.getGroupFollowStatus(groupId!, user.id);
        setIsFollowing(!unfollowRow);

        // Check if this group is pinned by the current user
        const { data: pinRow } = await groupsApi.getGroupPinStatus(groupId!, user.id);
        setIsPinned(!!pinRow);
      }
    } catch (error: any) {
      console.error('Failed to load group:', error);
      toast({ title: 'Error', description: 'Failed to load group', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!user || !groupId) return;
    try {
      const { data, error } = await groupsApi.joinGroupSecure(groupId, user.id);
      if (error || data?.status !== 'ok') throw error || new Error('Failed to join group');
      toast({ title: 'Joined!', description: 'You are now a member of this group.' });
      fetchGroupDetail();
    } catch (error: any) {
      toast({ title: 'Error', description: 'Failed to join group', variant: 'destructive' });
    }
  };

  const handleLeave = async () => {
    if (!user || !groupId) return;
    try {
      const { data, error } = await groupsApi.leaveGroupSecure(groupId, user.id);
      if (error || data?.status !== 'ok') throw error || new Error('Failed to leave group');
      toast({ title: 'Left group', description: 'You have left this group.' });
      fetchGroupDetail();
    } catch (error: any) {
      toast({ title: 'Error', description: 'Failed to leave group', variant: 'destructive' });
    }
  };

  const handleToggleFollow = async () => {
    if (!user || !groupId) return;
    try {
      if (isFollowing) {
        const { error } = await groupsApi.unfollowGroup(groupId, user.id);
        if (error && (error as any).code !== '23505') throw error;
        setIsFollowing(false);
        toast({
          title: 'Unfollowed',
          description: "You won't see this group's posts in your feed. You're still a member.",
        });
      } else {
        const { error } = await groupsApi.followGroup(groupId, user.id);
        if (error) throw error;
        setIsFollowing(true);
        toast({
          title: 'Following',
          description: "You'll see this group's posts in your feed again.",
        });
      }
    } catch (error: any) {
      console.error('[GroupDetail] toggle follow error:', error);
      toast({ title: 'Error', description: 'Failed to update follow state', variant: 'destructive' });
    }
  };

  const handleTogglePin = async () => {
    if (!user || !groupId) return;
    try {
      if (isPinned) {
        const { error } = await groupsApi.unpinGroup(groupId, user.id);
        if (error) throw error;
        setIsPinned(false);
        toast({ title: 'Group unpinned', description: 'This group has been removed from your shortcuts.' });
      } else {
        const { error } = await groupsApi.pinGroup(groupId, user.id);
        if (error && (error as any).code !== '23505') throw error;
        setIsPinned(true);
        toast({ title: 'Group pinned', description: 'This group has been pinned to your shortcuts.' });
      }
    } catch (error: any) {
      console.error('[GroupDetail] toggle pin error:', error);
      toast({ title: 'Error', description: 'Failed to update pin state', variant: 'destructive' });
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !groupId || !user) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: 'Invalid file', description: 'Please upload a JPG, PNG, or WebP image.', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Cover image must be under 5MB.', variant: 'destructive' });
      return;
    }

    try {
      setUploadingCover(true);
      const ext = file.name.split('.').pop();
      const path = `${groupId}/cover.${ext}`;

      const { error: uploadError } = await gateway.storage
        .from('group_covers')
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = gateway.storage
        .from('group_covers')
        .getPublicUrl(path);

      const coverUrl = `${publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await groupsApi.updateGroupCover(groupId, coverUrl);

      if (updateError) throw updateError;

      setGroup(prev => prev ? { ...prev, cover_image: coverUrl } : prev);
      toast({ title: 'Cover updated', description: 'Group cover image has been updated.' });
    } catch (error: any) {
      console.error('Cover upload failed:', error);
      toast({ title: 'Upload failed', description: error.message || 'Failed to upload cover image.', variant: 'destructive' });
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = '';
    }
  };

  const formatMemberCount = (count: number) => {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  if (loading) {
    return (
      <PageContainer size="md">
        <Skeleton className="w-full h-64 rounded-b-xl" />
        <div className="py-4 space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </div>
      </PageContainer>
    );
  }

  if (!group) {
    return (
      <PageContainer size="md">
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">Group not found</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate('/groups')}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Groups
            </Button>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  const isAdmin = userRole === 'admin';

  if (showYourContent) {
    return (
      <GroupYourContent
        groupId={groupId!}
        groupName={group.name}
        onBack={() => setShowYourContent(false)}
      />
    );
  }

  return (
    <PageContainer size="md">
      {/* Cover Photo Area */}
      <div className="relative w-full h-56 md:h-72 rounded-b-xl overflow-hidden group/cover">
        {group.cover_image ? (
          <img
            src={group.cover_image}
            alt={`${group.name} cover`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/30 via-primary/10 to-muted">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjA1KSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-50" />
          </div>
        )}

        {/* Upload Cover Button - visible on hover for admins */}
        {isAdmin && (
          <>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleCoverUpload}
            />
            <Button
              variant="secondary"
              size="sm"
              className="absolute bottom-4 right-4 opacity-0 group-hover/cover:opacity-100 transition-opacity shadow-md"
              onClick={() => coverInputRef.current?.click()}
              disabled={uploadingCover}
            >
              <Camera className="h-4 w-4 mr-2" />
              {uploadingCover ? 'Uploading...' : group.cover_image ? 'Edit Cover Photo' : 'Add Cover Photo'}
            </Button>
          </>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 left-4 bg-background/60 backdrop-blur-sm hover:bg-background/80"
          onClick={() => navigate('/groups')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </div>

      {/* Group Info Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-4 md:px-6 -mt-4"
      >
        <div className="bg-card rounded-xl border p-5 shadow-sm">
          <h1 className="text-2xl md:text-3xl font-bold">{group.name}</h1>

          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
            {group.privacy === 'public' ? (
              <Globe className="h-4 w-4" />
            ) : (
              <Lock className="h-4 w-4" />
            )}
            <span className="capitalize">{group.privacy} group</span>
            <span>·</span>
            <span>{formatMemberCount(members.length)} members</span>
          </div>

          {/* Member Avatars */}
          <div className="flex items-center mt-4">
            <div className="flex -space-x-2">
              {members.slice(0, 10).map((member) => (
                <Avatar key={member.user_id} className="h-8 w-8 border-2 border-card">
                  {member.profiles?.profile_pic ? (
                    <img src={member.profiles.profile_pic} alt="" className="object-cover" />
                  ) : (
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {(member.profiles?.display_name || '?')[0]}
                    </AvatarFallback>
                  )}
                </Avatar>
              ))}
              {members.length > 10 && (
                <Avatar className="h-8 w-8 border-2 border-card">
                  <AvatarFallback className="text-xs bg-muted text-muted-foreground">
                    +{members.length - 10}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            {!isMember ? (
              !user ? (
                <Button onClick={() => navigate('/auth')}>
                  <UserPlus className="h-4 w-4 mr-2" /> Sign in to join
                </Button>
              ) : (
                <Button onClick={handleJoin}>
                  <UserPlus className="h-4 w-4 mr-2" /> Join Group
                </Button>
              )
            ) : (
              <>
                <Button variant="outline" onClick={() => setInviteOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-2" /> Invite
                </Button>
                <Button variant="outline" onClick={() => setShareOpen(true)}>
                  <Share2 className="h-4 w-4 mr-2" /> Share
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary">
                      Joined <ChevronDown className="h-4 w-4 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem className="gap-3 cursor-pointer" onClick={() => setNotifSettingsOpen(true)}>
                      <Bell className="h-4 w-4" />
                      Manage notifications
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-3 cursor-pointer" onClick={handleToggleFollow}>
                      <UserX className="h-4 w-4" />
                      {isFollowing ? 'Unfollow group' : 'Follow group'}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-3 cursor-pointer" onClick={handleLeave}>
                      <LogOut className="h-4 w-4" />
                      Leave group
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
            <Button variant="ghost" size="icon" onClick={() => setSearchOpen(true)}>
              <Search className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem className="gap-3 cursor-pointer" onClick={() => setShowYourContent(true)}>
                  <LayoutList className="h-4 w-4" />
                  Your content
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-3 cursor-pointer" onClick={() => setNotifSettingsOpen(true)}>
                  <Bell className="h-4 w-4" />
                  Manage notifications
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-3 cursor-pointer" onClick={handleTogglePin}>
                  <Pin className={`h-4 w-4 ${isPinned ? 'fill-current' : ''}`} />
                  {isPinned ? 'Unpin group' : 'Pin group'}
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-3 cursor-pointer" onClick={() => setReportGroupOpen(true)}>
                  <Flag className="h-4 w-4" />
                  Report group
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="px-4 md:px-6 mt-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start bg-card border overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <TabsTrigger value="about">About</TabsTrigger>
            <TabsTrigger value="discussion">Discussion</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="media">Media/Files</TabsTrigger>
          </TabsList>

          <TabsContent value="discussion" className="mt-4 space-y-4">
            {isMember && (
              <NewPost onCreatePost={handleGroupPost} />
            )}

            {postsLoading ? (
              <Card><CardContent className="py-8 text-center"><p className="text-muted-foreground">Loading posts...</p></CardContent></Card>
            ) : groupPosts.length > 0 ? (
              groupPosts.map((gp: any) => gp.post && (
                <Post key={gp.id} {...gp.post} onDelete={() => fetchGroupPosts()} />
              ))
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p className="text-muted-foreground">No posts yet. Be the first to post!</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* About Tab */}
          <TabsContent value="about" className="mt-4">
            <AboutTabContent
              group={group}
              members={members}
              isAdmin={userRole === 'admin'}
              onGroupUpdate={(updated) => setGroup(prev => prev ? { ...prev, ...updated } : prev)}
              formatMemberCount={formatMemberCount}
            />
          </TabsContent>

          {/* Members Tab */}
          <TabsContent value="members" className="mt-4">
            {groupId && (
              <GroupMembersTab
                groupId={groupId}
                groupName={group.name}
                groupCreatedBy={group.created_by}
                rulesEnabled={!!group.rules_enabled}
                onChanged={fetchGroupDetail}
              />
            )}
          </TabsContent>

          {/* Media/Files Tab */}
          <TabsContent value="media" className="mt-4">
            {groupId && <GroupMediaFiles groupId={groupId} />}
          </TabsContent>
        </Tabs>
      </div>

      <div className="h-8" />

      <InviteToGroupDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        groupId={groupId!}
        existingMemberIds={members.map(m => m.user_id)}
        onInvitesSent={fetchGroupDetail}
      />

      <ShareGroupDialog
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        groupId={groupId!}
        groupName={group?.name || ''}
      />

      <GroupSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        groupName={group?.name || ''}
      />
      <GroupNotificationSettings
        open={notifSettingsOpen}
        onOpenChange={setNotifSettingsOpen}
      />
      <ReportGroupDialog
        open={reportGroupOpen}
        onOpenChange={setReportGroupOpen}
        groupName={group?.name}
      />
    </PageContainer>
  );
};

export default GroupDetailPage;
