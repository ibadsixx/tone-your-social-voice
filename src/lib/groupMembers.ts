import type {
  EnrichedGroupMember,
  GroupBanRow,
  GroupMemberAccess,
  GroupRestrictionType,
} from '@/api/types';

// Shared, pure helpers for the group Members UI (message.md). These mirror the
// backend authorization rules so the UI shows the right actions, but every
// write is re-authorized by the API Gateway server-side — the UI logic here is
// never the source of truth.

export const GROUP_REPORT_REASONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'fake_account', label: 'Fake account' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'inappropriate_content', label: 'Inappropriate content' },
  { value: 'other', label: 'Other' },
];

export const GROUP_RESTRICTION_TYPES: ReadonlyArray<{ value: GroupRestrictionType; label: string; description: string }> = [
  {
    value: 'posting',
    label: 'Restrict posting',
    description: 'They can still read, but cannot share posts in this group.',
  },
  {
    value: 'all',
    label: 'Restrict member',
    description: 'Blocks all interactions with the group for the selected duration.',
  },
];

export interface RestrictionOption {
  label: string;
  hours?: number;
  kind: 'hours' | 'permanent' | 'custom';
}

export const RESTRICT_DURATION_PRESETS: RestrictionOption[] = [
  { label: '24 hours', hours: 24, kind: 'hours' },
  { label: '3 days', hours: 72, kind: 'hours' },
  { label: '7 days', hours: 168, kind: 'hours' },
  { label: 'No end date', kind: 'permanent' },
];

export const BAN_DURATION_PRESETS: RestrictionOption[] = [
  { label: '24 hours', hours: 24, kind: 'hours' },
  { label: '3 days', hours: 72, kind: 'hours' },
  { label: '7 days', hours: 168, kind: 'hours' },
  { label: '30 days', hours: 720, kind: 'hours' },
  { label: 'Permanent', kind: 'permanent' },
];

// Mirror of the gateway `canModerate` (owner > moderator > member; the owner can
// moderate moderators, but never self or another admin/owner).
export function canModerateAccess(
  callerAccess: GroupMemberAccess,
  targetUserId: string,
  targetRole: string | null,
  groupCreatedBy: string | null
): boolean {
  if (callerAccess !== 'owner' && callerAccess !== 'moderator') return false;
  if (targetUserId === groupCreatedBy) return false;
  if (targetRole === 'admin') return false;
  if (targetRole === 'moderator') return callerAccess === 'owner';
  return true;
}

export function isModeratorAccess(access: GroupMemberAccess): boolean {
  return access === 'owner' || access === 'moderator';
}

export interface MemberActions {
  viewProfile: boolean;
  report: boolean;
  remove: boolean;
  restrictPosting: boolean;
  restrictAll: boolean;
  unrestrict: boolean;
}

// Which actions the Member menu shows for one member, given the caller's access
// (from the Gateway response) and the target's role/status.
export function computeMemberActions(
  member: Pick<EnrichedGroupMember, 'user_id' | 'role' | 'status'>,
  opts: { callerAccess: GroupMemberAccess; callerUserId?: string; groupCreatedBy: string | null }
): MemberActions {
  const isSelf = member.user_id === opts.callerUserId;
  const moderation = canModerateAccess(opts.callerAccess, member.user_id, member.role, opts.groupCreatedBy);
  const isMember =
    opts.callerAccess === 'owner' || opts.callerAccess === 'moderator' || opts.callerAccess === 'member';
  return {
    viewProfile: true,
    report: !isSelf && isMember,
    remove: !isSelf && moderation,
    restrictPosting: !isSelf && moderation && member.status !== 'posting_restricted',
    restrictAll: !isSelf && moderation && member.status !== 'restricted',
    unrestrict: !isSelf && moderation && member.status !== 'active',
  };
}

export function isActiveBan(ban: Pick<GroupBanRow, 'status' | 'expires_at'>, now = Date.now()): boolean {
  return ban.status === 'active' && (!ban.expires_at || new Date(ban.expires_at).getTime() > now);
}

export function groupRoleLabel(role: string | null | undefined): string {
  if (role === 'admin') return 'Admin';
  if (role === 'moderator') return 'Mod';
  return 'Member';
}

export function memberStatusLabel(status: string): string {
  if (status === 'posting_restricted') return 'Posting restricted';
  if (status === 'restricted') return 'Restricted';
  return 'Active';
}

export function moderationActionLabel(action: string): string {
  switch (action) {
    case 'remove':
      return 'Removed member';
    case 'ban':
      return 'Banned member';
    case 'unban':
      return 'Unbanned member';
    case 'restrict':
      return 'Restricted member';
    case 'unrestrict':
      return 'Lifted a restriction';
    case 'post_removed':
      return 'Removed a post';
    default:
      return action;
  }
}

// "24 hours", "3 days", "Permanent" / "in 3 days", "3 days ago".
export function formatDuration(endsAt: string | null, now = Date.now()): string {
  if (!endsAt) return 'Permanent';
  const end = new Date(endsAt).getTime();
  const diffMs = end - now;
  const totalMins = Math.round(Math.abs(diffMs) / 60000);
  const days = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  const mins = totalMins % 60;
  const past = diffMs < 0;
  let units: string;
  if (days > 0) units = `${days} ${days === 1 ? 'day' : 'days'}`;
  else if (hours > 0) units = `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  else units = `${totalMins} ${totalMins === 1 ? 'minute' : 'minutes'}`;
  return past ? `${units} ago` : `in ${units}`;
}

export function formatEndsAt(endsAt: string | null): string {
  if (!endsAt) return 'Permanent';
  return new Date(endsAt).toLocaleString();
}

export function resolveEndsAt(option: RestrictionOption, customHours: number | null): string | null {
  if (option.kind === 'permanent' || option.kind === 'custom') {
    if (option.kind === 'custom' && customHours) {
      return new Date(Date.now() + customHours * 60 * 60 * 1000).toISOString();
    }
    if (option.kind === 'custom') return null;
    return null;
  }
  return new Date(Date.now() + (option.hours || 0) * 60 * 60 * 1000).toISOString();
}