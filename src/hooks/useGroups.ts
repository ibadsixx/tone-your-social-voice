import { useState, useEffect } from 'react';
import { groupsApi } from '@/api';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import type { GroupMember, GroupPin } from '@/api/types';

export interface Group {
  id: string;
  name: string;
  description: string | null;
  privacy: string;
  rules_enabled?: boolean;
  cover_image: string | null;
  created_by: string | null;
  created_at: string;
  member_count?: number;
  is_member?: boolean;
  role?: 'admin' | 'moderator' | 'member';
  joined_at?: string;
  is_pinned?: boolean;
}

/** A group must be listed and counted once even if the API returns it twice. */
const dedupeGroups = (list: Group[]): Group[] => {
  const seen = new Set<string>();
  return list.filter((group) => {
    if (seen.has(group.id)) return false;
    seen.add(group.id);
    return true;
  });
};

export const useGroups = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  // A failed list request must surface as an error, never as a legitimate
  // "no groups" result (an API failure used to leave `groups` empty and the UI
  // rendered "You haven't joined any groups yet").
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchGroups = async () => {
    try {
      setLoading(true);
      setError(null);
      // The pinned-group rows only need the viewer's own id, and the group list
      // does not need them, so these two were awaited one after the other for no
      // reason. Issue them together; a pin failure must not hide the group list.
      //
      // "No viewer" is a null *request*, never a promise that resolves to null.
      // A promise is always truthy, so `Promise.resolve(null)` made the
      // `if (pinsRequest)` below unconditionally true and the guest path went on
      // to await `null` and destructure `.data` from it, which threw
      // "Cannot destructure property 'data' of '(intermediate value)' as it is
      // null" every time a guest opened a profile that had a post to render
      // (each Post card mounts SharePostModal, which mounts this hook).
      const pinsRequest = user ? groupsApi.getUserPinnedGroups(user.id) : null;

      const { data, error } = await groupsApi.getGroupsWithMembers();

      if (error) throw error;

      // The awaited value is read defensively as well: a pins response that
      // comes back absent is an empty pin set, not a crash, and a pins read
      // that fails outright degrades to "no pin state" rather than taking the
      // group list down with it. The failure is still reported, just not fatally.
      let pinRows: GroupPin[] = [];
      if (pinsRequest) {
        const pinResult = await pinsRequest.catch((err) => {
          console.warn('[useGroups] Could not load pinned groups:', err);
          return null;
        });
        pinRows = pinResult?.data ?? [];
      }
      const pinnedIds = new Set(pinRows.map(r => r.group_id));

      const groupsWithMemberInfo = data?.map(group => {
        const members = group.group_members || [];
        // Count distinct members: a duplicated membership row must not inflate
        // the count, and pending invitations / join requests never live in
        // `group_members`, so they are excluded by construction.
        const memberCount = new Set(members.map((m: GroupMember) => m.user_id)).size;
        const userMembership = user ? members.find((m: GroupMember) => m.user_id === user.id) : null;

        return {
          id: group.id,
          name: group.name,
          description: group.description,
          privacy: group.privacy || 'public',
          rules_enabled: group.rules_enabled,
          cover_image: group.cover_image ?? null,
          created_by: group.created_by ?? null,
          created_at: group.created_at,
          member_count: memberCount,
          is_member: !!userMembership,
          role: userMembership?.role as 'admin' | 'moderator' | 'member' | undefined,
          joined_at: userMembership?.created_at,
          is_pinned: pinnedIds.has(group.id),
        };
      }) || [];

      setGroups(dedupeGroups(groupsWithMemberInfo));
    } catch (error: any) {
      console.error('[useGroups] Failed to load groups:', error);
      const message = error?.message || 'Failed to load groups';
      setError(message);
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Joining/leaving MUST go through the Gateway's authorized
  // /api/v1/groups/:id/members routes. The generic /api/group_members
  // insert/delete routes are blocked server-side (a bare membership write would
  // bypass the owner/moderator authorization), so the previous
  // `groupsApi.joinGroup` call always failed and no membership row was created —
  // which is why the Joined tab stayed empty.
  const joinGroup = async (groupId: string) => {
    if (!user) return;

    try {
      const { error } = await groupsApi.joinGroupSecure(groupId, user.id);
      if (error) throw error;

      toast({ title: 'Success', description: 'Joined group successfully!' });
      await fetchGroups();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to join group',
        variant: 'destructive',
      });
    }
  };

  const leaveGroup = async (groupId: string) => {
    if (!user) return;

    try {
      const { error } = await groupsApi.leaveGroupSecure(groupId, user.id);
      if (error) throw error;

      toast({ title: 'Success', description: 'Left group successfully!' });
      await fetchGroups();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to leave group',
        variant: 'destructive',
      });
    }
  };

  const createGroup = async (name: string, description: string, privacy: string = 'public') => {
    if (!user) return;

    try {
      // The Gateway validates name/privacy, stamps created_by with the
      // authenticated user, and creates the owner membership row.
      const { data: newGroup, error: createError } = await groupsApi.createGroupSecure({
        name,
        description,
        privacy,
      });
      if (createError) throw createError;

      toast({ title: 'Success', description: 'Group created successfully!' });
      fetchGroups();
      return newGroup;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to create group',
        variant: 'destructive',
      });
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
  const getJoinedGroups = () => sortPinnedFirst(dedupeGroups(
    groups.filter(g => g.is_member && g.role !== 'admin')
  ));
  // Ownership is `groups.created_by`, not membership. The creator's owner
  // membership row (role 'admin') is the legacy fallback for groups whose
  // `created_by` was never backfilled.
  const getManagedGroups = () => sortPinnedFirst(dedupeGroups(
    groups.filter(g => (!!user && g.created_by === user.id) || (g.is_member && g.role === 'admin'))
  ));

  useEffect(() => {
    fetchGroups();
  }, [user]);

  return {
    groups,
    loading,
    error,
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
