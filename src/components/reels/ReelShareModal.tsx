import { useState, useEffect } from 'react';
import { X, Globe, Users, Lock, Link2, MessageSquare, Search, BookOpen, UsersRound, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';

interface ReelShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  reelId: string;
}

type Visibility = 'public' | 'friends' | 'private';

interface RecentContact {
  id: string;
  username: string;
  display_name: string;
  profile_pic: string | null;
}

interface Group {
  id: string;
  name: string;
  description: string | null;
}

type SubModal = null | 'groups' | 'friends';

const ReelShareModal = ({ isOpen, onClose, reelId }: ReelShareModalProps) => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { toast } = useToast();
  
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [shareText, setShareText] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [recentContacts, setRecentContacts] = useState<RecentContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  
  // Sub-modal states
  const [subModal, setSubModal] = useState<SubModal>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [friends, setFriends] = useState<RecentContact[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [friendSearch, setFriendSearch] = useState('');
  const [processingShare, setProcessingShare] = useState<string | null>(null);

  // Fetch recent contacts (friends)
  useEffect(() => {
    if (!isOpen || !user?.id) return;
    
    const fetchRecentContacts = async () => {
      setLoadingContacts(true);
      try {
        const { data, error } = await gateway
          .from('friends')
          .select(`
            id,
            requester_id,
            receiver_id,
            requester:profiles!friends_requester_id_fkey (
              id,
              username,
              display_name,
              profile_pic
            ),
            receiver:profiles!friends_receiver_id_fkey (
              id,
              username,
              display_name,
              profile_pic
            )
          `)
          .eq('status', 'accepted')
          .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .limit(6);

        if (error) throw error;

        const contacts: RecentContact[] = (data || []).map(friend => {
          const friendProfile = friend.requester_id === user.id 
            ? friend.receiver 
            : friend.requester;
          const profileData = Array.isArray(friendProfile) ? friendProfile[0] : friendProfile;
          return {
            id: profileData?.id || '',
            username: profileData?.username || '',
            display_name: profileData?.display_name || '',
            profile_pic: profileData?.profile_pic || null
          };
        }).filter(c => c.id);

        setRecentContacts(contacts);
      } catch (error) {
        console.error('[REEL_SHARE] Error fetching contacts:', error);
      } finally {
        setLoadingContacts(false);
      }
    };

    fetchRecentContacts();
  }, [isOpen, user?.id]);

  // Fetch user's groups when groups sub-modal opens
  useEffect(() => {
    if (subModal !== 'groups' || !user?.id) return;
    
    const fetchGroups = async () => {
      setLoadingGroups(true);
      try {
        const { data, error } = await gateway
          .from('group_members')
          .select(`
            group_id,
            groups:groups!group_members_group_id_fkey (
              id,
              name,
              description
            )
          `)
          .eq('user_id', user.id);

        if (error) throw error;

        const groupList: Group[] = (data || []).map(item => {
          const groupData = Array.isArray(item.groups) ? item.groups[0] : item.groups;
          return {
            id: groupData?.id || '',
            name: groupData?.name || '',
            description: groupData?.description || null
          };
        }).filter(g => g.id);

        setGroups(groupList);
      } catch (error) {
        console.error('[REEL_SHARE] Error fetching groups:', error);
      } finally {
        setLoadingGroups(false);
      }
    };

    fetchGroups();
  }, [subModal, user?.id]);

  // Fetch all friends when friends sub-modal opens
  useEffect(() => {
    if (subModal !== 'friends' || !user?.id) return;
    
    const fetchAllFriends = async () => {
      setLoadingFriends(true);
      try {
        const { data, error } = await gateway
          .from('friends')
          .select(`
            id,
            requester_id,
            receiver_id,
            requester:profiles!friends_requester_id_fkey (
              id,
              username,
              display_name,
              profile_pic
            ),
            receiver:profiles!friends_receiver_id_fkey (
              id,
              username,
              display_name,
              profile_pic
            )
          `)
          .eq('status', 'accepted')
          .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

        if (error) throw error;

        const friendList: RecentContact[] = (data || []).map(friend => {
          const friendProfile = friend.requester_id === user.id 
            ? friend.receiver 
            : friend.requester;
          const profileData = Array.isArray(friendProfile) ? friendProfile[0] : friendProfile;
          return {
            id: profileData?.id || '',
            username: profileData?.username || '',
            display_name: profileData?.display_name || '',
            profile_pic: profileData?.profile_pic || null
          };
        }).filter(c => c.id);

        setFriends(friendList);
      } catch (error) {
        console.error('[REEL_SHARE] Error fetching friends:', error);
      } finally {
        setLoadingFriends(false);
      }
    };

    fetchAllFriends();
  }, [subModal, user?.id]);

  // Handle share to feed
  const handleShare = async () => {
    if (!user?.id) {
      toast({
        title: 'Error',
        description: 'You must be logged in to share',
        variant: 'destructive'
      });
      return;
    }

    setIsSharing(true);
    try {
      const { error: shareError } = await gateway
        .from('post_shares')
        .insert({
          post_id: reelId,
          user_id: user.id,
          visibility: visibility,
          message: shareText.trim() || null
        });

      if (shareError) throw shareError;

      const { error: rpcError } = await gateway.rpc('increment_post_share_counts', { p_post_id: reelId });
      if (rpcError) {
        console.warn('[REEL_SHARE] RPC fallback:', rpcError.message);
        const { data: postData } = await gateway
          .from('posts')
          .select('share_count, shares_count')
          .eq('id', reelId)
          .single();
        await gateway
          .from('posts')
          .update({
            share_count: (postData?.share_count || 0) + 1,
            shares_count: (postData?.shares_count || 0) + 1
          })
          .eq('id', reelId);
      }

      if (shareText.trim()) {
        await gateway.from('posts').insert({
          user_id: user.id,
          content: shareText.trim(),
          type: 'shared_post',
          shared_post_id: reelId,
          visibility: visibility
        });
      }

      console.log(`[REEL_SHARE] reel_id=${reelId} user_id=${user.id} visibility=${visibility}`);

      toast({
        title: 'Shared!',
        description: 'Reel shared successfully'
      });

      onClose();
      setShareText('');
      setVisibility('public');
    } catch (error: any) {
      console.error('[REEL_SHARE] Error sharing:', error);
      toast({
        title: 'Error',
        description: 'Failed to share reel',
        variant: 'destructive'
      });
    } finally {
      setIsSharing(false);
    }
  };

  // Handle share to Story (instant)
  const handleShareToStory = async () => {
    if (!user?.id) return;
    
    setProcessingShare('story');
    try {
      // Get reel media info
      const { data: reel } = await gateway
        .from('posts')
        .select('media_url, media_type, thumbnail')
        .eq('id', reelId)
        .single();

      if (!reel?.media_url) throw new Error('Reel media not found');

      // Create story with 24hr expiry
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const { error } = await gateway
        .from('stories')
        .insert({
          user_id: user.id,
          media_url: reel.media_url,
          media_type: reel.media_type || 'video',
          expires_at: expiresAt.toISOString(),
          caption: shareText.trim() || null
        });

      if (error) throw error;

      console.log(`[SHARE_TO] story reel_id=${reelId}`);

      toast({
        title: 'Success',
        description: 'Reel shared to your story'
      });

      onClose();
    } catch (error: any) {
      console.error('[SHARE_TO_STORY] Error:', error);
      toast({
        title: 'Error',
        description: 'Failed to share to story',
        variant: 'destructive'
      });
    } finally {
      setProcessingShare(null);
    }
  };

  // Handle share to Group
  const handleShareToGroup = async (groupId: string) => {
    if (!user?.id) return;
    
    setProcessingShare(groupId);
    try {
      const { error } = await gateway
        .from('group_posts')
        .insert({
          group_id: groupId,
          post_id: reelId,
          shared_by: user.id,
          message: shareText.trim() || null
        });

      if (error) {
        if (error.code === '23505') {
          toast({
            title: 'Already shared',
            description: 'This reel was already shared to this group',
            variant: 'destructive'
          });
          return;
        }
        throw error;
      }

      console.log(`[SHARE_TO] group_id=${groupId} reel_id=${reelId}`);

      toast({
        title: 'Success',
        description: 'Reel shared to group'
      });

      setSubModal(null);
      onClose();
    } catch (error: any) {
      console.error('[SHARE_TO_GROUP] Error:', error);
      toast({
        title: 'Error',
        description: 'Failed to share to group',
        variant: 'destructive'
      });
    } finally {
      setProcessingShare(null);
    }
  };

  // Handle share to Friend's Profile
  const handleShareToProfile = async (profileId: string) => {
    if (!user?.id) return;
    
    setProcessingShare(profileId);
    try {
      const { error } = await gateway
        .from('profile_posts')
        .insert({
          profile_id: profileId,
          post_id: reelId,
          shared_by: user.id,
          message: shareText.trim() || null
        });

      if (error) {
        if (error.code === '23505') {
          toast({
            title: 'Already shared',
            description: 'This reel was already shared to this profile',
            variant: 'destructive'
          });
          return;
        }
        throw error;
      }

      console.log(`[SHARE_TO] profile_id=${profileId} reel_id=${reelId}`);

      toast({
        title: 'Success',
        description: 'Reel shared to profile'
      });

      setSubModal(null);
      onClose();
    } catch (error: any) {
      console.error('[SHARE_TO_PROFILE] Error:', error);
      toast({
        title: 'Error',
        description: 'Failed to share to profile',
        variant: 'destructive'
      });
    } finally {
      setProcessingShare(null);
    }
  };

  // Handle send in message
  const handleSendInMessage = async (contactId: string, contactName: string) => {
    if (!user?.id) return;
    
    setProcessingShare(contactId);
    try {
      // Get or create conversation
      const { data: conversationId, error: convError } = await gateway
        .rpc('get_or_create_dm', { p_user_a: user.id, p_user_b: contactId });

      if (convError) throw convError;

      // Send reel link as message
      const reelUrl = `${window.location.origin}/reels/${reelId}`;
      const messageContent = shareText.trim() 
        ? `${shareText.trim()}\n\n${reelUrl}` 
        : reelUrl;

      const { error: msgError } = await gateway
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: messageContent
        });

      if (msgError) throw msgError;

      console.log(`[SHARE_TO] message user_id=${contactId} reel_id=${reelId}`);

      toast({
        title: 'Sent!',
        description: `Reel sent to ${contactName}`
      });

      onClose();
    } catch (error: any) {
      console.error('[SEND_IN_MESSAGE] Error:', error);
      toast({
        title: 'Error',
        description: 'Failed to send message',
        variant: 'destructive'
      });
    } finally {
      setProcessingShare(null);
    }
  };

  // Handle copy link
  const handleCopyLink = async () => {
    try {
      const url = `${window.location.origin}/reels/${reelId}`;
      await navigator.clipboard.writeText(url);
      
      console.log(`[REEL_SHARE] Link copied reel_id=${reelId}`);
      
      toast({
        title: 'Link copied',
        description: 'Reel link copied to clipboard'
      });
    } catch (error) {
      console.error('[REEL_SHARE] Error copying link:', error);
      toast({
        title: 'Error',
        description: 'Failed to copy link',
        variant: 'destructive'
      });
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      if (subModal) {
        setSubModal(null);
      } else {
        onClose();
      }
    }
  };

  const visibilityOptions = [
    { value: 'public' as Visibility, label: 'Public', icon: Globe },
    { value: 'friends' as Visibility, label: 'Friends', icon: Users },
    { value: 'private' as Visibility, label: 'Only me', icon: Lock }
  ];

  const VisibilityIcon = visibilityOptions.find(v => v.value === visibility)?.icon || Globe;

  // Filter friends by search
  const filteredFriends = friends.filter(f => 
    f.display_name.toLowerCase().includes(friendSearch.toLowerCase()) ||
    f.username.toLowerCase().includes(friendSearch.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={handleBackdropClick}
        >
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full sm:max-w-md sm:mx-4 bg-card rounded-t-xl sm:rounded-xl shadow-2xl overflow-hidden border border-border max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <h2 className="text-lg font-semibold text-foreground">Share</h2>
              <button
                onClick={() => subModal ? setSubModal(null) : onClose()}
                className="p-1.5 rounded-full hover:bg-muted transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {/* Main Modal Content */}
              {!subModal && (
                <>
                  {/* User Section */}
                  <div className="p-4 border-b border-border">
                    <div className="flex items-center gap-3 mb-3">
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={profile?.profile_pic || undefined} />
                        <AvatarFallback>
                          {profile?.display_name?.[0] || user?.email?.[0] || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium text-foreground">
                          {profile?.display_name || profile?.username || 'User'}
                        </p>
                        <div className="relative mt-1">
                          <select
                            value={visibility}
                            onChange={(e) => setVisibility(e.target.value as Visibility)}
                            className="appearance-none bg-muted text-muted-foreground text-sm px-2 py-1 pr-6 rounded-md border-none cursor-pointer focus:ring-1 focus:ring-primary"
                          >
                            {visibilityOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <VisibilityIcon className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                        </div>
                      </div>
                    </div>

                    <Textarea
                      value={shareText}
                      onChange={(e) => setShareText(e.target.value)}
                      placeholder="Say something about this…"
                      className="w-full min-h-[80px] resize-none bg-muted border-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
                      maxLength={500}
                    />
                  </div>

                  {/* Primary Action */}
                  <div className="px-4 py-3 border-b border-border">
                    <Button
                      onClick={handleShare}
                      disabled={isSharing}
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                    >
                      {isSharing ? 'Sharing…' : 'Share now'}
                    </Button>
                  </div>

                  {/* Messages Section */}
                  <div className="px-4 py-3 border-b border-border">
                    <div className="flex items-center gap-2 mb-3">
                      <MessageSquare className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">Messages</span>
                    </div>
                    
                    {loadingContacts ? (
                      <div className="flex gap-3 overflow-x-auto py-2">
                        {[1, 2, 3, 4].map((i) => (
                          <div key={i} className="flex flex-col items-center gap-1">
                            <div className="w-12 h-12 rounded-full bg-muted animate-pulse" />
                            <div className="w-10 h-3 bg-muted animate-pulse rounded" />
                          </div>
                        ))}
                      </div>
                    ) : recentContacts.length > 0 ? (
                      <div className="flex gap-3 overflow-x-auto py-2">
                        {recentContacts.map((contact) => (
                          <button
                            key={contact.id}
                            disabled={processingShare === contact.id}
                            className="flex flex-col items-center gap-1 min-w-[60px] group disabled:opacity-50"
                            onClick={() => handleSendInMessage(contact.id, contact.display_name)}
                          >
                            <Avatar className="w-12 h-12 ring-2 ring-transparent group-hover:ring-primary transition-all">
                              <AvatarImage src={contact.profile_pic || undefined} />
                              <AvatarFallback>
                                {contact.display_name?.[0] || contact.username?.[0] || '?'}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs text-muted-foreground truncate max-w-[60px]">
                              {contact.display_name || contact.username}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-2">
                        No recent contacts
                      </p>
                    )}
                  </div>

                  {/* Share to Options */}
                  <div className="px-4 py-3">
                    <p className="text-sm font-medium text-foreground mb-3">Share to</p>
                    
                    <div className="grid grid-cols-4 gap-4 mb-4">
                      {/* Story */}
                      <button
                        onClick={handleShareToStory}
                        disabled={processingShare === 'story'}
                        className="flex flex-col items-center gap-2 group disabled:opacity-50"
                      >
                        <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-500 flex items-center justify-center group-hover:scale-105 transition-transform">
                          <BookOpen className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xs text-muted-foreground">Story</span>
                      </button>

                      {/* Groups */}
                      <button
                        onClick={() => setSubModal('groups')}
                        className="flex flex-col items-center gap-2 group"
                      >
                        <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center group-hover:scale-105 transition-transform">
                          <UsersRound className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xs text-muted-foreground">Groups</span>
                      </button>

                      {/* Friend's Profile */}
                      <button
                        onClick={() => setSubModal('friends')}
                        className="flex flex-col items-center gap-2 group"
                      >
                        <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center group-hover:scale-105 transition-transform">
                          <User className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xs text-muted-foreground">Friend</span>
                      </button>

                      {/* Copy Link */}
                      <button
                        onClick={handleCopyLink}
                        className="flex flex-col items-center gap-2 group"
                      >
                        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center group-hover:scale-105 transition-transform group-hover:bg-muted/80">
                          <Link2 className="w-5 h-5 text-foreground" />
                        </div>
                        <span className="text-xs text-muted-foreground">Copy link</span>
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Groups Sub-Modal */}
              {subModal === 'groups' && (
                <div className="p-4">
                  <h3 className="text-base font-semibold text-foreground mb-4">Select a group</h3>
                  
                  {loadingGroups ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 animate-pulse">
                          <div className="w-10 h-10 rounded-full bg-muted" />
                          <div className="flex-1">
                            <div className="h-4 bg-muted rounded w-24 mb-1" />
                            <div className="h-3 bg-muted rounded w-32" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : groups.length > 0 ? (
                    <div className="space-y-2">
                      {groups.map((group) => (
                        <button
                          key={group.id}
                          onClick={() => handleShareToGroup(group.id)}
                          disabled={processingShare === group.id}
                          className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors text-left disabled:opacity-50"
                        >
                          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
                            <UsersRound className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate">{group.name}</p>
                            {group.description && (
                              <p className="text-sm text-muted-foreground truncate">{group.description}</p>
                            )}
                          </div>
                          {processingShare === group.id && (
                            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      You haven't joined any groups yet
                    </p>
                  )}
                </div>
              )}

              {/* Friends Sub-Modal */}
              {subModal === 'friends' && (
                <div className="p-4">
                  <h3 className="text-base font-semibold text-foreground mb-4">Share to friend's profile</h3>
                  
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={friendSearch}
                      onChange={(e) => setFriendSearch(e.target.value)}
                      placeholder="Search friends..."
                      className="pl-9 bg-muted border-none"
                    />
                  </div>
                  
                  {loadingFriends ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 animate-pulse">
                          <div className="w-10 h-10 rounded-full bg-muted" />
                          <div className="flex-1">
                            <div className="h-4 bg-muted rounded w-24" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : filteredFriends.length > 0 ? (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {filteredFriends.map((friend) => (
                        <button
                          key={friend.id}
                          onClick={() => handleShareToProfile(friend.id)}
                          disabled={processingShare === friend.id}
                          className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors text-left disabled:opacity-50"
                        >
                          <Avatar className="w-10 h-10">
                            <AvatarImage src={friend.profile_pic || undefined} />
                            <AvatarFallback>
                              {friend.display_name?.[0] || friend.username?.[0] || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate">{friend.display_name}</p>
                            <p className="text-sm text-muted-foreground truncate">@{friend.username}</p>
                          </div>
                          {processingShare === friend.id && (
                            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      {friendSearch ? 'No friends found' : 'No friends to share with'}
                    </p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ReelShareModal;
