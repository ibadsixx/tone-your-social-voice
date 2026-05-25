import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Search, UserPlus, Loader2, Users, Megaphone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface User {
  id: string;
  username: string;
  display_name: string;
  profile_pic?: string;
}

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectUser: (userId: string) => void;
  currentUserId: string;
}

export const NewConversationDialog: React.FC<NewConversationDialogProps> = ({
  open,
  onOpenChange,
  onSelectUser,
  currentUserId,
}) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [friends, setFriends] = useState<User[]>([]);

  // Fetch friends on open
  useEffect(() => {
    if (open && currentUserId) {
      fetchFriends();
    }
  }, [open, currentUserId]);

  // Search users when query changes
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        searchUsers();
      } else {
        setUsers([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
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

      const friendsList: User[] = (data || []).map((friendship: any) => {
        const friend = friendship.requester_id === currentUserId
          ? friendship.receiver
          : friendship.requester;
        return {
          id: friend.id,
          username: friend.username,
          display_name: friend.display_name,
          profile_pic: friend.profile_pic,
        };
      });

      setFriends(friendsList);
    } catch (error) {
      console.error('Error fetching friends:', error);
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
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroupChat = () => {
    onOpenChange(false);
    navigate('/groups');
  };

  const handleCreateChannel = () => {
    toast({
      title: 'Coming Soon',
      description: 'Channels are not available yet. Stay tuned!',
    });
  };

  const handleSelectUser = (userId: string) => {
    onSelectUser(userId);
    setSearchQuery('');
    setUsers([]);
  };

  const displayUsers = searchQuery.trim().length >= 2 ? users : friends;
  const displayTitle = searchQuery.trim().length >= 2 ? 'Search Results' : 'Suggested Friends';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-xl">New Message</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Create Group / Channel Options */}
          <div className="space-y-1 pb-2 border-b border-border">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-auto py-3 px-3 hover:bg-accent"
              onClick={handleCreateGroupChat}
            >
              <Users className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">Create group chat</span>
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-auto py-3 px-3 hover:bg-accent"
              onClick={handleCreateChannel}
            >
              <Megaphone className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">Create channel</span>
            </Button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search people..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Users List */}
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
                      : 'Add friends to start messaging'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {displayUsers.map((user) => (
                    <Button
                      key={user.id}
                      variant="ghost"
                      className="w-full justify-start h-auto py-3 px-3 hover:bg-accent"
                      onClick={() => handleSelectUser(user.id)}
                    >
                      <Avatar className="h-10 w-10 mr-3">
                        <AvatarImage src={user.profile_pic} alt={user.display_name} />
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {user.display_name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="text-left">
                        <p className="font-medium text-foreground">{user.display_name}</p>
                        <p className="text-sm text-muted-foreground">@{user.username}</p>
                      </div>
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
