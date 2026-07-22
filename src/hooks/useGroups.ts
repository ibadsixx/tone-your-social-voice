import { useState, useEffect } from 'react';
import { gateway } from '@/lib/gateway';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export interface Group {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  member_count?: number;
  is_member?: boolean;
  role?: 'admin' | 'moderator' | 'member';
  joined_at?: string;
  is_pinned?: boolean;
}

export const useGroups = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchGroups = async () => {
    try {
      setLoading(true);
      console.log('[useGroups] Fetching groups...', { userId: user?.id });
      
      const { data, error } = await gateway
        .from('groups')
        .select(`
          *,
          group_members!group_members_group_id_fkey (
            user_id,
            role,
            created_at
          )
        `)
        .order('created_at', { ascending: false });

      console.log('[useGroups] Query result:', { data, error, rowCount: data?.length });

      if (error) {
        console.error('[useGroups] Supabase error:', error);
        throw error;
      }

      // Fetch the user's pinned group ids
      let pinnedIds = new Set<string>();
      if (user) {
        const { data: pinRows } = await gateway
          .from('group_pins' as any)
          .select('group_id')
          .eq('user_id', user.id);
        pinnedIds = new Set((pinRows || []).map((r: any) => r.group_id));
      }

      const groupsWithMemberInfo = data?.map(group => {
        const memberCount = group.group_members?.length || 0;
        const userMembership = user ? group.group_members?.find(m => m.user_id === user.id) : null;
        
        return {
          id: group.id,
          name: group.name,
          description: group.description,
          created_at: group.created_at,
          member_count: memberCount,
          is_member: !!userMembership,
          role: userMembership?.role,
          joined_at: userMembership?.created_at,
          is_pinned: pinnedIds.has(group.id),
        };
      }) || [];

      console.log('[useGroups] Processed groups:', groupsWithMemberInfo.length);
      setGroups(groupsWithMemberInfo);
    } catch (error: any) {
      console.error('[useGroups] Failed to load groups:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load groups',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const joinGroup = async (groupId: string) => {
    if (!user) return;

    try {
      const { error } = await gateway
        .from('group_members')
        .insert({ group_id: groupId, user_id: user.id, role: 'member' });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Joined group successfully!'
      });

      fetchGroups(); // Refresh data
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to join group',
        variant: 'destructive'
      });
    }
  };

  const leaveGroup = async (groupId: string) => {
    if (!user) return;

    try {
      const { error } = await gateway
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Left group successfully!'
      });

      fetchGroups(); // Refresh data
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to leave group',
        variant: 'destructive'
      });
    }
  };

  const createGroup = async (name: string, description: string) => {
    if (!user) return;

    try {
      const { data: newGroup, error: createError } = await gateway
        .from('groups')
        .insert({ name, description })
        .select()
        .single();

      if (createError) throw createError;

      // Auto-join the creator as admin
      const { error: joinError } = await gateway
        .from('group_members')
        .insert({ group_id: newGroup.id, user_id: user.id, role: 'admin' });

      if (joinError) throw joinError;

      toast({
        title: 'Success',
        description: 'Group created successfully!'
      });

      fetchGroups(); // Refresh data
      return newGroup;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to create group',
        variant: 'destructive'
      });
    }
  };

  // Get different categories of groups
  const getSuggestedGroups = () => groups.filter(g => !g.is_member).slice(0, 6);
  const getNewGroups = () => groups.filter(g => !g.is_member).sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ).slice(0, 6);
  const getMostActiveGroups = () => groups.filter(g => !g.is_member)
    .sort((a, b) => (b.member_count || 0) - (a.member_count || 0)).slice(0, 6);
  const sortPinnedFirst = (list: Group[]) =>
    [...list].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));
  const getJoinedGroups = () => sortPinnedFirst(groups.filter(g => g.is_member && g.role !== 'admin'));
  const getManagedGroups = () => sortPinnedFirst(groups.filter(g => g.is_member && g.role === 'admin'));

  useEffect(() => {
    fetchGroups();
  }, [user]);

  return {
    groups,
    loading,
    fetchGroups,
    joinGroup,
    leaveGroup,
    createGroup,
    getSuggestedGroups,
    getNewGroups,
    getMostActiveGroups,
    getJoinedGroups,
    getManagedGroups
  };
};