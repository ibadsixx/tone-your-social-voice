import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { User, Users, Hash, Instagram, Link2, MessageCircle, Twitter, Facebook, Send } from 'lucide-react';
import { motion } from 'framer-motion';
import { useGroups } from '@/hooks/useGroups';
import { gateway } from '@/lib/gateway';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { SendPostModal } from './SendPostModal';

interface SharePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
  postContent?: string | null;
}

export const SharePostModal = ({ isOpen, onClose, postId, postContent }: SharePostModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sharing, setSharing] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);

  const { getJoinedGroups, getManagedGroups } = useGroups();

  const shareToProfile = async (customContent?: string) => {
    if (!user?.id) return;
    
    setSharing(true);
    try {
      await gateway.from('posts').insert({
        user_id: user.id,
        content: customContent || null,
        type: 'shared_post',
        shared_post_id: postId
      });
      
      toast({
        title: "Shared to your profile!",
        description: "The post has been shared to your timeline",
      });
      onClose();
    } catch (error) {
      console.error('Error sharing to profile:', error);
      toast({
        title: "Error",
        description: "Failed to share to profile",
        variant: "destructive"
      });
    } finally {
      setSharing(false);
    }
  };

  const shareToGroup = async (groupId: string, groupName: string) => {
    if (!user?.id) return;
    
    setSharing(true);
    try {
      // For now, we'll create a regular post mentioning the group
      // In a full implementation, you'd have group posts functionality
      await gateway.from('posts').insert({
        user_id: user.id,
        content: `Shared a post in ${groupName}`,
        type: 'shared_post',
        shared_post_id: postId
      });
      
      toast({
        title: "Shared to group!",
        description: `The post has been shared to ${groupName}`,
      });
      onClose();
    } catch (error) {
      console.error('Error sharing to group:', error);
      toast({
        title: "Error",
        description: "Failed to share to group",
        variant: "destructive"
      });
    } finally {
      setSharing(false);
    }
  };

  const shareToPage = async (pageId: string, pageName: string) => {
    if (!user?.id) return;
    
    setSharing(true);
    try {
      await gateway.from('posts').insert({
        user_id: user.id,
        content: `Shared a post on ${pageName}`,
        type: 'shared_post',
        shared_post_id: postId
      });
      
      toast({
        title: "Shared to page!",
        description: `The post has been shared to ${pageName}`,
      });
      onClose();
    } catch (error) {
      console.error('Error sharing to page:', error);
      toast({
        title: "Error",
        description: "Failed to share to page",
        variant: "destructive"
      });
    } finally {
      setSharing(false);
    }
  };

  const copyLink = async () => {
    try {
      const postUrl = `${window.location.origin}/post/${postId}`;
      await navigator.clipboard.writeText(postUrl);
      toast({
        title: "Link copied!",
        description: "Post link has been copied to clipboard",
      });
    } catch (error) {
      console.error('Error copying link:', error);
      toast({
        title: "Error",
        description: "Failed to copy link",
        variant: "destructive"
      });
    }
  };

  const shareToExternal = (platform: string) => {
    const postUrl = `${window.location.origin}/post/${postId}`;
    const text = postContent ? `Check out this post: ${postContent.slice(0, 100)}...` : 'Check out this post!';
    
    let shareUrl = '';
    switch (platform) {
      case 'twitter':
        shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(postUrl)}`;
        break;
      case 'facebook':
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postUrl)}`;
        break;
      case 'whatsapp':
        shareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(`${text} ${postUrl}`)}`;
        break;
    }
    
    if (shareUrl) {
      window.open(shareUrl, '_blank', 'width=600,height=400');
    }
  };

  const shareOptions = [
    {
      id: 'profile',
      name: 'Share on your profile',
      icon: <User className="h-5 w-5" />,
      onClick: shareToProfile
    },
    {
      id: 'story',
      name: 'Share to your story',
      icon: <Instagram className="h-5 w-5" />,
      onClick: () => toast({ title: "Coming soon!", description: "Story sharing will be available soon" })
    },
    {
      id: 'message',
      name: 'Share as Message',
      icon: <Send className="h-5 w-5" />,
      onClick: () => setShowSendModal(true)
    },
    {
      id: 'copy',
      name: 'Copy link',
      icon: <Link2 className="h-5 w-5" />,
      onClick: copyLink
    }
  ];

  const externalOptions = [
    {
      id: 'twitter',
      name: 'Twitter',
      icon: <Twitter className="h-5 w-5" />,
      onClick: () => shareToExternal('twitter')
    },
    {
      id: 'facebook',
      name: 'Facebook',
      icon: <Facebook className="h-5 w-5" />,
      onClick: () => shareToExternal('facebook')
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      icon: <MessageCircle className="h-5 w-5" />,
      onClick: () => shareToExternal('whatsapp')
    }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share Post</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-96">
          <div className="space-y-6">
            {/* Quick Share Options */}
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Quick Share</h4>
              {shareOptions.map((option) => (
                <motion.button
                  key={option.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  onClick={() => option.onClick()}
                  disabled={sharing}
                >
                  {option.icon}
                  <span className="font-medium">{option.name}</span>
                </motion.button>
              ))}
            </div>

            {/* Share to Groups */}
            {(() => {
              const joinedGroups = getJoinedGroups();
              return joinedGroups.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Share to Groups</h4>
                  {joinedGroups.map((group) => (
                    <motion.button
                      key={group.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                      onClick={() => shareToGroup(group.id, group.name)}
                      disabled={sharing}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>
                          <Users className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{group.name}</span>
                    </motion.button>
                  ))}
                </div>
              );
            })()}

            {/* Share to Pages */}
            {(() => {
              const managedGroups = getManagedGroups();
              return managedGroups.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Share to Managed Groups</h4>
                  {managedGroups.map((group) => (
                    <motion.button
                      key={group.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                      onClick={() => shareToPage(group.id, group.name)}
                      disabled={sharing}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>
                          <Hash className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{group.name} (Admin)</span>
                    </motion.button>
                  ))}
                </div>
              );
            })()}

            {/* External Share */}
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Share Externally</h4>
              {externalOptions.map((option) => (
                <motion.button
                  key={option.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  onClick={option.onClick}
                >
                  {option.icon}
                  <span className="font-medium">{option.name}</span>
                </motion.button>
              ))}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>

      <SendPostModal
        isOpen={showSendModal}
        onClose={() => setShowSendModal(false)}
        postId={postId}
        postContent={postContent}
      />
    </Dialog>
  );
};