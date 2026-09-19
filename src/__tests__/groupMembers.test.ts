// Frontend contract for the group Members UI (message.md). These pure helpers
// mirror the backend authorization rules (owner > moderator > member) so the
// UI shows the correct member actions. Every action is still re-authorized by
// the API Gateway server-side; these simply drive what the menu offers.
import { describe, it, expect } from 'vitest';
import {
  BAN_DURATION_PRESETS,
  RESTRICT_DURATION_PRESETS,
  canModerateAccess,
  computeMemberActions,
  formatDuration,
  groupRoleLabel,
  isActiveBan,
  isModeratorAccess,
  memberStatusLabel,
  moderationActionLabel,
  resolveEndsAt,
} from '@/lib/groupMembers';
import type { GroupMemberAccess } from '@/api/types';

const owner = { user_id: 'owner-id', role: 'admin', status: 'active' as const };
const moderator = { user_id: 'mod-id', role: 'moderator', status: 'active' as const };
const member = { user_id: 'member-id', role: 'member', status: 'active' as const };
const caller = 'caller-id';
const createdBy = 'owner-id';

const opts = { callerAccess: 'owner' as GroupMemberAccess, callerUserId: caller, groupCreatedBy: createdBy };

describe('canModerateAccess (owner > moderator > member)', () => {
  it('lets the owner moderate moderators and members', () => {
    expect(canModerateAccess('owner', moderator.user_id, moderator.role, createdBy)).toBe(true);
    expect(canModerateAccess('owner', member.user_id, member.role, createdBy)).toBe(true);
  });

  it('never lets the owner moderate the owner or another admin', () => {
    expect(canModerateAccess('owner', owner.user_id, 'admin', createdBy)).toBe(false);
    expect(canModerateAccess('owner', 'another-admin', 'admin', createdBy)).toBe(false);
  });

  it('lets a moderator moderate members only', () => {
    expect(canModerateAccess('moderator', member.user_id, member.role, createdBy)).toBe(true);
    expect(canModerateAccess('moderator', moderator.user_id, moderator.role, createdBy)).toBe(false);
    expect(canModerateAccess('moderator', owner.user_id, owner.role, createdBy)).toBe(false);
  });

  it('rejects members and non-members', () => {
    expect(canModerateAccess('member', member.user_id, member.role, createdBy)).toBe(false);
    expect(canModerateAccess('none', member.user_id, member.role, createdBy)).toBe(false);
  });
});

describe('computeMemberActions (what the per-member menu shows)', () => {
  it('gives the owner full control over an ordinary member', () => {
    const actions = computeMemberActions(member, opts);
    expect(actions.viewProfile).toBe(true);
    expect(actions.report).toBe(true);
    expect(actions.remove).toBe(true);
    expect(actions.restrictPosting).toBe(true);
    expect(actions.restrictAll).toBe(true);
    expect(actions.unrestrict).toBe(false);
  });

  it('hides destructive actions against yourself', () => {
    const me = { user_id: caller, role: 'member', status: 'active' as const };
    const actions = computeMemberActions(me, opts);
    expect(actions.remove).toBe(false);
    expect(actions.report).toBe(false);
    expect(actions.restrictPosting).toBe(false);
    expect(actions.restrictAll).toBe(false);
    expect(actions.viewProfile).toBe(true);
  });

  it('never lets a member manage another member', () => {
    const m = { callerAccess: 'member' as GroupMemberAccess, callerUserId: caller, groupCreatedBy: createdBy };
    const actions = computeMemberActions(member, m);
    expect(actions.remove).toBe(false);
    expect(actions.restrictPosting).toBe(false);
    expect(actions.restrictAll).toBe(false);
    expect(actions.unrestrict).toBe(false);
    expect(actions.report).toBe(true);
  });

  it('hides the owner from moderation, but keeps report for members', () => {
    const actions = computeMemberActions(owner, opts);
    expect(actions.remove).toBe(false);
    expect(actions.restrictPosting).toBe(false);
    expect(actions.restrictAll).toBe(false);
    expect(actions.report).toBe(true);
  });

  it('hides moderator management from a moderator, but not the owner', () => {
    const moderatorCaller = { ...opts, callerAccess: 'moderator' as GroupMemberAccess };
    expect(computeMemberActions(moderator, moderatorCaller).remove).toBe(false);
    expect(computeMemberActions(moderator, opts).remove).toBe(true);
  });

  it('exposes lift-restriction only while a restriction is active', () => {
    const restrictedMember = { user_id: 'restricted-id', role: 'member', status: 'restricted' as const };
    const postingRestricted = { user_id: 'posting-id', role: 'member', status: 'posting_restricted' as const };
    expect(computeMemberActions(restrictedMember, opts).unrestrict).toBe(true);
    expect(computeMemberActions(postingRestricted, opts).unrestrict).toBe(true);
    expect(computeMemberActions(member, opts).unrestrict).toBe(false);
  });

  it('omits restrict options already active for that member', () => {
    const restrictedMember = { user_id: 'restricted-id', role: 'member', status: 'restricted' as const };
    const postingRestricted = { user_id: 'posting-id', role: 'member', status: 'posting_restricted' as const };
    expect(computeMemberActions(restrictedMember, opts).restrictAll).toBe(false);
    expect(computeMemberActions(postingRestricted, opts).restrictPosting).toBe(false);
  });

  it('adds unban only for moderators in the banned section (caller-scoped)', () => {
    expect(isModeratorAccess('owner')).toBe(true);
    expect(isModeratorAccess('moderator')).toBe(true);
    expect(isModeratorAccess('member')).toBe(false);
    expect(isModeratorAccess('none')).toBe(false);
  });
});

