import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Search, UserPlus, Loader2, X, ShieldCheck, Shield } from 'lucide-react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface User {
  id: string;
  username: string;
  display_name: string;
  profile_pic?: string;
}

interface CreateGroupChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGroupCreated: (conversationId: string) => void;
  currentUserId: string;
}

export const CreateGroupChatDialog: React.FC<CreateGroupChatDialogProps> = ({
  open,
  onOpenChange,
  onGroupCreated,
  currentUserId,
}) => {
  const { toast } = useToast();
  const [groupName, setGroupName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [canAddMembers, setCanAddMembers] = useState<'anyone' | 'admins_only'>('admins_only');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const selectedIdsSet = useMemo(() => new Set(selectedUsers.map(u => u.id)), [selectedUsers]);

  useEffect(() => {
    if (open) {
      setGroupName('');
      setSearchQuery('');
      setUsers([]);
      setSelectedUsers([]);
      setAdminIds(new Set());
      setCanAddMembers('admins_only');
    }
  }, [open]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        searchUsers();
      } else {
        setUsers([]);
      }
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, selectedUsers]);

  const searchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await gateway
        .from('profiles')
        .select('id, username, display_name, profile_pic')
        .neq('id', currentUserId)
        .or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`)
        .limit(10);
      if (error) throw error;
      setUsers((data || []).filter(u => !selectedIdsSet.has(u.id)));
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleUser = (user: User) => {
    setSelectedUsers(prev => {
      const exists = prev.find(u => u.id === user.id);
      if (exists) return prev.filter(u => u.id !== user.id);
      return [...prev, user];
    });
    setUsers(prev => prev.filter(u => u.id !== user.id));
  };

  const removeSelected = (userId: string) => {
    setSelectedUsers(prev => prev.filter(u => u.id !== userId));
    setAdminIds(prev => { const next = new Set(prev); next.delete(userId); return next; });
  };

  const toggleAdmin = (userId: string) => {
    setAdminIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleCreate = async () => {
    const trimmedName = groupName.trim();
    if (!trimmedName) {
      toast({ title: 'Error', description: 'Please enter a group name', variant: 'destructive' });
      return;
    }
    if (selectedUsers.length < 2) {
      toast({ title: 'Error', description: 'Please select at least 2 people', variant: 'destructive' });
      return;
    }

    setCreating(true);
    try {
      const adminList = [...adminIds];
      const { data: created, error: convError } = await gateway
        .from('conversations')
        .insert({
          type: 'group',
          name: trimmedName,
          created_by: currentUserId,
          can_add_members: canAddMembers,
        })
        .select('id')
        .single();
      if (convError || !created) throw convError || new Error('Failed to create group');

      const participantRows = [
        { conversation_id: created.id, user_id: currentUserId, role: 'admin' },
        ...selectedUsers.map(u => ({
          conversation_id: created.id,
          user_id: u.id,
          role: adminList.includes(u.id) ? 'admin' : 'member',
        })),
      ];

      const { error: partError } = await gateway
        .from('conversation_participants')
        .insert(participantRows);
      if (partError) throw partError;

      toast({ title: 'Group created', description: `"${trimmedName}" is ready` });
      onOpenChange(false);
      onGroupCreated(created.id);
    } catch (error) {
      console.error('Error creating group:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create group',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-xl">Create Group Chat</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Group Name */}
          <Input
            placeholder="Group name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />

          {/* Who can add people */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Who can add people</Label>
            <RadioGroup
              value={canAddMembers}
              onValueChange={(v) => setCanAddMembers(v as 'anyone' | 'admins_only')}
              className="flex gap-3"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="anyone" id="anyone" />
                <Label htmlFor="anyone" className="text-sm cursor-pointer">Anyone</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="admins_only" id="admins_only" />
                <Label htmlFor="admins_only" className="text-sm cursor-pointer">Admins only</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Selected Users */}
          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedUsers.map((user) => (
                <Badge
                  key={user.id}
                  variant="secondary"
                  className="pl-1 pr-1.5 py-1 gap-1"
                >
                  <Avatar className="h-4 w-4">
                    <AvatarImage src={user.profile_pic} />
                    <AvatarFallback className="text-[8px]">
                      {user.display_name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs max-w-[100px] truncate">{user.display_name}</span>
                  <button
                    onClick={() => toggleAdmin(user.id)}
                    className={cn(
                      "ml-0.5 hover:text-foreground transition-colors",
                      adminIds.has(user.id) ? "text-primary" : "text-muted-foreground"
                    )}
                    title={adminIds.has(user.id) ? "Remove admin" : "Make admin"}
                  >
                    <ShieldCheck className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => removeSelected(user.id)}
                    className="ml-0.5 hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Add people..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* User Results */}
          <ScrollArea className="h-[200px]">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : users.length === 0 && searchQuery.trim().length >= 2 ? (
              <div className="text-center py-8">
                <UserPlus className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No users found</p>
              </div>
            ) : users.length === 0 && searchQuery.trim().length < 2 ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">Search for people to add</p>
              </div>
            ) : (
              <div className="space-y-1">
                {users.map((user) => (
                  <Button
                    key={user.id}
                    variant="ghost"
                    className="w-full justify-start h-auto py-3 px-3 hover:bg-accent"
                    onClick={() => toggleUser(user)}
                  >
                    <Avatar className="h-10 w-10 mr-3">
                      <AvatarImage src={user.profile_pic} alt={user.display_name} />
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {user.display_name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left">
                      <p className="font-medium text-foreground">{user.display_name}</p>
                      <p className="text-sm text-muted-foreground">@{user.username}</p>
                    </div>
                    {adminIds.has(user.id) && (
                      <ShieldCheck className="h-4 w-4 text-primary ml-2" />
                    )}
                  </Button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
