import { useState, useEffect } from 'react';
import { groupsApi } from '@/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import type { GroupMember } from '@/api/types';

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

      const { data, error } = await groupsApi.getGroupsWithMembers();

      if (error) throw error;

      let pinnedIds = new Set<string>();
      if (user) {
        const { data: pinRows } = await groupsApi.getUserPinnedGroups(user.id);
        pinnedIds = new Set((pinRows || []).map(r => r.group_id));
      }

      const groupsWithMemberInfo = data?.map(group => {
        const members = group.group_members || [];
        const memberCount = members.length;
        const userMembership = user ? members.find((m: GroupMember) => m.user_id === user.id) : null;

        return {
          id: group.id,
          name: group.name,
          description: group.description,
          created_at: group.created_at,
          member_count: memberCount,
          is_member: !!userMembership,
          role: userMembership?.role as 'admin' | 'moderator' | 'member' | undefined,
          joined_at: userMembership?.created_at,
          is_pinned: pinnedIds.has(group.id),
        };
      }) || [];

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
      const { error } = await groupsApi.joinGroup(groupId, user.id);
      if (error) throw error;

      toast({ title: 'Success', description: 'Joined group successfully!' });
      fetchGroups();
    } catch (error: any) {
      toast({ title: 'Error', description: 'Failed to join group', variant: 'destructive' });
    }
  };

  const leaveGroup = async (groupId: string) => {
    if (!user) return;

    try {
      const { error } = await groupsApi.leaveGroup(groupId, user.id);
      if (error) throw error;

      toast({ title: 'Success', description: 'Left group successfully!' });
      fetchGroups();
    } catch (error: any) {
      toast({ title: 'Error', description: 'Failed to leave group', variant: 'destructive' });
    }
  };

  const createGroup = async (name: string, description: string) => {
    if (!user) return;

    try {
      const { data: newGroup, error: createError } = await groupsApi.createGroup({ name, description });
      if (createError) throw createError;

      const { error: joinError } = await groupsApi.joinGroup(newGroup.id, user.id, 'admin');
      if (joinError) throw joinError;

      toast({ title: 'Success', description: 'Group created successfully!' });
      fetchGroups();
      return newGroup;
    } catch (error: any) {
      toast({ title: 'Error', description: 'Failed to create group', variant: 'destructive' });
    }
  };

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