describe('ban status', () => {
  it('an active ban without an expiry is permanent', () => {
    expect(isActiveBan({ status: 'active', expires_at: null })).toBe(true);
  });
  it('an active ban with a future expiry is active', () => {
    expect(isActiveBan({ status: 'active', expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString() })).toBe(true);
  });
  it('an expired or revoked ban is not active', () => {
    expect(isActiveBan({ status: 'active', expires_at: new Date(Date.now() - 1000).toISOString() })).toBe(false);
    expect(isActiveBan({ status: 'revoked', expires_at: null })).toBe(false);
  });
});

describe('role + status labels', () => {
  it('maps roles to friendly labels', () => {
    expect(groupRoleLabel('admin')).toBe('Admin');
    expect(groupRoleLabel('moderator')).toBe('Mod');
    expect(groupRoleLabel('member')).toBe('Member');
  });
  it('maps member status to friendly labels', () => {
    expect(memberStatusLabel('posting_restricted')).toBe('Posting restricted');
    expect(memberStatusLabel('restricted')).toBe('Restricted');
    expect(memberStatusLabel('active')).toBe('Active');
  });
  it('maps moderation actions to friendly labels', () => {
    expect(moderationActionLabel('remove')).toBe('Removed member');
    expect(moderationActionLabel('ban')).toBe('Banned member');
    expect(moderationActionLabel('unban')).toBe('Unbanned member');
    expect(moderationActionLabel('restrict')).toBe('Restricted member');
    expect(moderationActionLabel('unrestrict')).toBe('Lifted a restriction');
    expect(moderationActionLabel('post_removed')).toBe('Removed a post');
  });
});

describe('durations', () => {
  it('resolves preset durations to future ISO ends', () => {
    const before = Date.now();
    const ends = resolveEndsAt(RESTRICT_DURATION_PRESETS[0], null);
    expect(ends).not.toBeNull();
    const end = new Date(ends!).getTime();
    expect(end).toBeGreaterThan(before);
    expect(end).toBeLessThan(before + 24 * 60 * 60 * 1000 + 5000);
  });

  it('resolves permanent to no end', () => {
    const permanent = RESTRICT_DURATION_PRESETS.find((p) => p.kind === 'permanent')!;
    expect(resolveEndsAt(permanent, null)).toBeNull();
  });

  it('resolves custom hours to the right offset', () => {
    const custom = { label: 'Custom', kind: 'custom' as const };
    const before = Date.now();
    const ends = resolveEndsAt(custom, 48);
    const end = new Date(ends!).getTime();
    expect(end).toBeGreaterThan(before + 47 * 60 * 60 * 1000);
    expect(end).toBeLessThan(before + 49 * 60 * 60 * 1000);
  });

  it('formats durations as relative text', () => {
    const now = Date.now();
    expect(formatDuration(null)).toBe('Permanent');
    expect(formatDuration(new Date(now + 3600_000).toISOString(), now)).toBe('in 1 hour');
    expect(formatDuration(new Date(now + 3 * 86400_000).toISOString(), now)).toBe('in 3 days');
    expect(formatDuration(new Date(now - 86400_000).toISOString(), now)).toBe('1 day ago');
  });

  it('exposes sane default presets', () => {
    expect(RESTRICT_DURATION_PRESETS.length).toBeGreaterThanOrEqual(4);
    expect(BAN_DURATION_PRESETS.length).toBeGreaterThanOrEqual(4);
    expect(BAN_DURATION_PRESETS.some((p) => p.kind === 'permanent')).toBe(true);
  });
});