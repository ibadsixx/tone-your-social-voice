import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UserX, X, PlusCircle, Users, ShieldBan, List } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';

interface BlockedUser {
  id: string;
  blocked_id: string;
  created_at: string;
  blocked_user: {
    id: string;
    username: string;
    display_name: string;
    profile_pic: string | null;
  };
}

interface BlockingSection {
  id: string;
  title: string;
  description: string;
  expanded: boolean;
}

const BlockedUsersManager = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [searchInputs, setSearchInputs] = useState<Record<string, string>>({});
  const [restrictedDialogOpen, setRestrictedDialogOpen] = useState(false);
  const [blockProfilesDialogOpen, setBlockProfilesDialogOpen] = useState(false);
  const [blockedNicknamesDialogOpen, setBlockedNicknamesDialogOpen] = useState(false);
  const [blockMessagesDialogOpen, setBlockMessagesDialogOpen] = useState(false);

  const sections: BlockingSection[] = [
    {
      id: 'restricted',
      title: 'Restricted list',
      description: 'When you add someone to your Restricted list, they won\'t be able to see posts that you share exclusively with Friends. They may still see content you share publicly or on a mutual friend\'s profile, and posts where their profile is tagged. They won\'t be notified when you add them to your Restricted list.',
      expanded: false,
    },
    {
      id: 'profiles',
      title: 'Block profiles and Pages',
      description: 'Once you block a profile or Page, you can no longer interact with each other\'s profiles, posts, comments or messages. This doesn\'t include apps, games or groups you both participate in. If you are currently connected with that profile or Page, blocking it will unfriend, unlike and unfollow it.',
      expanded: false,
    },
    {
      id: 'nicknames',
      title: 'Blocked nicknames',
      description: 'They can\'t tag you or interact with your content. In some cases, they may still be able to see your content. Blocking may not prevent all communications or interactions.',
      expanded: false,
    },
    {
      id: 'messages',
      title: 'Block messages',
      description: 'If you block someone\'s profile, they won\'t be able to contact you in Messenger either. Unless you block someone\'s profile and any others they may create, they may be able to post on your timeline, tag you, and comment on your posts or comments.',
      expanded: false,
    },
    {
      id: 'app_invites',
      title: 'Block app invites',
      description: 'Once you block app invites from someone\'s profile, you\'ll automatically ignore future app requests from that person\'s profile. To block invites from a specific friend\'s profile, click the "Ignore All Invites From This Profile" link under your latest request.',
      expanded: false,
    },
    {
      id: 'event_invites',
      title: 'Block event invites',
      description: 'Once you block event invites from someone\'s profile, you\'ll automatically ignore future event requests from that profile.',
      expanded: false,
    },
  ];

  const fetchBlockedUsers = async () => {
    if (!user?.id) return;

    try {
      const { data: blocks, error: blocksError } = await supabase
        .from('blocks')
        .select('id, blocked_id, created_at')
        .eq('blocker_id', user.id)
        .order('created_at', { ascending: false });

      if (blocksError) throw blocksError;

      if (!blocks || blocks.length === 0) {
        setBlockedUsers([]);
        return;
      }

      const blockedIds = blocks.map(block => block.blocked_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, display_name, profile_pic')
        .in('id', blockedIds);

      if (profilesError) throw profilesError;

      const combinedData = blocks.map(block => {
        const profile = profiles?.find(p => p.id === block.blocked_id);
        return {
          ...block,
          blocked_user: profile || {
            id: block.blocked_id,
            username: 'unknown',
            display_name: 'Unknown User',
            profile_pic: null
          }
        };
      });

      setBlockedUsers(combinedData);
    } catch (error: any) {
      console.error('Error fetching blocked users:', error);
      toast({
        title: 'Error',
        description: 'Failed to load blocked users',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const unblockUser = async (blockId: string, username: string) => {
    try {
      const { error } = await supabase
        .from('blocks')
        .delete()
        .eq('id', blockId);

      if (error) throw error;

      setBlockedUsers(prev => prev.filter(block => block.id !== blockId));

      toast({
        title: 'User unblocked',
        description: `@${username} has been unblocked successfully.`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to unblock user.',
        variant: 'destructive',
      });
    }
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  useEffect(() => {
    fetchBlockedUsers();
  }, [user?.id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-foreground">Blocking</h2>
        <div className="text-center py-4 text-muted-foreground">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Blocking</h2>

      <div className="bg-card border border-border rounded-lg">
        <div className="px-6 py-4">
          <h3 className="text-lg font-semibold text-foreground">Manage Blocking</h3>
        </div>

        <Separator />

        {sections.map((section, index) => (
          <div key={section.id}>
            <div className="px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-foreground text-sm mb-1">{section.title}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">{section.description}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    if (section.id === 'restricted') setRestrictedDialogOpen(true);
                    else if (section.id === 'profiles') setBlockProfilesDialogOpen(true);
                    else if (section.id === 'nicknames') setBlockedNicknamesDialogOpen(true);
                    else if (section.id === 'messages') setBlockMessagesDialogOpen(true);
                    else toggleSection(section.id);
                  }}
                >
                  Edit
                </Button>
              </div>

              <AnimatePresence>
                {expandedSections[section.id] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 space-y-3">
                      {section.id === 'restricted' && null}

                      {section.id === 'profiles' && (
                        <>
                          <div className="flex gap-2">
                            <Input
                              placeholder="Search for a user to block..."
                              value={searchInputs[section.id] || ''}
                              onChange={(e) => setSearchInputs(prev => ({ ...prev, [section.id]: e.target.value }))}
                              className="flex-1"
                            />
                            <Button variant="default" size="sm">
                              Block
                            </Button>
                          </div>

                          {blockedUsers.length > 0 ? (
                            <div className="space-y-2">
                              {blockedUsers.map((block) => (
                                <motion.div
                                  key={block.id}
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  className="flex items-center justify-between p-3 rounded-md bg-muted/40"
                                >
                                  <div className="flex items-center gap-3">
                                    <Avatar className="h-8 w-8">
                                      <AvatarImage src={block.blocked_user.profile_pic || undefined} />
                                      <AvatarFallback className="bg-muted text-xs">
                                        {block.blocked_user.display_name.charAt(0).toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <p className="text-sm font-medium text-foreground">
                                        {block.blocked_user.display_name}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        @{block.blocked_user.username}
                                      </p>
                                    </div>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => unblockUser(block.id, block.blocked_user.username)}
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  >
                                    <X className="h-4 w-4 mr-1" />
                                    Unblock
                                  </Button>
                                </motion.div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground py-2">You haven't blocked anyone yet.</p>
                          )}
                        </>
                      )}

                      {section.id !== 'profiles' && section.id !== 'restricted' && (
                        <div className="flex gap-2">
                          <Input
                            placeholder={`Add a name to ${section.title.toLowerCase()}...`}
                            value={searchInputs[section.id] || ''}
                            onChange={(e) => setSearchInputs(prev => ({ ...prev, [section.id]: e.target.value }))}
                            className="flex-1"
                          />
                          <Button variant="default" size="sm">
                            Add
                          </Button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {index < sections.length - 1 && <Separator />}
          </div>
        ))}
      </div>

      {/* Block Messages Dialog */}
      <Dialog open={blockMessagesDialogOpen} onOpenChange={setBlockMessagesDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-lg font-semibold">Block messages</DialogTitle>
          </DialogHeader>
          <Separator />
          <p className="text-sm text-muted-foreground leading-relaxed">
            If you block someone's profile on the platform, they won't be able to reach
            you in Messenger either. Unless you block someone's profile and any others they
            may create, they may be able to post on your timeline, tag you, and comment on
            your posts or comments.
          </p>
          <div className="space-y-1">
            <button
              className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-accent transition-colors text-left"
              onClick={() => {/* TODO: Add to blocked list */}}
            >
              <PlusCircle className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium text-foreground">Add to blocked list</span>
            </button>
            <button
              className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-accent transition-colors text-left"
              onClick={() => {/* TODO: See blocked list */}}
            >
              <Users className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">See your blocked list</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Blocked Nicknames Dialog */}
      <Dialog open={blockedNicknamesDialogOpen} onOpenChange={setBlockedNicknamesDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-lg font-semibold">Blocked nicknames</DialogTitle>
          </DialogHeader>
          <Separator />
          <p className="text-sm text-muted-foreground leading-relaxed">
            They can't tag you or engage with your content. In certain situations, they may still
            be able to view your content. Blocking may not prevent all communications
            or interactions.
          </p>
          <div className="space-y-1">
            <button
              className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-accent transition-colors text-left"
              onClick={() => {/* TODO: See blocked list */}}
            >
              <Users className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">See your blocked list</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Block Profiles and Pages Dialog */}
      <Dialog open={blockProfilesDialogOpen} onOpenChange={setBlockProfilesDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-lg font-semibold">Block profiles and Pages</DialogTitle>
          </DialogHeader>
          <Separator />
          <p className="text-sm text-muted-foreground leading-relaxed">
            Once you block a profile or Page, you can no longer interact with each
            others' profiles, posts, comments or messages. This doesn't include apps,
            games or groups you both participate in. If you are currently connected with
            that profile or Page, blocking it will unfriend, unlike and unfollow it.
          </p>
          <div className="space-y-1">
            <button
              className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-accent transition-colors text-left"
              onClick={() => {/* TODO: Add to blocked list */}}
            >
              <ShieldBan className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium text-foreground">Add to blocked list</span>
            </button>
            <button
              className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-accent transition-colors text-left"
              onClick={() => {/* TODO: See blocked list */}}
            >
              <List className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">See your blocked list</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Restricted List Dialog */}
      <Dialog open={restrictedDialogOpen} onOpenChange={setRestrictedDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-lg font-semibold">Restricted list</DialogTitle>
          </DialogHeader>
          <Separator />
          <p className="text-sm text-muted-foreground leading-relaxed">
            When you place someone's profile on your Restricted list, they won't be able to view posts
            that you share exclusively with Friends. They may still notice things you
            share to Public or on a mutual friend's timeline, and posts their profile is
            mentioned in. The platform doesn't alert your friends when you place them on your
            Restricted list.
          </p>
          <div className="space-y-1">
            <button
              className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-accent transition-colors text-left"
              onClick={() => {/* TODO: Add to restricted list */}}
            >
              <PlusCircle className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium text-foreground">Add to restricted list</span>
            </button>
            <button
              className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-accent transition-colors text-left"
              onClick={() => {/* TODO: See restricted list */}}
            >
              <Users className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">View your restricted list</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BlockedUsersManager;
