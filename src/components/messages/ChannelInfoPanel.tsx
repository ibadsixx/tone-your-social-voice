import React, { useState, useEffect, useMemo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  X, Hash, Users, Bell, BellOff, Search, Share2, Flag, Pin, Image,
  Settings, Pencil, ShieldCheck, UserCog, BarChart3, MessageSquare,
  LogOut, Loader2, ChevronUp, ChevronDown, Megaphone, MoreVertical,
  UserPlus, UserMinus, UserX, Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { gateway } from '@/lib/gateway';
import { removeChannelMember } from '@/api/conversations';
import { deriveChannelModerators, type ChannelMember } from '@/lib/channelMembers';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ChannelAdminsDialog } from './ChannelAdminsDialog';
import { SharedMediaModal } from './SharedMediaModal';
import { ReportMessageModal } from './ReportMessageModal';

export interface ChannelStats {
  follower_count: number;
  owner_name: string;
  owner_id?: string | null;
  moderator_count: number;
}

const ROLE_RANK: Record<string, number> = { owner: 0, moderator: 1, follower: 2 };

interface ChannelInfoPanelProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId?: string;
  conversationName?: string;
  conversationDescription?: string | null;
  groupImage?: string | null;
  isOwner: boolean;
  currentUserId: string;
  channelRole: string | null;
  channelStats: ChannelStats | null;
  channelOwnerId: string | null;
  pinnedMessageIds?: string[];
  onScrollToMessage?: (messageId: string) => void;
  isMuted: boolean;
  onToggleMute: () => void | Promise<void>;
  onLeaveChannel: () => void | Promise<void>;
  onChannelNameChange: (name: string) => void;
  onReportChannel: (reportedUserId: string, reason: string, details?: string) => void | Promise<void>;
  onChannelStatsChange?: (stats: ChannelStats) => void;
  onChannelDeleted?: () => void;
}

type ExpandableSection = 'channel' | 'control' | null;

