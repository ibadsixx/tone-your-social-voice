import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Users, MessageSquare, Hash } from 'lucide-react';
import { motion } from 'framer-motion';
import { useFriends } from '@/hooks/useFriends';
import { useGroups } from '@/hooks/useGroups';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface SendPostModalProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
  postContent?: string | null;
}

interface Recipient {
  id: string;
  name: string;
  avatar?: string | null;
  type: 'friend' | 'group' | 'channel';
}

export const SendPostModal = ({ isOpen, onClose, postId, postContent }: SendPostModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecipients, setSelectedRecipients] = useState<Recipient[]>([]);
  const [sending, setSending] = useState(false);

  const { friends } = useFriends(user?.id);
  const { groups, getJoinedGroups } = useGroups();

  // Combine all recipients
  const joinedGroups = getJoinedGroups();
  const allRecipients: Recipient[] = [
    ...(friends?.map(friend => ({
      id: friend.id,
      name: friend.display_name,
      avatar: friend.profile_pic,
      type: 'friend' as const
    })) || []),
    ...(joinedGroups?.map(group => ({
      id: group.id,
      name: group.name,
      avatar: null, // Groups don't have cover_image in current schema
      type: 'group' as const
    })) || [])
  ];

  const filteredRecipients = allRecipients.filter(recipient =>
    recipient.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleRecipient = (recipient: Recipient) => {
    setSelectedRecipients(prev => {
      const isSelected = prev.some(r => r.id === recipient.id && r.type === recipient.type);
      if (isSelected) {
        return prev.filter(r => !(r.id === recipient.id && r.type === recipient.type));
      } else {
        return [...prev, recipient];
      }
    });
  };

  const handleSend = async () => {
    if (selectedRecipients.length === 0 || !user?.id) return;

    setSending(true);
    try {
      for (const recipient of selectedRecipients) {
        if (recipient.type === 'friend') {
          await gateway.from('messages').insert({
            sender_id: user.id,
            receiver_id: recipient.id,
            content: postContent ? `Shared a post: ${postContent.slice(0, 100)}...` : 'Shared a post',
            // We could add a post_id field to messages table later for better handling
          });
        }
        // Handle group and channel messaging later when those tables are properly set up
      }
      
      toast({
        title: "Post sent!",
        description: `Shared with ${selectedRecipients.length} recipient${selectedRecipients.length > 1 ? 's' : ''}`,
      });
      
      onClose();
      setSelectedRecipients([]);
      setSearchTerm('');
    } catch (error) {
      console.error('Error sending post:', error);
      toast({
        title: "Error",
        description: "Failed to send post",
        variant: "destructive"
      });
    } finally {
      setSending(false);
    }
  };

  const getRecipientIcon = (type: string) => {
    switch (type) {
      case 'friend': return <Users className="h-4 w-4" />;
      case 'group': return <MessageSquare className="h-4 w-4" />;
      case 'channel': return <Hash className="h-4 w-4" />;
      default: return <Users className="h-4 w-4" />;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send Post</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search friends, groups, channels..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {selectedRecipients.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedRecipients.map((recipient) => (
                <Badge
                  key={`${recipient.type}-${recipient.id}`}
                  variant="secondary"
                  className="flex items-center gap-2 cursor-pointer"
                  onClick={() => toggleRecipient(recipient)}
                >
                  {getRecipientIcon(recipient.type)}
                  {recipient.name}
                </Badge>
              ))}
            </div>
          )}

          <ScrollArea className="h-64">
            <div className="space-y-2">
              {filteredRecipients.map((recipient) => {
                const isSelected = selectedRecipients.some(r => r.id === recipient.id && r.type === recipient.type);
                return (
                  <motion.div
                    key={`${recipient.type}-${recipient.id}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex items-center space-x-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted/50'
                    }`}
                    onClick={() => toggleRecipient(recipient)}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={recipient.avatar || undefined} />
                      <AvatarFallback>
                        {getRecipientIcon(recipient.type)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{recipient.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{recipient.type}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </ScrollArea>

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleSend} 
              disabled={selectedRecipients.length === 0 || sending}
            >
              {sending ? 'Sending...' : `Send to ${selectedRecipients.length}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};