// Shared shape for a channel participant as returned by the API Gateway's
// `get_channel_members` RPC (see gateway/src/api/routes.ts resolveChannelMembers).
// `role` is the actual membership role stored in conversation_participants:
// 'owner' | 'moderator' | 'follower'. Profile fields are enriched by the
// Gateway from the users host.
export interface ChannelMember {
  id?: string;
  user_id: string;
  username: string;
  display_name: string;
  profile_pic: string | null;
  role: string;
  joined_at?: string;
}

// The Moderators list is derived from the real membership rows: only rows whose
// stored role is exactly 'moderator'. The owner is therefore excluded unless the
// database explicitly represents the owner with role='moderator'. No count or
// name is ever hardcoded — this reads whatever get_channel_members returned.
export function deriveChannelModerators(members: ChannelMember[]): ChannelMember[] {
  return members
    .filter((member) => member.role === 'moderator')
    .sort((a, b) => {
      const nameA = (a.display_name || a.username || '').toLowerCase();
      const nameB = (b.display_name || b.username || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
}