export const ChannelInfoPanel: React.FC<ChannelInfoPanelProps> = ({
  isOpen,
  onClose,
  conversationId,
  conversationName,
  conversationDescription,
  groupImage,
  isOwner,
  currentUserId,
  channelRole,
  channelStats,
  channelOwnerId,
  pinnedMessageIds = [],
  onScrollToMessage,
  isMuted,
  onToggleMute,
  onLeaveChannel,
  onChannelNameChange,
  onReportChannel,
  onChannelStatsChange,
  onChannelDeleted,
}) => {
  const { toast } = useToast();
  const [expandedSection, setExpandedSection] = useState<ExpandableSection>(null);
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [showAdmins, setShowAdmins] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<{ user_id: string; display_name: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Only followers can leave. The owner (even with a stale follower row) and
  // moderators never see the Leave action, matching the server-side RPCs.
  const isFollower = channelRole === 'follower' && !isOwner;

  // Channel Control is visible to the owner and moderators only (messages.md).
  // The contents are permission-aware: owner-only actions (manage moderators,
  // permissions, delete channel) are hidden from moderators.
  const isModerator = channelRole === 'moderator' && !isOwner;
  const canAccessChannelControl = isOwner || isModerator;

  // Actual moderators come from the real membership rows returned by
  // get_channel_members (role='moderator'), never from a hardcoded list. The
  // Members dialog and the Channel Settings dialog share this one fetch, so the
  // Moderators section has names/avatars even before the Members list is opened.
  const moderators = useMemo(() => deriveChannelModerators(members), [members]);
  const moderatorCount = members.length > 0
    ? moderators.length
    : (channelStats?.moderator_count ?? 0);
  const shouldLoadMembers = showMembers || showSettings;

  const toggleSection = (section: ExpandableSection) => {
    setExpandedSection(prev => (prev === section ? null : section));
  };

  useEffect(() => {
    if (showEdit) {
      setEditName(conversationName || '');
      setEditDescription(conversationDescription || '');
    }
  }, [showEdit, conversationName, conversationDescription]);

  // Load channel members when the Members or Channel settings dialog opens. Any
  // participant may read the list (get_channel_members); the owner and moderators
  // get the management menu (moderators: remove followers only). The same rows
  // feed the Channel settings → Moderators section (role='moderator').
  useEffect(() => {
    if (!shouldLoadMembers || !conversationId) return;
    let active = true;
    setMembersLoading(true);
    gateway.rpc('get_channel_members', { p_conversation_id: conversationId })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) throw error;
        setMembers((data as ChannelMember[]) || []);
      })
      .catch((e: unknown) => {
        if (active) {
          setMembers([]);
          const message =
            e && typeof e === 'object' && 'message' in e && typeof (e as { message?: unknown }).message === 'string'
              ? (e as { message: string }).message
              : 'Failed to load channel members';
          toast({ title: 'Error', description: message, variant: 'destructive' });
        }
      })
      .finally(() => { if (active) setMembersLoading(false); });
    return () => { active = false; };
  }, [shouldLoadMembers, conversationId, toast]);

  const handleSearch = () => {
    toast({
      title: 'Search in channel',
      description: 'Searching inside channels is not available yet.'
    });
  };

  const handleShare = async () => {
    if (!conversationId) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/messages/${conversationId}`);
      toast({
        title: 'Link copied',
        description: `Share link for #${conversationName || 'channel'} copied to clipboard`
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Could not copy the channel link',
        variant: 'destructive'
      });
    }
  };

  const handlePinned = () => {
    if (pinnedMessageIds.length > 0 && onScrollToMessage) {
      onScrollToMessage(pinnedMessageIds[0]);
      onClose();
    }
  };

  const handleSaveEdit = async () => {
    if (!conversationId) return;
    const name = editName.trim();
    if (!name) {
      toast({ title: 'Error', description: 'Channel name cannot be empty', variant: 'destructive' });
      return;
    }
    setSavingEdit(true);
    try {
      const { error } = await gateway
        .from('conversations')
        .update({ name, description: editDescription.trim() || null })
        .eq('id', conversationId);
      if (error) throw error;
      onChannelNameChange(name);
      setShowEdit(false);
      toast({ title: 'Channel updated', description: `#${name} updated` });
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Failed to update the channel',
        variant: 'destructive'
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleLeave = async () => {
    setLeaving(true);
    try {
      await onLeaveChannel();
    } finally {
      setLeaving(false);
      setShowLeaveConfirm(false);
    }
  };

  // Channel member management (messages.md): promoting/demoting moderators is
  // owner-only, while removal is owner-or-moderator (moderators may remove
  // followers only). Reuses the backend-enforced RPCs and the gateway-owned
  // DELETE member endpoint — the UI only decides whether to surface actions.
  const pushChannelStats = (stats: ChannelStats) => {
    onChannelStatsChange?.(stats);
  };

  const handlePromoteMember = async (userId: string, displayName: string) => {
    if (!conversationId) return;
    setBusyUserId(userId);
    try {
      const { error } = await gateway.rpc('add_channel_moderator', {
        p_conversation_id: conversationId,
        p_moderator_id: userId,
      });
      if (error) throw error;
      setMembers(prev => prev.map(m =>
        m.user_id === userId ? { ...m, role: 'moderator' } : m
      ));
      if (channelStats) {
        pushChannelStats({
          ...channelStats,
          follower_count: Math.max(0, channelStats.follower_count - 1),
          moderator_count: channelStats.moderator_count + 1,
        });
      }
      toast({ title: 'Moderator added', description: `${displayName} is now a moderator of #${conversationName || 'channel'}` });
    } catch (e: unknown) {
      const msg = (e && typeof e === 'object' && typeof (e as Record<string, unknown>).message === 'string')
        ? String((e as Record<string, unknown>).message)
        : 'Failed to add moderator';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setBusyUserId(null);
    }
  };

  const handleDemoteMember = async (userId: string, displayName: string) => {
    if (!conversationId) return;
    setBusyUserId(userId);
    try {
      const { error } = await gateway.rpc('remove_channel_moderator', {
        p_conversation_id: conversationId,
        p_moderator_id: userId,
      });
      if (error) throw error;
      setMembers(prev => prev.map(m =>
        m.user_id === userId ? { ...m, role: 'follower' } : m
      ));
      if (channelStats) {
        pushChannelStats({
          ...channelStats,
          follower_count: channelStats.follower_count + 1,
          moderator_count: Math.max(0, channelStats.moderator_count - 1),
        });
      }
      toast({ description: `${displayName} is no longer a moderator of #${conversationName || 'channel'}` });
    } catch (e: unknown) {
      const msg = (e && typeof e === 'object' && typeof (e as Record<string, unknown>).message === 'string')
        ? String((e as Record<string, unknown>).message)
        : 'Failed to remove moderator';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setBusyUserId(null);
    }
  };

  const handleRemoveMember = async () => {
    if (!conversationId || !memberToRemove) return;
    setRemoving(true);
    try {
      const { error } = await removeChannelMember(conversationId, memberToRemove.user_id);
      if (error) throw error;
      const removed = members.find(m => m.user_id === memberToRemove.user_id);
      setMembers(prev => prev.filter(m => m.user_id !== memberToRemove.user_id));
      if (channelStats && removed) {
        const updated = removed.role === 'moderator'
          ? { ...channelStats, moderator_count: Math.max(0, channelStats.moderator_count - 1) }
          : { ...channelStats, follower_count: Math.max(0, channelStats.follower_count - 1) };
        pushChannelStats(updated);
      }
      toast({ title: 'Member removed', description: `${memberToRemove.display_name} was removed from #${conversationName || 'channel'}` });
      setMemberToRemove(null);
    } catch (e: unknown) {
      const msg = (e && typeof e === 'object' && typeof (e as Record<string, unknown>).message === 'string')
        ? String((e as Record<string, unknown>).message)
        : 'Failed to remove member';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setRemoving(false);
    }
  };

  const handleDeleteChannel = async () => {
    if (!conversationId) return;
    setDeleting(true);
    try {
      // Owner-only: the gateway re-validates ownership before deleting.
      const { error } = await gateway.rpc('delete_channel', { p_conversation_id: conversationId });
      if (error) throw error;
      toast({ title: 'Channel deleted', description: `#${conversationName || 'channel'} has been deleted` });
      setShowDeleteConfirm(false);
      onChannelDeleted?.();
    } catch (e: unknown) {
      const msg = (e && typeof e === 'object' && typeof (e as Record<string, unknown>).message === 'string')
        ? String((e as Record<string, unknown>).message)
        : 'Failed to delete channel';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const handleReport = async (reason: string, details?: string) => {
    const reportedUserId = channelOwnerId ?? channelStats?.owner_id ?? null;
    if (reportedUserId) {
      await onReportChannel(reportedUserId, reason || 'inappropriate', details || '');
    }
    return true;
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={cn(
          "fixed right-0 top-0 h-full w-80 bg-background border-l border-border z-50 shadow-lg transition-transform duration-300 ease-in-out",
          "lg:relative lg:z-auto lg:shadow-none",
          isOpen ? "translate-x-0" : "translate-x-full lg:hidden"
        )}
      >
        <ScrollArea className="h-full">
          {/* Close button (mobile) */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="absolute top-3 right-3 h-8 w-8 p-0 lg:hidden z-10"
          >
            <X className="h-4 w-4" />
          </Button>

          <div className="p-6 pt-12 lg:pt-6">
            {/* Channel Profile */}
            <div className="flex flex-col items-center text-center mb-6">
              <Avatar className="w-20 h-20 mb-3">
                {groupImage ? (
                  <AvatarImage src={groupImage} alt={conversationName || 'Channel'} />
                ) : null}
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                  <Hash className="h-10 w-10" />
                </AvatarFallback>
              </Avatar>
              <h3 className="font-semibold text-lg text-foreground flex items-center gap-1.5">
                <Hash className="h-5 w-5 text-primary" />
                {conversationName || 'Channel'}
              </h3>
              {conversationDescription && (
                <p className="text-sm text-muted-foreground mt-1">{conversationDescription}</p>
              )}
              {/* Statistics are owner/moderator-only (messages.md): followers
                  must not see counts, and the gateway denies them the stats. */}
              {channelStats && (
                <p className="text-sm text-muted-foreground flex items-center justify-center gap-1.5 mt-2">
                  <Users className="h-4 w-4" />
                  <span>{channelStats.follower_count} followers</span>
                  <span>·</span>
                  <span>{moderatorCount} moderators</span>
                </p>
              )}
              {channelStats?.owner_name && (
                <p className="text-xs text-muted-foreground mt-1">
                  Channel owner: {channelStats.owner_name}
                </p>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex justify-center gap-6 mb-6 pb-6 border-b border-border">
              <button
                onClick={onToggleMute}
                disabled={!conversationId}
                className="flex flex-col items-center gap-1.5 text-foreground hover:text-primary transition-colors disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
                  {isMuted ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
                </div>
                <span className="text-xs">{isMuted ? 'Unmute' : 'Mute'}</span>
              </button>

              <button
                onClick={handleSearch}
                className="flex flex-col items-center gap-1.5 text-foreground hover:text-primary transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
                  <Search className="h-5 w-5" />
                </div>
                <span className="text-xs">Search</span>
              </button>

              <button
                onClick={handleShare}
                className="flex flex-col items-center gap-1.5 text-foreground hover:text-primary transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
                  <Share2 className="h-5 w-5" />
                </div>
                <span className="text-xs">Share</span>
              </button>

              <button
                onClick={() => setShowReport(true)}
                className="flex flex-col items-center gap-1.5 text-foreground hover:text-red-500 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
                  <Flag className="h-5 w-5" />
                </div>
                <span className="text-xs">Report</span>
              </button>
            </div>

            {/* Channel actions */}
            <div className="space-y-1 mb-6">
              <button
                onClick={() => toggleSection('channel')}
                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors"
              >
                <span className="font-medium text-foreground">Channel</span>
                {expandedSection === 'channel' ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </button>
              {expandedSection === 'channel' && (
                <div className="px-3 pb-3 space-y-2">
                  <button
                    onClick={handlePinned}
                    disabled={pinnedMessageIds.length === 0}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-foreground text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Pin className="h-5 w-5 text-muted-foreground" />
                    <div className="flex flex-col items-start">
                      <span>See pinned posts</span>
                      <span className="text-xs text-muted-foreground">
                        {pinnedMessageIds.length === 0 ? 'No pinned posts' : `${pinnedMessageIds.length} pinned`}
                      </span>
                    </div>
                  </button>

                  <button
                    onClick={() => setShowMediaModal(true)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-foreground text-sm"
                  >
                    <Image className="h-5 w-5 text-muted-foreground" />
                    <span>Media & files</span>
                  </button>

                  <button
                    onClick={onToggleMute}
                    disabled={!conversationId}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 text-foreground text-sm disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <Megaphone className="h-5 w-5 text-muted-foreground" />
                      <span>Notification settings</span>
                    </div>
                    <span className="text-muted-foreground text-xs">{isMuted ? 'Muted' : 'On'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Leave channel (follower only) */}
            {isFollower && (
              <button
                onClick={() => setShowLeaveConfirm(true)}
                disabled={leaving}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors disabled:opacity-50"
              >
                {leaving ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <LogOut className="h-5 w-5" />
                )}
                <span className="text-sm font-medium">Leave channel</span>
              </button>
            )}

            {/* Channel control — visible to owner AND moderators (messages.md).
                Owner-only actions (manage moderators, permissions, delete
                channel) are hidden from moderators; the gateway re-checks. */}
            {canAccessChannelControl && (
              <div className="space-y-1">
                <button
                  onClick={() => toggleSection('control')}
                  className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors"
                >
                  <span className="font-medium text-foreground">Channel control</span>
                  {expandedSection === 'control' ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </button>
                {expandedSection === 'control' && (
                  <div className="px-3 pb-3 space-y-2">
                    {isOwner && (
                      <button
                        onClick={() => setShowEdit(true)}
                        className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-foreground text-sm"
                      >
                        <Pencil className="h-5 w-5 text-muted-foreground" />
                        <span>Edit channel</span>
                      </button>
                    )}

                    <button
                      onClick={() => setShowMembers(true)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-foreground text-sm"
                    >
                      <Users className="h-5 w-5 text-muted-foreground" />
                      <span>Members</span>
                    </button>

                    {isOwner && (
                      <>
                        <button
                          onClick={() => setShowAdmins(true)}
                          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-foreground text-sm"
                        >
                          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                          <span>Manage moderators & admins</span>
                        </button>

                        <button
                          onClick={() => setShowSettings(true)}
                          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-foreground text-sm"
                        >
                          <UserCog className="h-5 w-5 text-muted-foreground" />
                          <span>Manage permissions</span>
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => setShowComments(true)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-foreground text-sm"
                    >
                      <MessageSquare className="h-5 w-5 text-muted-foreground" />
                      <span>Manage comments</span>
                    </button>

                    <button
                      onClick={() => setShowSettings(true)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-foreground text-sm"
                    >
                      <Settings className="h-5 w-5 text-muted-foreground" />
                      <span>Channel settings</span>
                    </button>

                    <button
                      onClick={() => setShowStats(true)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-foreground text-sm"
                    >
                      <BarChart3 className="h-5 w-5 text-muted-foreground" />
                      <span>Channel statistics</span>
                    </button>

                    {isOwner && (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-destructive text-sm"
                      >
                        <Trash2 className="h-5 w-5" />
                        <span>Delete channel</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Media & Files */}
      <SharedMediaModal
        open={showMediaModal}
        onOpenChange={setShowMediaModal}
        conversationId={conversationId}
      />

      {/* Manage moderators & admins (owner only, backed by add/remove_channel_moderator RPCs) */}
      <ChannelAdminsDialog
        open={showAdmins}
        onOpenChange={setShowAdmins}
        conversationId={conversationId}
        conversationName={conversationName}
      />

      {/* Report channel */}
      <ReportMessageModal
        open={showReport}
        onOpenChange={setShowReport}
        onReport={handleReport}
        userName={conversationName || 'this channel'}
      />

      {/* Leave channel confirmation */}
      <AlertDialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave channel?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll stop following #{conversationName || 'channel'} and can rejoin it again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLeave}
              disabled={leaving}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {leaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit channel (owner only) */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit channel</DialogTitle>
            <DialogDescription>
              Update the channel name and description. Followers will see these changes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="channel-name">Channel name</Label>
              <Input
                id="channel-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Channel name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="channel-description">Description</Label>
              <Input
                id="channel-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="What is this channel about?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)} disabled={savingEdit}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Channel settings. Opened by "Channel settings" (owner & moderators,
          read-only view of permissions/moderators) and "Manage permissions"
          (owner only). Moderators cannot change channel permissions here. */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Channel settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between p-4 rounded-lg border border-border">
              <div className="pr-4">
                <Label className="text-sm font-medium">Notifications</Label>
                <p className="text-xs text-muted-foreground">Mute alerts for new activity in this channel</p>
              </div>
              <Switch checked={!isMuted} onCheckedChange={() => onToggleMute()} />
            </div>

            <div className="p-4 rounded-lg border border-border space-y-3">
              <Label className="text-sm font-medium">Permissions</Label>
              <div className="space-y-3 text-xs text-muted-foreground">
                <div>
                  <p className="text-xs font-semibold text-foreground">Owner</p>
                  <p>
                    Post, edit posts, delete posts, manage comments, pin/unpin posts, invite followers,
                    ban/restrict followers, view statistics, manage moderators, delete channel, and all
                    other owner controls.
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Moderator</p>
                  <p>
                    Post, edit channel posts, manage comments, pin/unpin posts, invite followers,
                    ban/restrict followers, view statistics.
                  </p>
                  <p className="mt-1">
                    Cannot add, remove or modify moderators, modify moderator permissions, transfer
                    ownership, change/remove/ban the owner, modify owner permissions, or delete the channel.
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Follower</p>
                  <p>Read posts and react. No administrative permissions.</p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-lg border border-border space-y-2">
              <Label className="text-sm font-medium">Moderators</Label>
              {membersLoading ? (
                <p className="text-xs text-muted-foreground">Loading moderators…</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {moderators.length} {moderators.length === 1 ? 'moderator' : 'moderators'} currently help manage this channel.
                </p>
              )}
              {!membersLoading && moderators.length > 0 && (
                <ul className="space-y-2 pt-1">
                  {moderators.map((moderator) => {
                    const name = moderator.display_name || moderator.username || 'Unknown';
                    return (
                      <li key={moderator.user_id || moderator.id} className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 shrink-0">
                          {moderator.profile_pic ? (
                            <AvatarImage src={moderator.profile_pic} alt={name} />
                          ) : null}
                          <AvatarFallback className="text-xs">
                            {name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{name}</p>
                          {moderator.username && (
                            <p className="text-xs text-muted-foreground truncate">@{moderator.username}</p>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs">Moderator</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettings(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage comments (owner & moderators) */}
      <Dialog open={showComments} onOpenChange={setShowComments}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage comments</DialogTitle>
            <DialogDescription>
              Comments on channel posts appear as replies underneath each post. Comment moderation
              controls are not available for channels yet.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowComments(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Channel statistics (owner & moderators) */}
      <Dialog open={showStats} onOpenChange={setShowStats}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Channel statistics</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between p-4 rounded-lg border border-border">
              <Label className="text-sm font-medium">Owner</Label>
              <span className="text-sm text-foreground">{channelStats?.owner_name || '—'}</span>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg border border-border">
              <Label className="text-sm font-medium">Followers</Label>
              <span className="text-sm text-foreground">{channelStats?.follower_count ?? 0}</span>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg border border-border">
              <Label className="text-sm font-medium">Moderators</Label>
              <span className="text-sm text-foreground">{moderatorCount}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStats(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Channel members (owner & moderators; owner manages all, moderators
          may remove followers only) */}
      <Dialog open={showMembers} onOpenChange={setShowMembers}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Channel members {conversationName ? `· #${conversationName}` : ''}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {membersLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : members.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No members yet.</p>
            ) : (
              <div className="space-y-1 pr-3">
                {[...members]
                  .sort((a, b) => (ROLE_RANK[a.role] ?? 3) - (ROLE_RANK[b.role] ?? 3))
                  .map(m => {
                    const isMemberOwner = m.user_id === channelOwnerId || m.role === 'owner';
                    const isSelf = m.user_id === currentUserId;
                    // Owner can act on anyone except the owner/self; moderators
                    // may only remove followers (messages.md).
                    const showMenu = (isOwner || (isModerator && m.role === 'follower')) && !isMemberOwner && !isSelf;
                    const name = m.display_name || m.username || 'Unknown';
                    return (
                      <div key={m.user_id || m.id} className="flex items-center gap-3 py-2">
                        <Avatar className="h-9 w-9 shrink-0">
                          {m.profile_pic ? <AvatarImage src={m.profile_pic} /> : null}
                          <AvatarFallback className="text-xs">
                            {name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{name}</p>
                          <p className="text-xs text-muted-foreground truncate">@{m.username || 'unknown'}</p>
                        </div>
                        <Badge variant="outline" className="capitalize text-xs">{m.role}</Badge>
                        {showMenu && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 shrink-0"
                                aria-label={`Actions for ${name}`}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              {isOwner && m.role === 'follower' && (
                                <DropdownMenuItem
                                  disabled={busyUserId === m.user_id}
                                  onClick={() => handlePromoteMember(m.user_id, name)}
                                >
                                  {busyUserId === m.user_id ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <UserPlus className="h-4 w-4 mr-2 text-muted-foreground" />
                                  )}
                                  Make moderator
                                </DropdownMenuItem>
                              )}
                              {isOwner && m.role === 'moderator' && (
                                <DropdownMenuItem
                                  disabled={busyUserId === m.user_id}
                                  onClick={() => handleDemoteMember(m.user_id, name)}
                                >
                                  {busyUserId === m.user_id ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <UserMinus className="h-4 w-4 mr-2 text-muted-foreground" />
                                  )}
                                  Remove moderator
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                disabled={removing && memberToRemove?.user_id === m.user_id}
                                onClick={() => setMemberToRemove({ user_id: m.user_id, display_name: name })}
                                className="text-destructive focus:text-destructive"
                              >
                                <UserX className="h-4 w-4 mr-2 text-destructive" />
                                Remove from channel
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Remove member confirmation (messages.md): removal is destructive and
          permanent, so it always requires an explicit confirm. */}
      <AlertDialog open={!!memberToRemove} onOpenChange={(open) => { if (!open && !removing) setMemberToRemove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {memberToRemove?.display_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This member will be removed from #{conversationName || 'channel'}. Their
              existing messages and conversation history remain unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleRemoveMember(); }}
              disabled={removing}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {removing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserX className="h-4 w-4 mr-2" />}
              Remove from channel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Delete channel confirmation (owner only, messages.md). Deleting a
          channel cascades to its posts/pins/members server-side. */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={(open) => { if (!open && !deleting) setShowDeleteConfirm(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete #{conversationName || 'channel'}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the channel, its posts, pins and memberships.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteChannel(); }}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete channel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};