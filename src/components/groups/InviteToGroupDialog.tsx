import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search } from 'lucide-react';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface Friend {
  id: string;
  username: string;
  display_name: string;
  profile_pic: string | null;
}

interface InviteToGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  existingMemberIds: string[];
  onInvitesSent?: () => void;
}

const InviteToGroupDialog = ({ open, onOpenChange, groupId, existingMemberIds, onInvitesSent }: InviteToGroupDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open && user) fetchFriends();
    if (!open) {
      setSelected(new Set());
      setSearch('');
    }
  }, [open, user]);

  const fetchFriends = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Get accepted friends where user is requester
      const { data: sent } = await gateway
        .from('friends')
        .select('receiver_id')
        .eq('requester_id', user.id)
        .eq('status', 'accepted');

      // Get accepted friends where user is receiver
      const { data: received } = await gateway
        .from('friends')
        .select('requester_id')
        .eq('receiver_id', user.id)
        .eq('status', 'accepted');

      const friendIds = [
        ...(sent?.map(f => f.receiver_id) || []),
        ...(received?.map(f => f.requester_id) || []),
      ].filter(id => !existingMemberIds.includes(id));

      if (friendIds.length === 0) {
        setFriends([]);
        return;
      }

      const { data: profiles } = await gateway
        .from('profiles')
        .select('id, username, display_name, profile_pic')
        .in('id', friendIds);

      setFriends(profiles || []);
    } catch (err) {
      console.error('Failed to fetch friends:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return friends;
    const q = search.toLowerCase();
    return friends.filter(f =>
      f.display_name?.toLowerCase().includes(q) ||
      f.username?.toLowerCase().includes(q)
    );
  }, [friends, search]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSendInvites = async () => {
    if (selected.size === 0) return;
    setSending(true);
    try {
      const inserts = Array.from(selected).map(userId => ({
        group_id: groupId,
        user_id: userId,
        role: 'member' as const,
      }));

      const { error } = await gateway
        .from('group_members')
        .insert(inserts);

      if (error) throw error;

      toast({ title: 'Invites sent', description: `${selected.size} friend(s) added to the group.` });
      onInvitesSent?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Failed to send invites:', err);
      toast({ title: 'Error', description: 'Failed to send invites.', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="text-center text-lg">Invite friends to this group</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="px-4 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Choose friends"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-muted border-none"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-right">
            {selected.size} FRIEND{selected.size !== 1 ? 'S' : ''} SELECTED
          </p>
        </div>

        {/* Friends list */}
        <ScrollArea className="h-[320px]">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">Loading friends...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">
                {friends.length === 0 ? 'No friends to invite' : 'No results found'}
              </p>
            </div>
          ) : (
            <div className="px-4">
              <p className="text-xs font-semibold text-muted-foreground py-2 uppercase tracking-wide">Suggested</p>
              {filtered.map(friend => (
                <label
                  key={friend.id}
                  className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-muted/60 transition-colors cursor-pointer"
                >
                  <Avatar className="h-9 w-9">
                    {friend.profile_pic ? (
                      <img src={friend.profile_pic} alt="" className="object-cover" />
                    ) : (
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {(friend.display_name || '?')[0]}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <span className="flex-1 text-sm font-medium truncate">
                    {friend.display_name || friend.username}
                  </span>
                  <Checkbox
                    checked={selected.has(friend.id)}
                    onCheckedChange={() => toggleSelect(friend.id)}
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
            {sending ? 'Sending...' : 'Send invites'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InviteToGroupDialog;
