import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
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
}

const blockingSections: BlockingSection[] = [
  {
    id: 'restricted',
    title: 'Blocked roster',
    description:
      'When you place someone\'s account on your Blocked roster, they won\'t view publications you share exclusively with Companions. They might still glimpse items you share as Public or on a mutual companion\'s profile, and posts where their account is tagged. You won\'t alert your companions when you place them on your Blocked roster.',
  },
  {
    id: 'block-profiles',
    title: 'Block profiles and Pages',
    description:
      'Once you block a profile or Page, you can no longer engage with each other\'s profiles, publications, remarks, or correspondence. This doesn\'t encompass applications, games, or communities you both participate in. If you\'re currently linked to that profile or Page, blocking it will remove the connection, unlike, and unfollow it.',
  },
  {
    id: 'blocked-aliases',
    title: 'Blocked aliases',
    description:
      'They can\'t tag you or engage with your content. In some situations, they may still be able to view your content. Blocking may not prevent all communications or engagements.',
  },
  {
    id: 'block-messages',
    title: 'Block correspondence',
    description:
      'If you block someone\'s profile, they won\'t be able to reach you in Messenger either. Unless you block someone\'s profile and any others they may establish, they may be able to publish on your timeline, tag you, and remark on your publications or remarks.',
  },
  {
    id: 'block-app-invites',
    title: 'Block application invitations',
    description:
      'Once you block application invitations from someone\'s profile, you\'ll automatically disregard future application requests from that individual\'s profile. To block invitations from a specific companion\'s profile, click the "Disregard All Invitations From This Profile" link under your latest request.',
  },
  {
    id: 'block-event-invites',
    title: 'Block occasion invitations',
    description:
      'Once you block occasion invitations from someone\'s profile, you\'ll automatically disregard future occasion requests from that profile.',
  },
];

const BlockedUsersManager = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

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
            profile_pic: null,
          },
        };
      });

      setBlockedUsers(combinedData);
    } catch (error: any) {
      console.error('Error fetching blocked users:', error);
      toast({
        title: 'Error',
        description: 'Failed to load blocked users',
        variant: 'destructive',
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

  useEffect(() => {
    fetchBlockedUsers();
  }, [user?.id]);

  const toggleSection = (sectionId: string) => {
    setExpandedSection(prev => (prev === sectionId ? null : sectionId));
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-foreground">Blocked Users</h2>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground">
            Manage Blocking
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {blockingSections.map((section, index) => (
            <div key={section.id}>
              {index > 0 && <Separator />}
              <div className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground mb-1">
                      {section.title}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {section.description}
                      {(section.id === 'restricted' || section.id === 'block-messages') && (
                        <span className="text-primary hover:underline cursor-pointer ml-1">
                          Learn more
                        </span>
                      )}
                    </p>

                    {/* Show blocked users list for the block-profiles section */}
                    {section.id === 'block-profiles' && expandedSection === 'block-profiles' && (
                      <div className="mt-3 space-y-2">
                        {loading ? (
                          <p className="text-xs text-muted-foreground">Loading blocked users...</p>
                        ) : blockedUsers.length === 0 ? (
                          <p className="text-xs text-muted-foreground">You haven't blocked anyone yet.</p>
                        ) : (
                          <AnimatePresence>
                            {blockedUsers.map(block => (
                              <motion.div
                                key={block.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                                className="flex items-center justify-between py-2"
                              >
                                <div className="flex items-center space-x-2">
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
                                  variant="outline"
                                  size="sm"
                                  onClick={() => unblockUser(block.id, block.blocked_user.username)}
                                  className="text-xs hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20"
                                >
                                  Unblock
                                </Button>
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        )}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="shrink-0 text-xs font-medium"
                    onClick={() => toggleSection(section.id)}
                  >
                    Edit
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default BlockedUsersManager;
