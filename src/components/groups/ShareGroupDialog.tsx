import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Link2, Users, User } from 'lucide-react';
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

interface MyProfile {
  username: string | null;
  display_name: string | null;
  profile_pic: string | null;
}

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
    <path fill="#25D366" d="M16 .4C7.4.4.4 7.4.4 16c0 2.8.7 5.5 2.1 7.9L.3 31.6l7.9-2.1c2.3 1.3 4.9 1.9 7.6 1.9h.1c8.6 0 15.6-7 15.6-15.6S24.6.4 16 .4z"/>
    <path fill="#FFF" d="M23.6 19.4c-.4-.2-2.4-1.2-2.7-1.3-.4-.1-.6-.2-.9.2-.3.4-1 1.3-1.3 1.6-.2.3-.5.3-.9.1-.4-.2-1.7-.6-3.2-2-1.2-1-2-2.3-2.2-2.7-.2-.4 0-.6.2-.8.2-.2.4-.5.6-.7.2-.2.3-.4.4-.7.1-.3.1-.5 0-.7-.1-.2-.9-2.1-1.2-2.9-.3-.8-.6-.7-.9-.7h-.7c-.3 0-.7.1-1 .5s-1.3 1.3-1.3 3.1 1.3 3.6 1.5 3.9c.2.2 2.6 4 6.4 5.6.9.4 1.6.6 2.1.8.9.3 1.7.2 2.3.1.7-.1 2.4-1 2.7-1.9.3-.9.3-1.8.2-1.9-.1-.2-.4-.2-.8-.4z"/>
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const ShareGroupDialog = ({ isOpen, onClose, groupId, groupName }: ShareGroupDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [sharing, setSharing] = useState(false);
  const [profile, setProfile] = useState<MyProfile | null>(null);

  const groupUrl = `${window.location.origin}/groups/${groupId}`;

  useEffect(() => {
    if (isOpen && user) {
      fetchFriends();
      fetchProfile();
    }
  }, [isOpen, user]);

  const fetchProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('username, display_name, profile_pic')
      .eq('id', user.id)
      .maybeSingle();
    if (data) setProfile(data as MyProfile);
  };

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
              {profile?.profile_pic && <AvatarImage src={profile.profile_pic} />}
              <AvatarFallback className="bg-primary/10 text-primary">
                {(profile?.display_name || profile?.username || user?.email || 'U').charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-sm">{profile?.display_name || profile?.username || user?.email?.split('@')[0] || 'You'}</p>
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
              { id: 'whatsapp', label: 'WhatsApp', icon: <WhatsAppIcon className="h-7 w-7" />, action: () => shareExternal('whatsapp') },
              { id: 'copy', label: 'Copy link', icon: <Link2 className="h-5 w-5" />, action: copyLink },
              { id: 'group', label: 'Group', icon: <Users className="h-5 w-5" />, action: () => toast({ title: 'Coming soon', description: 'Share to group coming soon' }) },
              { id: 'profile', label: "Friend's profile", icon: <User className="h-5 w-5" />, action: () => toast({ title: 'Coming soon', description: 'Share to friend coming soon' }) },
              { id: 'x', label: 'X', icon: <XIcon className="h-5 w-5" />, action: () => shareExternal('x') },
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
