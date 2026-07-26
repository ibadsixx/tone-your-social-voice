import { gateway } from './client';
import type { ApiResult } from './client';
import type { Group, GroupMember, GroupPost, GroupFollow, GroupPin } from './types';

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
  return gateway.from('groups').select('*').eq('id', id).single() as Promise<ApiResult<Group>>;
}

export async function getGroupsWithMembers(): Promise<ApiResult<(Group & { group_members: GroupMember[] })[]>> {
  return gateway.from('groups').select(GROUP_SELECT_WITH_MEMBERS).order('created_at', { ascending: false }) as Promise<ApiResult<(Group & { group_members: GroupMember[] })[]>>;
}

export async function getGroupsByUser(userId: string): Promise<ApiResult<Group[]>> {
  return gateway.from('groups').select('*').eq('admin_id', userId).order('created_at', { ascending: false }) as Promise<ApiResult<Group[]>>;
}

export async function createGroup(data: Partial<Group>): Promise<ApiResult<Group>> {
  return gateway.from('groups').insert(data).select().single() as Promise<ApiResult<Group>>;
}

export async function updateGroup(id: string, data: Partial<Group>): Promise<ApiResult<null>> {
  return gateway.from('groups').update(data).eq('id', id) as Promise<ApiResult<null>>;
}

export async function deleteGroup(id: string): Promise<ApiResult<null>> {
  return gateway.from('groups').delete().eq('id', id) as Promise<ApiResult<null>>;
}

// --- Group Members ---

export async function getGroupMembers(groupId: string): Promise<ApiResult<GroupMember[]>> {
  return gateway.from('group_members').select(GROUP_MEMBER_SELECT).eq('group_id', groupId) as Promise<ApiResult<GroupMember[]>>;
}

export async function joinGroup(groupId: string, userId: string, role: string = 'member'): Promise<ApiResult<null>> {
  return gateway.from('group_members').insert({ group_id: groupId, user_id: userId, role }) as Promise<ApiResult<null>>;
}

export async function leaveGroup(groupId: string, userId: string): Promise<ApiResult<null>> {
  return gateway.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId) as Promise<ApiResult<null>>;
}

export async function addGroupMembers(groupId: string, userIds: string[], role: string = 'member'): Promise<ApiResult<null>> {
  const rows = userIds.map(user_id => ({ group_id: groupId, user_id, role }));
  return gateway.from('group_members').insert(rows) as Promise<ApiResult<null>>;
}

// --- Group Posts ---

export async function getGroupPosts(groupId: string): Promise<ApiResult<GroupPost[]>> {
  return gateway.from('group_posts').select(GROUP_POST_SELECT).eq('group_id', groupId).order('created_at', { ascending: false }) as Promise<ApiResult<GroupPost[]>>;
}

export async function createGroupPost(groupId: string, postId: string, sharedBy: string): Promise<ApiResult<null>> {
  return gateway.from('group_posts').insert({ group_id: groupId, post_id: postId, shared_by: sharedBy }) as Promise<ApiResult<null>>;
}

export async function getUserGroupPosts(groupId: string, userId: string): Promise<ApiResult<GroupPost[]>> {
  return gateway.from('group_posts').select(GROUP_POST_SELECT).eq('group_id', groupId).eq('shared_by', userId).order('created_at', { ascending: false }) as Promise<ApiResult<GroupPost[]>>;
}

export async function getGroupMediaPosts(groupId: string): Promise<ApiResult<GroupPost[]>> {
  return gateway.from('group_posts').select(`
    id, created_at,
    post:post_id (media_url, media_type)
  `).eq('group_id', groupId).order('created_at', { ascending: false }) as Promise<ApiResult<GroupPost[]>>;
}

// --- Group Follows (inverse: row = unfollowed) ---

export async function getGroupFollowStatus(groupId: string, userId: string): Promise<ApiResult<GroupFollow>> {
  return gateway.from('group_follows').select('id').eq('group_id', groupId).eq('user_id', userId).maybeSingle() as Promise<ApiResult<GroupFollow>>;
}

export async function unfollowGroup(groupId: string, userId: string): Promise<ApiResult<null>> {
  return gateway.from('group_follows').insert({ group_id: groupId, user_id: userId }) as Promise<ApiResult<null>>;
}

export async function followGroup(groupId: string, userId: string): Promise<ApiResult<null>> {
  return gateway.from('group_follows').delete().eq('group_id', groupId).eq('user_id', userId) as Promise<ApiResult<null>>;
}

// --- Group Pins ---

export async function getUserPinnedGroups(userId: string): Promise<ApiResult<GroupPin[]>> {
  return gateway.from('group_pins').select('group_id').eq('user_id', userId) as Promise<ApiResult<GroupPin[]>>;
}

export async function getGroupPinStatus(groupId: string, userId: string): Promise<ApiResult<GroupPin>> {
  return gateway.from('group_pins').select('id').eq('group_id', groupId).eq('user_id', userId).maybeSingle() as Promise<ApiResult<GroupPin>>;
}

export async function pinGroup(groupId: string, userId: string): Promise<ApiResult<null>> {
  return gateway.from('group_pins').insert({ group_id: groupId, user_id: userId }) as Promise<ApiResult<null>>;
}

export async function unpinGroup(groupId: string, userId: string): Promise<ApiResult<null>> {
  return gateway.from('group_pins').delete().eq('group_id', groupId).eq('user_id', userId) as Promise<ApiResult<null>>;
}
