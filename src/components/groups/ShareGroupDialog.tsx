import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { MessageCircle, Link2, Users, User, Twitter, Send } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ShareGroupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
}

interface Friend {
  id: string;
  username: string;
  display_name: string;
  profile_pic: string | null;
}

const ShareGroupDialog = ({ isOpen, onClose, groupId, groupName }: ShareGroupDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [sharing, setSharing] = useState(false);

  const groupUrl = `${window.location.origin}/groups/${groupId}`;

  useEffect(() => {
    if (isOpen && user) fetchFriends();
  }, [isOpen, user]);

  const fetchFriends = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('friends')
      .select('requester_id, receiver_id')
      .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .eq('status', 'accepted')
      .limit(10);

    if (!data) return;

    const friendIds = data.map(f => f.requester_id === user.id ? f.receiver_id : f.requester_id);
    if (friendIds.length === 0) return;

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, profile_pic')
      .in('id', friendIds);

    if (profiles) setFriends(profiles);
  };

  const shareToFeed = async () => {
    if (!user) return;
    setSharing(true);
    try {
      await supabase.from('posts').insert([{
        user_id: user.id,
        content: message || `Check out this group: ${groupName}`,
        type: 'text',
      }] as any);
      toast({ title: 'Shared!', description: 'Group shared to your feed' });
      onClose();
      setMessage('');
    } catch {
      toast({ title: 'Error', description: 'Failed to share', variant: 'destructive' });
    } finally {
      setSharing(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(groupUrl);
      toast({ title: '🔗 Link copied!', description: 'Group link copied to clipboard' });
    } catch {
      toast({ title: 'Error', description: 'Failed to copy link', variant: 'destructive' });
    }
  };

  const shareExternal = (platform: string) => {
    const text = `Check out this group: ${groupName}`;
    let url = '';
    switch (platform) {
      case 'whatsapp':
        url = `https://api.whatsapp.com/send?text=${encodeURIComponent(`${text} ${groupUrl}`)}`;
        break;
      case 'x':
        url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(groupUrl)}`;
        break;
      case 'messenger':
        url = `https://www.facebook.com/dialog/send?link=${encodeURIComponent(groupUrl)}`;
        break;
    }
    if (url) window.open(url, '_blank', 'width=600,height=400');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="text-center">Share</DialogTitle>
        </DialogHeader>

        {/* Share to feed section */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary/10 text-primary">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-sm">{user?.email?.split('@')[0] || 'You'}</p>
              <span className="text-xs text-muted-foreground">Feed · Public</span>
            </div>
          </div>
          <Textarea
            placeholder="Say something about this..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-[60px] border-none shadow-none resize-none bg-transparent p-0 focus-visible:ring-0 text-sm"
          />
          <div className="flex justify-end mt-2">
            <Button
              onClick={shareToFeed}
              disabled={sharing}
              className="rounded-full px-6"
            >
              Share now
            </Button>
          </div>
        </div>

        <Separator />

        {/* Send in Messenger section */}
        {friends.length > 0 && (
          <div className="px-4 py-3">
            <h4 className="font-semibold text-sm mb-3">Send in Messenger</h4>
            <ScrollArea className="w-full">
              <div className="flex gap-4">
                {friends.map((friend) => (
                  <button
                    key={friend.id}
                    className="flex flex-col items-center gap-1 min-w-[64px] hover:opacity-80 transition-opacity"
                    onClick={() => {
                      toast({ title: 'Sent!', description: `Shared with ${friend.display_name || friend.username}` });
                    }}
                  >
                    <Avatar className="h-14 w-14">
                      <AvatarFallback className="bg-muted text-muted-foreground">
                        {(friend.display_name || friend.username)?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-center line-clamp-2 max-w-[64px]">
                      {friend.display_name || friend.username}
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <Separator />

        {/* Share to section */}
        <div className="px-4 py-3 pb-4">
          <h4 className="font-semibold text-sm mb-3">Share to</h4>
          <div className="flex gap-4 flex-wrap">
            {[
              { id: 'messenger', label: 'Messenger', icon: <MessageCircle className="h-5 w-5" />, action: () => shareExternal('messenger') },
              { id: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle className="h-5 w-5" />, action: () => shareExternal('whatsapp') },
              { id: 'copy', label: 'Copy link', icon: <Link2 className="h-5 w-5" />, action: copyLink },
              { id: 'group', label: 'Group', icon: <Users className="h-5 w-5" />, action: () => toast({ title: 'Coming soon', description: 'Share to group coming soon' }) },
              { id: 'profile', label: "Friend's profile", icon: <User className="h-5 w-5" />, action: () => toast({ title: 'Coming soon', description: 'Share to friend coming soon' }) },
              { id: 'x', label: 'X', icon: <Twitter className="h-5 w-5" />, action: () => shareExternal('x') },
            ].map((item) => (
              <button
                key={item.id}
                className="flex flex-col items-center gap-2 min-w-[60px] hover:opacity-80 transition-opacity"
                onClick={item.action}
              >
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  {item.icon}
                </div>
                <span className="text-xs text-center max-w-[60px]">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareGroupDialog;
