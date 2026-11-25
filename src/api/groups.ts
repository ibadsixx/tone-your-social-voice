import { dataClient } from '@/lib/supabase/dataClient';
import type { ApiResult } from '@/lib/supabase/dataClient';
import { callEdgeFunction } from '@/lib/supabase/crossProject';
import type {
  Group, GroupMember, GroupPost, GroupFollow, GroupPin, GroupRule,
  GroupMembersList, GroupMemberActionResult, GroupRestrictionType,
} from './types';
import type { GroupPrivacy } from '@/lib/groupSettings';

// Group settings, rules and moderation are server-authoritative. The browser
// sends the operation to the `groups` Edge Function, which verifies the caller's
// central Auth JWT and the group owner/moderator role before writing to the
// groups project. No privileged write is performed directly from the client.
function callGroupsFunction<T>(
  operation: string,
  input: Record<string, unknown>
): Promise<ApiResult<T>> {
  return callEdgeFunction<{ operation: string; input: Record<string, unknown> }, T>('groups', {
    operation,
    input,
  }) as Promise<ApiResult<T>>;
}

export async function createGroupSecure(input: {
  name: string;
  description?: string | null;
  privacy: GroupPrivacy | string;
}): Promise<ApiResult<Group>> {
  return callGroupsFunction<Group>('createGroup', input);
}

export async function updateGroupSettings(
  groupId: string,
  input: { name: string; description?: string | null; privacy: GroupPrivacy | string }
): Promise<ApiResult<Group>> {
  return callGroupsFunction<Group>('updateSettings', { groupId, ...input });
}

export async function updateGroupCover(
  groupId: string,
  coverImage: string | null
): Promise<ApiResult<Group>> {
  return callGroupsFunction<Group>('updateCover', { groupId, cover_image: coverImage });
}

export async function setGroupRulesEnabled(groupId: string, enabled: boolean): Promise<ApiResult<Group>> {
  return callGroupsFunction<Group>('setRulesEnabled', { groupId, rules_enabled: enabled });
}

export async function getGroupRules(groupId: string): Promise<ApiResult<GroupRule[]>> {
  return callGroupsFunction<GroupRule[]>('getRules', { groupId });
}

export async function addGroupRule(groupId: string, ruleText: string): Promise<ApiResult<GroupRule[]>> {
  return callGroupsFunction<GroupRule[]>('addRule', { groupId, rule_text: ruleText });
}

export async function updateGroupRule(
  groupId: string,
  ruleId: string,
  ruleText: string
): Promise<ApiResult<GroupRule[]>> {
  return callGroupsFunction<GroupRule[]>('updateRule', { groupId, ruleId, rule_text: ruleText });
}

export async function deleteGroupRule(groupId: string, ruleId: string): Promise<ApiResult<GroupRule[]>> {
  return callGroupsFunction<GroupRule[]>('deleteRule', { groupId, ruleId });
}

export async function reorderGroupRules(
  groupId: string,
  orderedIds: string[]
): Promise<ApiResult<GroupRule[]>> {
  return callGroupsFunction<GroupRule[]>('reorderRules', { groupId, ordered_ids: orderedIds });
}

const GROUP_SELECT_WITH_MEMBERS = `
  *,
  group_members!group_members_group_id_fkey (
    user_id,
    role,
    created_at
  )
`;

const GROUP_POST_SELECT = `
  id, message, created_at, shared_by,
  post:post_id (
    *,
    profiles!posts_user_id_fkey (username, display_name, profile_pic),
    likes (id, user_id),
    comments (id, content, profiles:user_id (display_name))
  )
`;

const GROUP_MEMBER_SELECT = `
  user_id,
  role,
  created_at,
  profiles:user_id (
    username,
    display_name,
    profile_pic
  )
`;

// --- Groups ---

export async function getGroupById(id: string): Promise<ApiResult<Group>> {
  return dataClient.from('groups').select('*').eq('id', id).single() as Promise<ApiResult<Group>>;
}

