import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { UserX, Ban, MessageSquare, Bell, CalendarX, Shield, Slash, Plus, X, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';

type Section = 'restricted' | 'blocked' | 'nicknames' | 'messages' | 'app-invites' | 'event-invites';

interface SectionTab {
  id: Section;
  label: string;
  icon: React.ReactNode;
}

const SECTIONS: SectionTab[] = [
  { id: 'restricted', label: 'Restricted list', icon: <Shield className="h-4 w-4" /> },
  { id: 'blocked', label: 'Block profiles and Pages', icon: <Ban className="h-4 w-4" /> },
  { id: 'nicknames', label: 'Blocked nicknames', icon: <Slash className="h-4 w-4" /> },
  { id: 'messages', label: 'Block messages', icon: <MessageSquare className="h-4 w-4" /> },
  { id: 'app-invites', label: 'Block app invites', icon: <Bell className="h-4 w-4" /> },
  { id: 'event-invites', label: 'Block event invites', icon: <CalendarX className="h-4 w-4" /> },
];

interface ProfileResult {
  id: string;
  username: string;
  display_name: string;
  profile_pic: string | null;
}

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

interface ActiveRow {
  id: string;
  target_id: string;
  display_name: string;
  username: string;
  profile_pic: string | null;
  created_at: string;
}

interface NicknameRow {
  id: string;
  nickname: string;
  created_at: string;
}

const BlockedUsersManager = () => {
  const [activeSection, setActiveSection] = useState<Section>('restricted');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserX className="h-5 w-5 text-destructive" />
          Manage Blocking
        </CardTitle>
        <CardDescription>
          Control who can interact with you across the platform
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-1.5 mb-6">
          {SECTIONS.map(section => {
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {section.icon}
                <span>{section.label}</span>
              </button>
            );
          })}
        </div>

        {activeSection === 'restricted' && <RestrictedSection />}
        {activeSection === 'blocked' && <BlockedProfilesSection />}
        {activeSection === 'nicknames' && <BlockedNicknamesSection />}
        {activeSection === 'messages' && <BlockedSendersSection table="blocked_message_senders" title="Blocked Message Senders" description="Messages from these users will be blocked." />}
        {activeSection === 'app-invites' && <BlockedSendersSection table="blocked_app_invite_senders" title="Blocked App Invite Senders" description="App invites from these users will be blocked." />}
        {activeSection === 'event-invites' && <BlockedSendersSection table="blocked_event_invite_senders" title="Blocked Event Invite Senders" description="Event invites from these users will be blocked." />}
      </CardContent>
    </Card>
  );
};

function searchProfiles(userId: string | undefined, query: string): Promise<ProfileResult[]> {
  if (query.length < 2) return Promise.resolve([]);
  return supabase
    .from('profiles')
    .select('id, username, display_name, profile_pic')
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
    .neq('id', userId)
    .limit(10)
    .then(({ data }) => (data || []) as ProfileResult[]);
}

function enrichRows<T extends { target_id: string }>(
  rows: T[],
  profiles: ProfileResult[] | null
): (T & { display_name: string; username: string; profile_pic: string | null })[] {
  return rows.map(r => {
    const p = profiles?.find(pr => pr.id === r.target_id);
    return {
      ...r,
      display_name: p?.display_name || 'Unknown User',
      username: p?.username || 'unknown',
      profile_pic: p?.profile_pic || null,
    };
  });
}

