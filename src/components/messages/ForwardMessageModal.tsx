import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Forward, Check, Loader2 } from 'lucide-react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { Message } from './MessageBubble';

interface ForwardMessageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: Message | null;
  currentUserId: string;
}

type Friend = {
  id: string;
  username: string;
  display_name: string;
  profile_pic?: string;
};

export const ForwardMessageModal: React.FC<ForwardMessageModalProps> = ({
  open,
  onOpenChange,
  message,
  currentUserId,
}) => {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [filteredFriends, setFilteredFriends] = useState<Friend[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  // Fetch friends list
  useEffect(() => {
    if (!open || !currentUserId) return;

    const fetchFriends = async () => {
      setLoading(true);
      try {
        // Get accepted friends
        const { data: friendships, error } = await gateway
          .from('friends')
          .select(`
            requester_id,
            receiver_id
          `)
          .or(`requester_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
          .eq('status', 'accepted');

        if (error) throw error;

        // Get friend IDs
        const friendIds = friendships?.map((f) =>
          f.requester_id === currentUserId ? f.receiver_id : f.requester_id
        ) || [];

        if (friendIds.length === 0) {
          setFriends([]);
          setFilteredFriends([]);
          setLoading(false);
          return;
        }

        // Fetch friend profiles
        const { data: profiles, error: profilesError } = await gateway
          .from('profiles')
          .select('id, username, display_name, profile_pic')
          .in('id', friendIds);

        if (profilesError) throw profilesError;

        const friendList: Friend[] = profiles?.map((p) => ({
          id: p.id,
          username: p.username || '',
          display_name: p.display_name || p.username || 'Unknown',
          profile_pic: p.profile_pic || undefined,
        })) || [];

        setFriends(friendList);
        setFilteredFriends(friendList);
      } catch (error) {
        console.error('Error fetching friends:', error);
        toast({
          title: 'Error',
          description: 'Failed to load friends list',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchFriends();
    setSelectedFriends([]);
    setSearchQuery('');
  }, [open, currentUserId, toast]);

  // Filter friends based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredFriends(friends);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = friends.filter(
      (friend) =>
        friend.display_name.toLowerCase().includes(query) ||
        friend.username.toLowerCase().includes(query)
    );
    setFilteredFriends(filtered);
  }, [searchQuery, friends]);

  const toggleFriendSelection = (friendId: string) => {
    setSelectedFriends((prev) =>
      prev.includes(friendId)
        ? prev.filter((id) => id !== friendId)
        : [...prev, friendId]
    );
  };

  const handleForward = async () => {
    if (!message || selectedFriends.length === 0) return;

    setSending(true);
    try {
      // Prepare the forwarded message content
      const forwardedContent = message.content || '';
      const forwardedImageUrl = message.image_url || message.attachment_url || null;
      const forwardedGifUrl = message.is_gif ? message.gif_url : null;
      const forwardedStickerUrl = message.is_sticker ? message.sticker_url : null;

      // Send message to each selected friend
      for (const friendId of selectedFriends) {
        // Get or create conversation
        const { data: conversationId, error: convError } = await gateway.rpc(
          'get_or_create_dm',
          {
            p_user_a: currentUserId,
            p_user_b: friendId,
          }
        );

        if (convError) {
          console.error('Error creating conversation:', convError);
          continue;
        }

        // Insert the forwarded message
        const { error: msgError } = await gateway.from('messages').insert({
          conversation_id: conversationId,
          sender_id: currentUserId,
          content: forwardedContent || null,
          image_url: forwardedImageUrl,
          is_image: Boolean(forwardedImageUrl && !forwardedGifUrl && !forwardedStickerUrl),
          gif_url: forwardedGifUrl,
          is_gif: Boolean(forwardedGifUrl),
          sticker_url: forwardedStickerUrl,
          is_sticker: Boolean(forwardedStickerUrl),
          sticker_id: message.sticker_id || null,
          sticker_set: message.sticker_set || null,
        });

        if (msgError) {
          console.error('Error forwarding message:', msgError);
        }
      }

      toast({
        title: 'Message forwarded',
        description: `Sent to ${selectedFriends.length} ${
          selectedFriends.length === 1 ? 'person' : 'people'
        }`,
      });

      onOpenChange(false);
    } catch (error) {
      console.error('Error forwarding message:', error);
      toast({
        title: 'Error',
        description: 'Failed to forward message',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Forward className="h-5 w-5" />
            Forward Message
          </DialogTitle>
        </DialogHeader>

        {/* Message Preview */}
        {message && (
          <div className="bg-muted rounded-lg p-3 text-sm">
            <p className="text-muted-foreground text-xs mb-1">Forwarding:</p>
            {message.content && (
              <p className="line-clamp-2">{message.content}</p>
            )}
            {message.image_url && (
              <div className="mt-1 text-muted-foreground">📷 Image</div>
            )}
            {message.is_gif && (
              <div className="mt-1 text-muted-foreground">🎬 GIF</div>
            )}
            {message.is_sticker && (
              <div className="mt-1 text-muted-foreground">🏷️ Sticker</div>
            )}
          </div>
        )}

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search friends..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Friends List */}
        <ScrollArea className="h-64">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredFriends.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              {friends.length === 0
                ? 'No friends to forward to'
                : 'No matching friends found'}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredFriends.map((friend) => {
                const isSelected = selectedFriends.includes(friend.id);
                return (
                  <button
                    key={friend.id}
                    onClick={() => toggleFriendSelection(friend.id)}
                    className={cn(
                      'w-full flex items-center gap-3 p-2 rounded-lg transition-colors',
                      isSelected
                        ? 'bg-primary/10 border border-primary'
                        : 'hover:bg-muted border border-transparent'
                    )}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={friend.profile_pic} />
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {friend.display_name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left">
                      <p className="font-medium">{friend.display_name}</p>
                      <p className="text-sm text-muted-foreground">
                        @{friend.username}
                      </p>
                    </div>
                    {isSelected && (
                      <div className="h-6 w-6 bg-primary rounded-full flex items-center justify-center">
                        <Check className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-sm text-muted-foreground">
            {selectedFriends.length} selected
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleForward}
              disabled={selectedFriends.length === 0 || sending}
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Forward className="h-4 w-4 mr-2" />
                  Forward
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
