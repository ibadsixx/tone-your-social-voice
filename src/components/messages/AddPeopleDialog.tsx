import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Search, UserPlus, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface User {
  id: string;
  username: string;
  display_name: string;
  profile_pic?: string;
}

interface AddPeopleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string;
  onAddPerson: (userId: string) => Promise<void>;
}

export const AddPeopleDialog: React.FC<AddPeopleDialogProps> = ({
  open,
  onOpenChange,
  currentUserId,
  onAddPerson,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [friends, setFriends] = useState<User[]>([]);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    if (open && currentUserId) {
      fetchFriends();
    }
  }, [open, currentUserId]);

  useEffect(() => {
    const delay = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        searchUsers();
      } else {
        setUsers([]);
      }
    }, 300);
    return () => clearTimeout(delay);
  }, [searchQuery]);

  const fetchFriends = async () => {
    try {
      const { data, error } = await supabase
        .from('friends')
        .select(`
          requester_id,
          receiver_id,
          requester:profiles!friends_requester_id_fkey(id, username, display_name, profile_pic),
          receiver:profiles!friends_receiver_id_fkey(id, username, display_name, profile_pic)
        `)
        .eq('status', 'accepted')
        .or(`requester_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
        .limit(20);

      if (error) throw error;

      const friendsList: User[] = (data || []).map((f: any) => {
        const friend = f.requester_id === currentUserId ? f.receiver : f.requester;
        return {
          id: friend.id,
          username: friend.username,
          display_name: friend.display_name,
          profile_pic: friend.profile_pic,
        };
      });

      setFriends(friendsList);
    } catch (err) {
      console.error('Error fetching friends:', err);
    }
  };

  const searchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, profile_pic')
        .neq('id', currentUserId)
        .or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`)
        .limit(10);

      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Error searching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (userId: string) => {
    setAdding(userId);
    try {
      await onAddPerson(userId);
    } finally {
      setAdding(null);
    }
  };

  const displayUsers = searchQuery.trim().length >= 2 ? users : friends;
  const displayTitle = searchQuery.trim().length >= 2 ? 'Search Results' : 'Friends';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-xl">Add people</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search people..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">
              {displayTitle}
            </p>
            <ScrollArea className="h-[300px]">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : displayUsers.length === 0 ? (
                <div className="text-center py-8">
                  <UserPlus className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {searchQuery.trim().length >= 2
                      ? 'No users found'
                      : 'No friends yet'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {displayUsers.map((user) => (
                    <Button
                      key={user.id}
                      variant="ghost"
                      className="w-full justify-start h-auto py-3 px-3 hover:bg-accent"
                      onClick={() => handleSelect(user.id)}
                      disabled={adding === user.id}
                    >
                      <Avatar className="h-10 w-10 mr-3">
                        <AvatarImage src={user.profile_pic} alt={user.display_name} />
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {user.display_name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="text-left flex-1">
                        <p className="font-medium text-foreground">{user.display_name}</p>
                        <p className="text-sm text-muted-foreground">@{user.username}</p>
                      </div>
                      {adding === user.id && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                      )}
                    </Button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