const RestrictedSection = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<ActiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProfileResult[]>([]);
  const [adding, setAdding] = useState(false);

  const fetchRestricted = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('restricted_users')
        .select('id, restricted_user_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        setRows([]);
        return;
      }

      const ids = data.map(r => r.restricted_user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, display_name, profile_pic')
        .in('id', ids);

      setRows(data.map(r => {
        const p = profiles?.find(pr => pr.id === r.restricted_user_id);
        return {
          id: r.id,
          target_id: r.restricted_user_id,
          display_name: p?.display_name || 'Unknown User',
          username: p?.username || 'unknown',
          profile_pic: p?.profile_pic || null,
          created_at: r.created_at,
        };
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load restricted users';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => { fetchRestricted(); }, [fetchRestricted]);

  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    const results = await searchProfiles(user?.id, q);
    setSearchResults(results);
  }, [user?.id]);

  const addRestricted = async (targetId: string) => {
    setAdding(true);
    try {
      const { error } = await supabase
        .from('restricted_users')
        .insert({ user_id: user?.id, restricted_user_id: targetId });
      if (error) throw error;
      setSearchQuery('');
      setSearchResults([]);
      toast({ title: 'User restricted' });
      fetchRestricted();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to restrict user';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally { setAdding(false); }
  };

  const removeRestricted = async (id: string) => {
    try {
      await supabase.from('restricted_users').delete().eq('id', id);
      setRows(prev => prev.filter(r => r.id !== id));
      toast({ title: 'Restriction removed' });
    } catch {
      toast({ title: 'Error', description: 'Failed to remove restriction', variant: 'destructive' });
    }
  };

  useEffect(() => {
    if (!searchQuery) setSearchResults([]);
  }, [searchQuery]);

  return (
    <div className="space-y-4">
      <Popover open={searchResults.length > 0} onOpenChange={() => {}}>
        <PopoverTrigger asChild>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users to restrict..."
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-full p-2" align="start" sideOffset={8}>
          <div className="space-y-1">
            {searchResults.map(r => (
              <div key={r.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={r.profile_pic || undefined} />
                    <AvatarFallback>{(r.display_name || '?')[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{r.display_name}</p>
                    <p className="text-xs text-muted-foreground">@{r.username}</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => addRestricted(r.id)} disabled={adding}>
                  <Plus className="h-4 w-4 mr-1" /> Restrict
                </Button>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {loading ? (
        <div className="text-center py-4 text-muted-foreground">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8">
          <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No restricted users</h3>
          <p className="text-muted-foreground">Search for a user above to add them to your restricted list.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {rows.map(row => (
              <motion.div
                key={row.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex items-center justify-between p-3 border border-border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={row.profile_pic || undefined} />
                    <AvatarFallback>{row.display_name[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{row.display_name}</p>
                    <p className="text-xs text-muted-foreground">@{row.username}</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => removeRestricted(row.id)} className="hover:bg-destructive/10 hover:text-destructive">
                  <X className="h-4 w-4 mr-1" /> Remove
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

const BlockedProfilesSection = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBlockedUsers = useCallback(async () => {
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
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, display_name, profile_pic')
        .in('id', blockedIds);

      setBlockedUsers(blocks.map(block => ({
        ...block,
        blocked_user: profiles?.find(p => p.id === block.blocked_id) || {
          id: block.blocked_id, username: 'unknown', display_name: 'Unknown User', profile_pic: null
        }
      })));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load blocked users';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user?.id, toast]);

  useEffect(() => { fetchBlockedUsers(); }, [fetchBlockedUsers]);

  const unblockUser = async (blockId: string, username: string) => {
    try {
      await supabase.from('blocks').delete().eq('id', blockId);
      setBlockedUsers(prev => prev.filter(block => block.id !== blockId));
      toast({ title: 'User unblocked', description: `@${username} has been unblocked.` });
    } catch {
      toast({ title: 'Error', description: 'Failed to unblock user.', variant: 'destructive' });
    }
  };

  if (loading) return <div className="text-center py-4 text-muted-foreground">Loading blocked users...</div>;

  if (blockedUsers.length === 0) {
    return (
      <div className="text-center py-8">
        <Ban className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">No blocked profiles</h3>
        <p className="text-muted-foreground">You haven't blocked anyone yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <AnimatePresence>
        {blockedUsers.map((block) => (
          <motion.div
            key={block.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex items-center justify-between p-3 border border-border rounded-lg"
          >
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarImage src={block.blocked_user.profile_pic || undefined} />
                <AvatarFallback>{block.blocked_user.display_name[0]}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">{block.blocked_user.display_name}</p>
                <p className="text-xs text-muted-foreground">@{block.blocked_user.username}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted-foreground">Blocked {new Date(block.created_at).toLocaleDateString()}</p>
              <Button size="sm" variant="outline" onClick={() => unblockUser(block.id, block.blocked_user.username)}
                className="hover:bg-destructive/10 hover:text-destructive">
                Unblock
              </Button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

const BlockedNicknamesSection = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [nicknames, setNicknames] = useState<NicknameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNickname, setNewNickname] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchNicknames = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('blocked_nicknames')
        .select('id, nickname, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setNicknames((data || []) as NicknameRow[]);
    } catch {
      console.warn('Failed to fetch nicknames');
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { fetchNicknames(); }, [fetchNicknames]);

  const addNickname = async () => {
    if (!newNickname.trim()) return;
    setAdding(true);
    try {
      const { error } = await supabase
        .from('blocked_nicknames')
        .insert({ user_id: user?.id, nickname: newNickname.trim() });
      if (error) throw error;
      setNewNickname('');
      toast({ title: 'Nickname blocked' });
      fetchNicknames();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to block nickname';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally { setAdding(false); }
  };

  const removeNickname = async (id: string) => {
    try {
      await supabase.from('blocked_nicknames').delete().eq('id', id);
      setNicknames(prev => prev.filter(n => n.id !== id));
    } catch {
      toast({ title: 'Error', description: 'Failed to remove nickname', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Enter a nickname to block..."
          value={newNickname}
          onChange={e => setNewNickname(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addNickname()}
        />
        <Button onClick={addNickname} disabled={adding || !newNickname.trim()}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>
      {loading ? (
        <div className="text-center py-4 text-muted-foreground">Loading...</div>
      ) : nicknames.length === 0 ? (
        <div className="text-center py-8">
          <Slash className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No blocked nicknames</h3>
          <p className="text-muted-foreground">Add nicknames above to block them from interacting with you.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {nicknames.map(n => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex items-center justify-between p-3 border border-border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center">
                    <Slash className="h-4 w-4 text-destructive" />
                  </div>
                  <p className="text-sm font-medium">{n.nickname}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => removeNickname(n.id)}
                  className="hover:bg-destructive/10 hover:text-destructive">
                  <X className="h-4 w-4" />
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

interface SendersSectionProps {
  table: 'blocked_message_senders' | 'blocked_app_invite_senders' | 'blocked_event_invite_senders';
  title: string;
  description: string;
}

const BlockedSendersSection = ({ table, title, description }: SendersSectionProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<ActiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProfileResult[]>([]);

  const Icon = table === 'blocked_message_senders' ? MessageSquare
    : table === 'blocked_app_invite_senders' ? Bell : CalendarX;

  const fetchRows = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from(table)
        .select('id, blocked_user_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) { setRows([]); return; }

      const ids = data.map(r => r.blocked_user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, display_name, profile_pic')
        .in('id', ids);

      setRows(enrichRows(
        data.map(d => ({ id: d.id, target_id: d.blocked_user_id, created_at: d.created_at })),
        profiles
      ));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load data';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [user, table, toast]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    const results = await searchProfiles(user?.id, q);
    setSearchResults(results);
  }, [user?.id]);

  const addSender = async (targetId: string) => {
    try {
      const { error } = await supabase.from(table).insert({
        user_id: user?.id,
        blocked_user_id: targetId,
      } as never);
      if (error) throw error;
      setSearchQuery('');
      setSearchResults([]);
      toast({ title: 'Blocked' });
      fetchRows();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to block user';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  const removeSender = async (id: string) => {
    try {
      await supabase.from(table).delete().eq('id', id as never);
      setRows(prev => prev.filter(r => r.id !== id));
    } catch {
      toast({ title: 'Error', description: 'Failed to remove', variant: 'destructive' });
    }
  };

  useEffect(() => {
    if (!searchQuery) setSearchResults([]);
  }, [searchQuery]);

  return (
    <div className="space-y-4">
      <Popover open={searchResults.length > 0} onOpenChange={() => {}}>
        <PopoverTrigger asChild>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users to block..."
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-full p-2" align="start" sideOffset={8}>
          <div className="space-y-1">
            {searchResults.map(r => (
              <div key={r.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={r.profile_pic || undefined} />
                    <AvatarFallback>{(r.display_name || '?')[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{r.display_name}</p>
                    <p className="text-xs text-muted-foreground">@{r.username}</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => addSender(r.id)}>
                  <Plus className="h-4 w-4 mr-1" /> Block
                </Button>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {loading ? (
        <div className="text-center py-4 text-muted-foreground">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8">
          <Icon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">{title}</h3>
          <p className="text-muted-foreground">{description}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {rows.map(row => (
              <motion.div
                key={row.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex items-center justify-between p-3 border border-border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={row.profile_pic || undefined} />
                    <AvatarFallback>{row.display_name[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{row.display_name}</p>
                    <p className="text-xs text-muted-foreground">@{row.username}</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => removeSender(row.id)}
                  className="hover:bg-destructive/10 hover:text-destructive">
                  <X className="h-4 w-4 mr-1" /> Remove
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default BlockedUsersManager;
