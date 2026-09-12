import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Shield, UserCog, UserPlus, UserMinus } from 'lucide-react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';

interface ChannelMember {
  user_id: string;
  username: string;
  display_name: string;
  profile_pic: string | null;
  role: string;
  joined_at?: string;
}

interface ChannelAdminsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | undefined;
  conversationName?: string;
}

// Owner-only channel admin management (messages.md). Reuses the existing
// backend-enforced RPCs: add_channel_moderator / remove_channel_moderator both
// verify the caller is the channel owner server-side, so the UI never holds the
// authorization authority.
export const ChannelAdminsDialog: React.FC<ChannelAdminsDialogProps> = ({
  open,
  onOpenChange,
  conversationId,
  conversationName,
}) => {
  const { toast } = useToast();
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    try {
      const { data, error } = await gateway.rpc('get_channel_members', {
        p_conversation_id: conversationId,
      });
      if (error) throw error;
      setMembers((data as ChannelMember[]) || []);
    } catch (e: unknown) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'Failed to load channel members',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [conversationId, toast]);

  useEffect(() => {
    if (open && conversationId) load();
  }, [open, conversationId, load]);

  const owner = members.find(m => m.role === 'owner');
  const moderators = members.filter(m => m.role === 'moderator');
  const followers = members.filter(m => m.role === 'follower');

  const promote = async (userId: string, displayName: string) => {
    if (!conversationId) return;
    setBusyUserId(userId);
    try {
      const { error } = await gateway.rpc('add_channel_moderator', {
        p_conversation_id: conversationId,
        p_user_id: userId,
      });
      if (error) throw error;
      toast({ title: 'Admin added', description: `${displayName} is now an admin of #${conversationName || 'channel'}` });
      await load();
    } catch (e: unknown) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed to add admin', variant: 'destructive' });
    } finally {
      setBusyUserId(null);
    }
  };

  const demote = async (userId: string, displayName: string) => {
    if (!conversationId) return;
    setBusyUserId(userId);
    try {
      const { error } = await gateway.rpc('remove_channel_moderator', {
        p_conversation_id: conversationId,
        p_user_id: userId,
      });
      if (error) throw error;
      toast({ description: `${displayName} is no longer an admin of #${conversationName || 'channel'}` });
      await load();
    } catch (e: unknown) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed to remove admin', variant: 'destructive' });
    } finally {
      setBusyUserId(null);
    }
  };

  const MemberRow = ({ member, actionable }: { member: ChannelMember; actionable: boolean }) => (
    <div className="flex items-center gap-3 py-2">
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarImage src={member.profile_pic || ''} />
        <AvatarFallback className="text-xs">
          {member.display_name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{member.display_name}</p>
        <p className="text-xs text-muted-foreground truncate">@{member.username}</p>
      </div>
      {actionable && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1"
          disabled={busyUserId === member.user_id}
          onClick={() => promote(member.user_id, member.display_name)}
        >
          {busyUserId === member.user_id ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UserPlus className="h-3.5 w-3.5" />
          )}
          Make admin
        </Button>
      )}
      {!actionable && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1 text-muted-foreground hover:text-destructive"
          disabled={busyUserId === member.user_id}
          onClick={() => demote(member.user_id, member.display_name)}
        >
          {busyUserId === member.user_id ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UserMinus className="h-3.5 w-3.5" />
          )}
          Remove
        </Button>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5 text-orange-500" />
            Channel admins {conversationName ? `· #${conversationName}` : ''}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-1 pr-3">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 py-1">
                <UserCog className="h-3.5 w-3.5" />
                Owner
              </p>
              {owner && (
                <MemberRow member={owner} actionable={false} />
              )}

              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-3 pb-1">
                <Shield className="h-3.5 w-3.5" />
                Admins
              </p>
              {moderators.length === 0 ? (
                <p className="text-xs text-muted-foreground">No admins yet — promote a follower below.</p>
              ) : (
                moderators.map(m => (
                  <MemberRow key={m.user_id} member={m} actionable={false} />
                ))
              )}

              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 pt-3 pb-1">
                <UserPlus className="h-3.5 w-3.5" />
                Followers
              </p>
              {followers.length === 0 ? (
                <p className="text-xs text-muted-foreground">No followers yet.</p>
              ) : (
                followers.map(m => (
                  <MemberRow key={m.user_id} member={m} actionable={true} />
                ))
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};