export async function getGroupsWithMembers(): Promise<ApiResult<(Group & { group_members: GroupMember[] })[]>> {
  return dataClient.from('groups').select(GROUP_SELECT_WITH_MEMBERS).order('created_at', { ascending: false }) as Promise<ApiResult<(Group & { group_members: GroupMember[] })[]>>;
}

export async function getGroupsByUser(userId: string): Promise<ApiResult<Group[]>> {
  return dataClient.from('groups').select('*').eq('admin_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<Group[]>>;
}

export async function createGroup(data: Partial<Group>): Promise<ApiResult<Group>> {
  return dataClient.from('groups').insert(data).select().single() as Promise<ApiResult<Group>>;
}

export async function updateGroup(id: string, data: Partial<Group>): Promise<ApiResult<null>> {
  return dataClient.from('groups').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteGroup(id: string): Promise<ApiResult<null>> {
  return dataClient.from('groups').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// --- Group Members ---

export async function getGroupMembers(groupId: string): Promise<ApiResult<GroupMember[]>> {
  return dataClient.from('group_members').select(GROUP_MEMBER_SELECT).eq('group_id', groupId) as Promise<ApiResult<GroupMember[]>>;
}

export async function joinGroup(groupId: string, userId: string, role: string = 'member'): Promise<ApiResult<null>> {
  return dataClient.from('group_members').insert({ group_id: groupId, user_id: userId, role }) as Promise<ApiResult<null>>;
}

export async function leaveGroup(groupId: string, userId: string): Promise<ApiResult<null>> {
  return dataClient.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId) as Promise<ApiResult<null>>;
}

export async function addGroupMembers(groupId: string, userIds: string[], role: string = 'member'): Promise<ApiResult<null>> {
  const rows = userIds.map(user_id => ({ group_id: groupId, user_id, role }));
  return dataClient.from('group_members').insert(rows) as Promise<ApiResult<null>>;
}

// These writes go through the `groups` Edge Function: the caller's identity is
// resolved from the verified central Auth JWT, and the owner→moderator→member
// hierarchy (plus ban/restriction semantics) is enforced there, never here.

export async function getGroupMembersSecure(groupId: string): Promise<ApiResult<GroupMembersList>> {
  return callGroupsFunction<GroupMembersList>('getMembers', { groupId });
}

export async function addGroupMembersSecure(groupId: string, userIds: string[]): Promise<ApiResult<GroupMemberActionResult>> {
  return callGroupsFunction<GroupMemberActionResult>('addMembers', { groupId, user_ids: userIds });
}

export async function joinGroupSecure(groupId: string, userId: string): Promise<ApiResult<GroupMemberActionResult>> {
  return callGroupsFunction<GroupMemberActionResult>('join', { groupId, user_id: userId });
}

export async function leaveGroupSecure(groupId: string, userId: string): Promise<ApiResult<GroupMemberActionResult>> {
  return callGroupsFunction<GroupMemberActionResult>('leave', { groupId, user_id: userId });
}

export async function removeGroupMemberSecure(
  groupId: string,
  memberId: string,
  reason?: string | null
): Promise<ApiResult<GroupMemberActionResult>> {
  return callGroupsFunction<GroupMemberActionResult>('removeMember', { groupId, memberId, reason: reason ?? null });
}

export async function reportGroupMemberSecure(
  groupId: string,
  memberId: string,
  input: { reason: string; description?: string | null }
): Promise<ApiResult<GroupMemberActionResult>> {
  return callGroupsFunction<GroupMemberActionResult>('reportMember', { groupId, memberId, ...input });
}

export async function restrictGroupMemberSecure(
  groupId: string,
  memberId: string,
  input: { restriction_type: GroupRestrictionType; ends_at?: string | null; reason?: string | null; rule_id?: string | null }
): Promise<ApiResult<GroupMemberActionResult>> {
  return callGroupsFunction<GroupMemberActionResult>('restrictMember', { groupId, memberId, ...input });
}

export async function unrestrictGroupMemberSecure(
  groupId: string,
  memberId: string,
  input?: { restriction_type?: GroupRestrictionType }
): Promise<ApiResult<GroupMemberActionResult>> {
  return callGroupsFunction<GroupMemberActionResult>('unrestrictMember', { groupId, memberId, ...(input || {}) });
}

export async function banGroupMemberSecure(
  groupId: string,
  memberId: string,
  input: { ends_at?: string | null; reason?: string | null; rule_id?: string | null }
): Promise<ApiResult<GroupMemberActionResult>> {
  return callGroupsFunction<GroupMemberActionResult>('banMember', { groupId, memberId, ...input });
}

export async function unbanGroupMemberSecure(
  groupId: string,
  memberId: string
): Promise<ApiResult<GroupMemberActionResult>> {
  return callGroupsFunction<GroupMemberActionResult>('unbanMember', { groupId, memberId });
}

// --- Group Posts ---

export async function getGroupPosts(groupId: string): Promise<ApiResult<GroupPost[]>> {
  return dataClient.from('group_posts').select(GROUP_POST_SELECT).eq('group_id', groupId).order('created_at', { ascending: false }) as Promise<ApiResult<GroupPost[]>>;
}

export async function createGroupPost(groupId: string, postId: string, sharedBy: string): Promise<ApiResult<null>> {
  return dataClient.from('group_posts').insert({ group_id: groupId, post_id: postId, shared_by: sharedBy }) as Promise<ApiResult<null>>;
}

export async function getUserGroupPosts(groupId: string, userId: string): Promise<ApiResult<GroupPost[]>> {
  return dataClient.from('group_posts').select(GROUP_POST_SELECT).eq('group_id', groupId).eq('shared_by', userId).order('created_at', { ascending: false }) as Promise<ApiResult<GroupPost[]>>;
}

export async function getGroupMediaPosts(groupId: string): Promise<ApiResult<GroupPost[]>> {
  return dataClient.from('group_posts').select(`
    id, created_at,
    post:post_id (media_url, media_type)
  `).eq('group_id', groupId).order('created_at', { ascending: false }) as Promise<ApiResult<GroupPost[]>>;
}

// --- Group Follows (inverse: row = unfollowed) ---

export async function getGroupFollowStatus(groupId: string, userId: string): Promise<ApiResult<GroupFollow>> {
  return dataClient.from('group_follows').select('id').eq('group_id', groupId).eq('user_id', userId).maybeSingle() as Promise<ApiResult<GroupFollow>>;
}

export async function unfollowGroup(groupId: string, userId: string): Promise<ApiResult<null>> {
  return dataClient.from('group_follows').insert({ group_id: groupId, user_id: userId }) as Promise<ApiResult<null>>;
}

export async function followGroup(groupId: string, userId: string): Promise<ApiResult<null>> {
  return dataClient.from('group_follows').delete().eq('group_id', groupId).eq('user_id', userId) as Promise<ApiResult<null>>;
}

// --- Group Pins ---

export async function getUserPinnedGroups(userId: string): Promise<ApiResult<GroupPin[]>> {
  return dataClient.from('group_pins').select('group_id').eq('user_id', userId) as Promise<ApiResult<GroupPin[]>>;
}

export async function getGroupPinStatus(groupId: string, userId: string): Promise<ApiResult<GroupPin>> {
  return dataClient.from('group_pins').select('id').eq('group_id', groupId).eq('user_id', userId).maybeSingle() as Promise<ApiResult<GroupPin>>;
}

export async function pinGroup(groupId: string, userId: string): Promise<ApiResult<null>> {
  return dataClient.from('group_pins').insert({ group_id: groupId, user_id: userId }) as Promise<ApiResult<null>>;
}

export async function unpinGroup(groupId: string, userId: string): Promise<ApiResult<null>> {
  return dataClient.from('group_pins').delete().eq('group_id', groupId).eq('user_id', userId) as Promise<ApiResult<null>>;
}
