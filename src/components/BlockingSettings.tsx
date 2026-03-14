import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronDown, ChevronUp, X, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface BlockedProfile {
  id: string;
  blocked_id: string;
  block_type: string;
  created_at: string;
  profile: {
    id: string;
    username: string;
    display_name: string;
    profile_pic: string | null;
  };
}

interface BlockSection {
  id: string;
  title: string;
  description: string;
  blockType: string;
  searchPlaceholder: string;
}

const sections: BlockSection[] = [
  {
    id: 'restricted',
    title: 'Restricted roster',
    description:
      'When you place someone\'s profile on your Restricted roster, they won\'t view posts on the platform that you distribute solely to Companions. They may still notice things you distribute to the Public or on a mutual companion\'s profile, and posts their profile is tagged in. The platform doesn\'t alert your companions when you place them on your Restricted roster.',
    blockType: 'restricted',
    searchPlaceholder: 'Search by name to add to restricted roster...',
  },
  {
    id: 'profiles',
    title: 'Block profiles and Pages',
    description:
      'Once you block a profile or Page, you can no longer engage with each other\'s profiles, posts, comments, or dispatches. This doesn\'t encompass apps, games, or groups you both take part in. If you are presently linked with that profile or Page, blocking it will remove the bond, unlike, and unfollow it.',
    blockType: 'full',
    searchPlaceholder: 'Search by name to block...',
  },
  {
    id: 'nicknames',
    title: 'Blocked aliases',
    description:
      'They can\'t label you or engage with your content. In certain cases, they may still be able to view your content. Blocking may not prevent all communications or engagements.',
    blockType: 'nickname',
    searchPlaceholder: 'Search by alias to block...',
  },
  {
    id: 'messages',
    title: 'Block dispatches',
    description:
      'If you block someone\'s profile on the platform, they won\'t be able to reach you in Messenger either. Unless you block someone\'s profile and any others they may establish, they may be able to post on your timeline, label you, and comment on your posts or comments.',
    blockType: 'messaging',
    searchPlaceholder: 'Search by name to block dispatches...',
  },
  {
    id: 'app_invites',
    title: 'Block app solicitations',
    description:
      'Once you block app solicitations from someone\'s profile, you\'ll automatically disregard future app requests from that person\'s profile. To block solicitations from a specific companion\'s profile, click the "Disregard All Solicitations From This Profile" link under your most recent request.',
    blockType: 'app_invite',
    searchPlaceholder: 'Search by name to block app solicitations...',
  },
  {
    id: 'event_invites',
    title: 'Block occasion solicitations',
    description:
      'Once you block occasion solicitations from someone\'s profile, you\'ll automatically disregard future occasion requests from that profile.',
    blockType: 'event_invite',
    searchPlaceholder: 'Search by name to block occasion solicitations...',
  },
];

const BlockingSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [blockedUsers, setBlockedUsers] = useState<Record<string, BlockedProfile[]>>({});
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const [searchResults, setSearchResults] = useState<Record<string, any[]>>({});
  const [searching, setSearching] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (user?.id) fetchBlockedUsers();
  }, [user?.id]);

  const fetchBlockedUsers = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data: blocks, error } = await supabase
        .from('blocks')
        .select('id, blocked_id, block_type, created_at')
        .eq('blocker_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!blocks || blocks.length === 0) {
        setBlockedUsers({});
        setLoading(false);
        return;
      }

      const blockedIds = blocks.map((b) => b.blocked_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, display_name, profile_pic')
        .in('id', blockedIds);

      const grouped: Record<string, BlockedProfile[]> = {};
      blocks.forEach((block) => {
        const profile = profiles?.find((p) => p.id === block.blocked_id) || {
          id: block.blocked_id,
          username: 'unknown',
          display_name: 'Unknown User',
          profile_pic: null,
        };
        const type = block.block_type || 'full';
        if (!grouped[type]) grouped[type] = [];
        grouped[type].push({ ...block, profile });
      });
      setBlockedUsers(grouped);
    } catch (err: any) {
      console.error('Error fetching blocked users:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (id: string) =>
    setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleSearch = async (sectionId: string, query: string) => {
    setSearchQueries((prev) => ({ ...prev, [sectionId]: query }));
    if (query.length < 2) {
      setSearchResults((prev) => ({ ...prev, [sectionId]: [] }));
      return;
    }
    setSearching((prev) => ({ ...prev, [sectionId]: true }));
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, profile_pic')
        .neq('id', user?.id || '')
        .or(`display_name.ilike.%${query}%,username.ilike.%${query}%`)
        .limit(5);
      setSearchResults((prev) => ({ ...prev, [sectionId]: data || [] }));
    } catch {
      // ignore
    } finally {
      setSearching((prev) => ({ ...prev, [sectionId]: false }));
    }
  };

  const blockUser = async (targetId: string, blockType: string) => {
    if (!user?.id) return;
    try {
      const { error } = await supabase.rpc('block_user', {
        p_blocker: user.id,
        p_blocked: targetId,
        p_block_type: blockType === 'full' || blockType === 'messaging' ? blockType : 'full',
      });
      if (error) throw error;
      toast({ title: 'User obstructed', description: 'The user has been obstructed successfully.' });
      // Clear search
      setSearchQueries((prev) => ({ ...prev, [blockType]: '' }));
      setSearchResults((prev) => ({ ...prev, [blockType]: [] }));
      fetchBlockedUsers();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to obstruct user', variant: 'destructive' });
    }
  };

  const unblockUser = async (blockId: string) => {
    try {
      const { error } = await supabase.from('blocks').delete().eq('id', blockId);
      if (error) throw error;
      toast({ title: 'User unobstructed', description: 'The user has been unobstructed.' });
      fetchBlockedUsers();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to unobstruct user', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground">Obstructing</h2>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-foreground">Obstructing</h2>

      <Card className="border-border/50">
        <CardContent className="p-0">
          <div className="px-6 py-4">
            <h3 className="text-lg font-semibold text-foreground">Administer Obstructing</h3>
          </div>
          <Separator />

          {sections.map((section, idx) => {
            const sectionBlocked = blockedUsers[section.blockType] || [];
            const isExpanded = expandedSections[section.id];
            const query = searchQueries[section.id] || '';
            const results = searchResults[section.id] || [];

            return (
              <div key={section.id}>
                <div className="px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="font-semibold text-foreground text-[15px]">{section.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                        {section.description}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 mt-1"
                      onClick={() => toggleSection(section.id)}
                    >
                      {isExpanded ? 'Close' : 'Edit'}
                    </Button>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 space-y-3">
                          {/* Search input */}
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder={section.searchPlaceholder}
                              value={query}
                              onChange={(e) => handleSearch(section.id, e.target.value)}
                              className="pl-9"
                            />
                          </div>

                          {/* Search results */}
                          {results.length > 0 && (
                            <div className="border border-border rounded-lg divide-y divide-border">
                              {results.map((profile) => (
                                <div
                                  key={profile.id}
                                  className="flex items-center justify-between px-3 py-2 hover:bg-accent/50"
                                >
                                  <div className="flex items-center gap-2">
                                    <Avatar className="h-8 w-8">
                                      <AvatarImage src={profile.profile_pic || undefined} />
                                      <AvatarFallback className="bg-muted text-xs">
                                        {profile.display_name?.charAt(0).toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <p className="text-sm font-medium text-foreground">
                                        {profile.display_name}
                                      </p>
                                      <p className="text-xs text-muted-foreground">@{profile.username}</p>
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => blockUser(profile.id, section.blockType)}
                                  >
                                    Obstruct
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Blocked users list */}
                          {sectionBlocked.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Obstructed ({sectionBlocked.length})
                              </p>
                              {sectionBlocked.map((block) => (
                                <div
                                  key={block.id}
                                  className="flex items-center justify-between px-3 py-2 border border-border rounded-lg"
                                >
                                  <div className="flex items-center gap-2">
                                    <Avatar className="h-8 w-8">
                                      <AvatarImage src={block.profile.profile_pic || undefined} />
                                      <AvatarFallback className="bg-muted text-xs">
                                        {block.profile.display_name.charAt(0).toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <p className="text-sm font-medium text-foreground">
                                        {block.profile.display_name}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        @{block.profile.username}
                                      </p>
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => unblockUser(block.id)}
                                    className="hover:bg-destructive/10 hover:text-destructive"
                                  >
                                    Unobstruct
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}

                          {sectionBlocked.length === 0 && results.length === 0 && query.length < 2 && (
                            <p className="text-sm text-muted-foreground text-center py-2">
                              No obstructed users in this category.
                            </p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                {idx < sections.length - 1 && <Separator />}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};

export default BlockingSettings;
