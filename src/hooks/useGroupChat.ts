import { useCallback } from 'react';
import { groupsApi } from '@/api';

interface GroupMember {
  user_id: string;
  username: string;
  display_name: string;
  profile_pic: string;
  role: string;
  joined_at: string;
}

export const useGroupChat = (conversationId?: string) => {
  const addMember = useCallback(async (newMemberId: string) => {
    if (!conversationId) return { error: 'No conversation ID' };
    const { error } = await groupsApi.addGroupMembersSecure(conversationId, [newMemberId]);
    return { error };
  }, [conversationId]);

  const removeMember = useCallback(async (memberId: string) => {
    if (!conversationId) return { error: 'No conversation ID' };
    const { data, error } = await groupsApi.removeGroupMemberSecure(conversationId, memberId, '');
    if (error || !data || data.status !== 'ok') {
      return { error: error?.message || data?.message || 'Failed to remove member' };
    }
    return { error: null };
  }, [conversationId]);

  const updateRole = useCallback(async (memberId: string, role: 'member' | 'admin') => {
    if (!conversationId) return { error: 'No conversation ID' };
    const { error } = await gateway.rpc('update_group_member_role', {
      p_conversation_id: conversationId,
      p_member_id: memberId,
      p_role: role,
    });
    return { error };
  }, [conversationId]);

  const getMembers = useCallback(async (): Promise<{ data: GroupMember[] | null; error: any }> => {
    if (!conversationId) return { data: null, error: 'No conversation ID' };
    const { data, error } = await gateway.rpc('get_group_members', {
      p_conversation_id: conversationId,
    });
    return { data: data as GroupMember[] | null, error };
  }, [conversationId]);

  return { addMember, removeMember, updateRole, getMembers };
};
