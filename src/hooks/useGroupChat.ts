import { useCallback } from 'react';
import { gateway } from '@/lib/gateway';

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
    const { error } = await gateway.rpc('add_group_member', {
      p_conversation_id: conversationId,
      p_new_member_id: newMemberId,
    });
    return { error };
  }, [conversationId]);

  const removeMember = useCallback(async (memberId: string) => {
    if (!conversationId) return { error: 'No conversation ID' };
    const { error } = await gateway.rpc('remove_group_member', {
      p_conversation_id: conversationId,
      p_member_id: memberId,
    });
    return { error };
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
