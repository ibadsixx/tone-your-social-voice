import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Loader2, UserPlus } from 'lucide-react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';

interface Invitee {
  id: string;
  username: string;
  display_name: string;
  profile_pic: string | null;
  source: 'friend' | 'follower' | 'both';
}

interface InviteToConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId?: string;
  conversationType?: string;
  conversationName?: string;
  currentUserId: string;
  onInvitesSent?: () => void;
}

export const InviteToConversationDialog: React.FC<InviteToConversationDialogProps> = ({
  open,
  onOpenChange,
  conversationId,
  conversationType,
  conversationName,
  currentUserId,
  onInvitesSent,
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);

  const isGroup = conversationType === 'group';
  const isChannel = conversationType === 'channel';

  // Load friends + followers (minus existing participants) when opened
  useEffect(() => {
    if (!open || !conversationId) {
      if (!open) {
        setInvitees([]);
        setSelected(new Set());
        setSearch('');
      }
      return;
    }

    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        // People already in the conversation: exclude them from the invite list
        const { data: members } = await gateway
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', conversationId);
        const existing = (members as { user_id: string }[] | null)?.map(m => m.user_id) || [];
        if (cancelled) return;
        setMemberIds(existing);

        // Accepted friends
        const { data: friends } = await gateway
          .from('friends')
          .select(`
            requester_id,
            receiver_id,
            requester:profiles!friends_requester_id_fkey(id, username, display_name, profile_pic),
            receiver:profiles!friends_receiver_id_fkey(id, username, display_name, profile_pic)
          `)
          .eq('status', 'accepted')
          .or(`requester_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
          .limit(50);
        if (cancelled) return;

        // The current user's followers (people following THIS user)
        const { data: followerRows } = await gateway
          .from('followers')
          .select('follower_id, follower:profiles!followers_follower_id_fkey(id, username, display_name, profile_pic)')
          .eq('following_id', currentUserId)
          .limit(50);
        if (cancelled) return;

        const map = new Map<string, Invitee>();
        const add = (
          p: { id?: string; username?: string; display_name?: string; profile_pic?: string | null } | null | undefined,
          source: 'friend' | 'follower',
        ) => {
          if (!p?.id || p.id === currentUserId || existing.includes(p.id)) return;
          const existingInvitee = map.get(p.id) as Invitee | undefined;
          map.set(p.id, {
            id: p.id,
            username: p.username,
            display_name: p.display_name || p.username,
            profile_pic: p.profile_pic || null,
            source: existingInvitee ? 'both' : (source as 'friend' | 'follower'),
          });
        };

        for (const f of friends || []) {
          add(f.requester_id === currentUserId ? f.receiver : f.requester, 'friend');
        }
        for (const r of followerRows || []) {
          add(r.follower, 'follower');
        }

        if (!cancelled) setInvitees([...map.values()]);
      } catch (err) {
        console.error('Failed to load invite list:', err);
        if (!cancelled) {
          toast({ title: 'Error', description: 'Failed to load friends and followers.', variant: 'destructive' });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [open, conversationId, currentUserId, toast]);

  const filtered = useMemo(() => {
    if (!search.trim()) return invitees;
    const q = search.toLowerCase();
    return invitees.filter(i =>
      i.display_name?.toLowerCase().includes(q) ||
      i.username?.toLowerCase().includes(q)
    );
  }, [invitees, search]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSendInvites = async () => {
    if (!conversationId || selected.size === 0) return;
    setSending(true);
    const ids = Array.from(selected);
    try {
      let failures = 0;
      for (const uid of ids) {
        const { error } = isChannel
          ? await gateway.rpc('add_channel_follower', { p_conversation_id: conversationId, p_new_follower_id: uid })
          : await gateway.rpc('add_group_member', { p_conversation_id: conversationId, p_new_member_id: uid });
        if (error) {
          failures += 1;
          console.error(`Failed to add ${uid}:`, error.message);
        }
      }

      if (failures > 0) {
        toast({
          title: 'Partial invite',
          description: `${ids.length - failures} invited, ${failures} failed.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: isChannel ? 'Added' : 'Invited',
          description: `${ids.length} ${ids.length === 1 ? 'person' : 'people'} ${isChannel ? 'added as followers' : 'added to the group'}.`,
        });
        onInvitesSent?.();
        onOpenChange(false);
      }
    } catch {
      console.error('Failed to send invites');
      toast({ title: 'Error', description: 'Failed to send invites.', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const sourceLabel = (source: string) => {
    if (source === 'both') return 'Friend & follower';
    return source === 'follower' ? 'Follower' : 'Friend';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="text-center text-lg">
            {isChannel ? `Add followers to #${conversationName}` : `Add people to ${conversationName}`}
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="px-4 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Choose friends & followers"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-muted border-none"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-right">
            {selected.size} SELECTED
          </p>
        </div>

        {/* Invite list */}
        <ScrollArea className="h-[320px]">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">
                {invitees.length === 0 ? 'No friends or followers to add' : 'No results found'}
              </p>
            </div>
          ) : (
            <div className="px-4">
              <p className="text-xs font-semibold text-muted-foreground py-2 uppercase tracking-wide">Friends & followers</p>
              {filtered.map(invitee => (
                <label
                  key={invitee.id}
                  className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-muted/60 transition-colors cursor-pointer"
                >
                  <Avatar className="h-9 w-9">
                    {invitee.profile_pic ? (
                      <img src={invitee.profile_pic} alt="" className="object-cover"  loading="lazy" decoding="async" />
                    ) : (
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {(invitee.display_name || '?')[0]}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">
                      {invitee.display_name || invitee.username}
                    </span>
                    <span className="block text-xs text-muted-foreground">@{invitee.username}</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                    {sourceLabel(invitee.source)}
                  </span>
                  <Checkbox
                    checked={selected.has(invitee.id)}
                    onCheckedChange={() => toggleSelect(invitee.id)}
                  />
                </label>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <DialogFooter className="border-t p-4 flex-row justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSendInvites} disabled={selected.size === 0 || sending}>
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Adding...
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4 mr-2" />
                Add
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};