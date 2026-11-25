// Server-authoritative Groups operations.
//
// The browser sends { operation, input } to this Function. Identity comes only
// from the verified central Auth JWT; any client-supplied user_id is checked
// against it and never used as the actor. The groups project is written with a
// service-role client obtained only from Function secrets. Cross-project profile
// details for the member list are read from the profiles project (also service
// role, held only here). No general CRUD proxy is exposed: the operation names
// below are the complete whitelist.
//
// Function secrets: CENTRAL_AUTH_URL, CENTRAL_AUTH_ANON_KEY,
// GROUPS_PROJECT_URL, GROUPS_SERVICE_ROLE_KEY,
// PROFILES_PROJECT_URL, PROFILES_SERVICE_ROLE_KEY.

import { operationId, serviceClient } from '../_shared/crossProject.ts';
import {
  assertFields,
  badRequest,
  bool,
  forbidden,
  handleRequest,
  notFound,
  ok,
  oneOf,
  optionalIso,
  optionalText,
  optionalUuid,
  requireUuid,
  requireValue,
  uuidArray,
  type VerifiedContext,
} from '../_shared/operation.ts';

type Client = ReturnType<typeof serviceClient>;
type Role = 'owner' | 'admin' | 'moderator' | 'member' | 'none';

const OPERATIONS = [
  'createGroup', 'updateSettings', 'updateCover', 'setRulesEnabled',
  'getRules', 'addRule', 'updateRule', 'deleteRule', 'reorderRules',
  'getMembers', 'addMembers', 'join', 'leave', 'removeMember',
  'reportMember', 'restrictMember', 'unrestrictMember', 'banMember', 'unbanMember',
] as const;

const PRIVACY = ['public', 'private', 'closed'] as const;
const RESTRICTIONS = ['posting', 'all'] as const;
const REPORT_REASONS = ['fake_account', 'harassment', 'inappropriate_content', 'other'] as const;
const RULE_TEXT_MAX = 500;

function groupClient(): Client {
  return serviceClient('GROUPS_PROJECT_URL', 'GROUPS_SERVICE_ROLE_KEY');
}

async function loadGroup(client: Client, groupId: string) {
  const { data, error } = await client
    .from('groups')
    .select('id, name, description, privacy, rules_enabled, created_by')
    .eq('id', groupId)
    .maybeSingle();
  if (error) throw error;
  if (!data) notFound('Group not found');
  return data as Record<string, unknown>;
}

async function roleInGroup(client: Client, groupId: string, callerId: string): Promise<Role> {
  const group = await loadGroup(client, groupId);
  if (group.created_by === callerId) return 'owner';
  const { data, error } = await client
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', callerId)
    .maybeSingle();
  if (error) throw error;
  const role = data?.role;
  return role === 'admin' || role === 'moderator' ? role : role === 'member' ? 'member' : 'none';
}

function requireRole(role: Role, ...allowed: Role[]): void {
  if (!allowed.includes(role)) forbidden('Group permission required');
}

function inputOf(ctx: VerifiedContext): Record<string, unknown> {
  if (!ctx.body.operation || typeof ctx.body.operation !== 'string') badRequest('Invalid operation');
  assertFields(ctx.body, ['operation', 'input']);
  const input = ctx.body.input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) badRequest('Invalid input');
  return input as Record<string, unknown>;
}

async function withOperation(ctx: VerifiedContext, handler: (input: Record<string, unknown>, client: Client) => Promise<Response>): Promise<Response> {
  const operation = ctx.body.operation as (typeof OPERATIONS)[number];
  if (!(OPERATIONS as readonly string[]).includes(operation)) badRequest('Unknown group operation');
  const input = inputOf(ctx);
  return handler(input, groupClient());
}

async function listRules(client: Client, groupId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await client
    .from('group_rules')
    .select('id, group_id, rule_text, position, created_at, updated_at')
    .eq('group_id', groupId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}

async function logAction(
  client: Client,
  groupId: string,
  action: 'remove' | 'ban' | 'unban' | 'restrict' | 'unrestrict',
  targetUserId: string,
  actorId: string,
  extra: Record<string, unknown>
): Promise<void> {
  const id = await operationId(actorId, `group-action:${action}`, { groupId, targetUserId, ...extra });
  const { error } = await client.from('group_moderation_actions').upsert({
    id,
    group_id: groupId,
    action,
    target_user_id: targetUserId,
    actor_id: actorId,
    reason: extra.reason ?? null,
    rule_id: extra.rule_id ?? null,
    ends_at: extra.ends_at ?? null,
    created_at: new Date().toISOString(),
  }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw error;
}

async function activeBan(client: Client, groupId: string, userId: string): Promise<boolean> {
  const { data, error } = await client
    .from('group_member_bans')
    .select('expires_at')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .eq('status', 'active');
  if (error) throw error;
  return (data ?? []).some((row) => !row.expires_at || Date.parse(row.expires_at) > Date.now());
}

async function memberList(ctx: VerifiedContext, input: Record<string, unknown>, client: Client): Promise<Response> {
  assertFields(input, ['groupId']);
  const groupId = requireUuid(input.groupId, 'groupId');
  const role = await roleInGroup(client, groupId, ctx.callerId);
  const group = await loadGroup(client, groupId);
  if (role === 'none' && group.privacy !== 'public') forbidden('Group membership required');

  const [members, bans, restrictions, moderation] = await Promise.all([
    client.from('group_members')
      .select('group_id, user_id, role, created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true }),
    client.from('group_member_bans')
      .select('id, group_id, user_id, banned_by, reason, created_at, expires_at, status')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false }),
    client.from('group_member_restrictions')
      .select('id, group_id, user_id, restriction_type, ends_at, reason, rule_id, created_at, status')
      .eq('group_id', groupId)
      .eq('status', 'active'),
    client.from('group_moderation_actions')
      .select('id, group_id, action, target_user_id, actor_id, reason, ends_at, created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  for (const result of [members, bans, restrictions, moderation]) if (result.error) throw result.error;

  const now = Date.now();
  const activeRestrictions = (restrictions.data ?? []).filter((row) => !row.ends_at || Date.parse(row.ends_at) > now);
  const ids = [...new Set([
    ...(members.data ?? []).map((row) => row.user_id),
    ...(bans.data ?? []).map((row) => row.user_id),
    ...(moderation.data ?? []).flatMap((row) => [row.target_user_id, row.actor_id]),
  ].filter((id): id is string => typeof id === 'string'))].slice(0, 300);

  const profileById = new Map<string, Record<string, unknown>>();
  if (ids.length > 0) {
    const profiles = serviceClient('PROFILES_PROJECT_URL', 'PROFILES_SERVICE_ROLE_KEY');
    const { data, error } = await profiles
      .from('profiles')
      .select('id, username, display_name, profile_pic, last_seen_at')
      .in('id', ids);
    if (error) throw error;
    for (const row of data ?? []) profileById.set(row.id, row as Record<string, unknown>);
  }

  const enriched = (members.data ?? []).map((member) => {
    const own = activeRestrictions.filter((row) => row.user_id === member.user_id);
    const restriction = own.find((row) => row.restriction_type === 'all') ?? own[0] ?? null;
    return {
      ...member,
      profiles: profileById.get(member.user_id) ?? null,
      restriction: restriction ? {
        restriction_type: restriction.restriction_type,
        ends_at: restriction.ends_at ?? null,
        reason: restriction.reason ?? null,
        rule_id: restriction.rule_id ?? null,
        created_at: restriction.created_at,
      } : null,
      status: restriction ? (restriction.restriction_type === 'all' ? 'restricted' : 'posting_restricted') : 'active',
    };
  });

  return ok({
    status: 'ok',
    your_access: role,
    members: enriched,
    banned: (bans.data ?? []).map((row) => ({ ...row, profiles: profileById.get(row.user_id) ?? null })),
    moderation: (moderation.data ?? []).map((row) => ({
      ...row,
      actor_profile: profileById.get(row.actor_id) ?? null,
      target_profile: profileById.get(row.target_user_id) ?? null,
    })),
  });
}

Deno.serve((req) => handleRequest(req, ['POST'], async (ctx) => {
  return withOperation(ctx, async (input, client) => {
    const operation = ctx.body.operation as (typeof OPERATIONS)[number];

    if (operation === 'createGroup') {
      assertFields(input, ['name', 'description', 'privacy']);
      const name = requireValue(input.name, 'name').slice(0, 120);
      const description = optionalText(input.description, 'description', 2_000);
      const privacy = oneOf(input.privacy, 'privacy', PRIVACY);
      // A retry carrying the same Idempotency-Key targets the same primary key.
      const id = await operationId(ctx.callerId, 'createGroup', idempotentInput(ctx, { name, description, privacy }));
      const { error } = await client.from('groups').upsert({
        id, name, description, privacy, created_by: ctx.callerId,
      }, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
      await client.from('group_members').upsert({
        group_id: id, user_id: ctx.callerId, role: 'admin',
      }, { onConflict: 'group_id,user_id', ignoreDuplicates: true });
      // Read after the write: a retry with the same key returns the same row.
      const { data: row, error: readError } = await client.from('groups').select('*').eq('id', id).single();
      if (readError) throw readError;
      return ok(row);
    }

    const groupId = requireUuid(input.groupId, 'groupId');

    if (operation === 'updateSettings') {
      assertFields(input, ['groupId', 'name', 'description', 'privacy']);
      const role = await roleInGroup(client, groupId, ctx.callerId);
      requireRole(role, 'owner', 'admin');
      const { data, error } = await client.from('groups').update({
        name: requireValue(input.name, 'name').slice(0, 120),
        description: optionalText(input.description, 'description', 2_000),
        privacy: oneOf(input.privacy, 'privacy', PRIVACY),
      }).eq('id', groupId).select().single();
      if (error) throw error;
      return ok(data);
    }

    if (operation === 'updateCover') {
      assertFields(input, ['groupId', 'cover_image']);
      const role = await roleInGroup(client, groupId, ctx.callerId);
      requireRole(role, 'owner', 'admin');
      const cover = optionalText(input.cover_image, 'cover_image', 2_000);
      const { data, error } = await client.from('groups').update({ cover_image: cover }).eq('id', groupId).select().single();
      if (error) throw error;
      return ok(data);
    }

    if (operation === 'setRulesEnabled') {
      assertFields(input, ['groupId', 'rules_enabled']);
      const role = await roleInGroup(client, groupId, ctx.callerId);
      requireRole(role, 'owner', 'admin');
      const { data, error } = await client.from('groups')
        .update({ rules_enabled: bool(input.rules_enabled, 'rules_enabled') })
        .eq('id', groupId).select().single();
      if (error) throw error;
      return ok(data);
    }

    if (operation === 'getRules') {
      assertFields(input, ['groupId']);
      const role = await roleInGroup(client, groupId, ctx.callerId);
      const group = await loadGroup(client, groupId);
      if (role === 'none' && group.privacy !== 'public') forbidden('Group membership required');
      // Rule visibility follows the feature flag; closed groups still expose
      // their rules to members even when the widget is switched off.
      return ok(group.rules_enabled === true || role !== 'none' ? await listRules(client, groupId) : []);
    }

    if (operation === 'addRule') {
      assertFields(input, ['groupId', 'rule_text']);
      const role = await roleInGroup(client, groupId, ctx.callerId);
      requireRole(role, 'owner', 'admin');
      const ruleText = requireValue(input.rule_text, 'rule_text').slice(0, RULE_TEXT_MAX);
      const existing = await listRules(client, groupId);
      const id = await operationId(ctx.callerId, 'group:addRule', idempotentInput(ctx, { groupId, ruleText }));
      const { error } = await client.from('group_rules').upsert({
        id, group_id: groupId, rule_text: ruleText,
        position: existing.length, updated_at: new Date().toISOString(),
      }, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
      return ok(await listRules(client, groupId));
    }

    if (operation === 'updateRule') {
      assertFields(input, ['groupId', 'ruleId', 'rule_text']);
      const role = await roleInGroup(client, groupId, ctx.callerId);
      requireRole(role, 'owner', 'admin');
      const ruleId = requireUuid(input.ruleId, 'ruleId');
      const { data: found, error: findError } = await client.from('group_rules')
        .select('id').eq('id', ruleId).eq('group_id', groupId).maybeSingle();
      if (findError) throw findError;
      if (!found) notFound('Rule not found');
      const { error } = await client.from('group_rules').update({
        rule_text: requireValue(input.rule_text, 'rule_text').slice(0, RULE_TEXT_MAX),
        updated_at: new Date().toISOString(),
      }).eq('id', ruleId).eq('group_id', groupId);
      if (error) throw error;
      return ok(await listRules(client, groupId));
    }

    if (operation === 'deleteRule') {
      assertFields(input, ['groupId', 'ruleId']);
      const role = await roleInGroup(client, groupId, ctx.callerId);
      requireRole(role, 'owner', 'admin');
      const ruleId = requireUuid(input.ruleId, 'ruleId');
      const { error } = await client.from('group_rules').delete().eq('id', ruleId).eq('group_id', groupId);
      if (error) throw error;
      return ok(await listRules(client, groupId));
    }

    if (operation === 'reorderRules') {
      assertFields(input, ['groupId', 'ordered_ids']);
      const role = await roleInGroup(client, groupId, ctx.callerId);
      requireRole(role, 'owner', 'admin');
      const orderedIds = uuidArray(input.ordered_ids, 'ordered_ids');
      const current = await listRules(client, groupId);
      const currentIds = new Set(current.map((row) => String(row.id)));
      if (orderedIds.length !== currentIds.size || orderedIds.some((id) => !currentIds.has(id))) {
        badRequest('ordered_ids must contain exactly this group\'s rules');
      }
      for (let index = 0; index < orderedIds.length; index++) {
        const { error } = await client.from('group_rules')
          .update({ position: index, updated_at: new Date().toISOString() })
          .eq('group_id', groupId).eq('id', orderedIds[index]);
        if (error) throw error;
      }
      return ok(await listRules(client, groupId));
    }

    if (operation === 'getMembers') return memberList(ctx, input, client);

    if (operation === 'addMembers') {
      assertFields(input, ['groupId', 'user_ids']);
      const role = await roleInGroup(client, groupId, ctx.callerId);
      requireRole(role, 'owner', 'admin', 'moderator');
      const userIds = uuidArray(input.user_ids, 'user_ids', 50);
      const rows = userIds.map((user_id) => ({ group_id: groupId, user_id, role: 'member' }));
      const { error } = await client.from('group_members').upsert(rows, {
        onConflict: 'group_id,user_id', ignoreDuplicates: true,
      });
      if (error) throw error;
      return ok({ status: 'ok', added: userIds.length });
    }

    if (operation === 'join') {
      assertFields(input, ['groupId', 'user_id']);
      const requested = optionalUuid(input.user_id, 'user_id');
      if (requested && requested !== ctx.callerId) forbidden('Cannot join on behalf of another user');
      const group = await loadGroup(client, groupId);
      if (group.privacy === 'private') forbidden('Private groups require an invitation');
      if (await activeBan(client, groupId, ctx.callerId)) forbidden('You are banned from this group');
      const { error } = await client.from('group_members').upsert({
        group_id: groupId, user_id: ctx.callerId, role: 'member',
      }, { onConflict: 'group_id,user_id', ignoreDuplicates: true });
      if (error) throw error;
      return ok({ status: 'ok', affected: ctx.callerId });
    }

    if (operation === 'leave') {
      assertFields(input, ['groupId', 'user_id']);
      const requested = optionalUuid(input.user_id, 'user_id');
      if (requested && requested !== ctx.callerId) forbidden('Cannot remove another user');
      const { error } = await client.from('group_members')
        .delete().eq('group_id', groupId).eq('user_id', ctx.callerId);
      if (error) throw error;
      return ok({ status: 'ok', left: true });
    }

    if (operation === 'removeMember') {
      assertFields(input, ['groupId', 'memberId', 'reason']);
      const role = await roleInGroup(client, groupId, ctx.callerId);
      requireRole(role, 'owner', 'admin', 'moderator');
      const memberId = requireUuid(input.memberId, 'memberId');
      const reason = optionalText(input.reason, 'reason', 500);
      const group = await loadGroup(client, groupId);
      if (memberId === group.created_by) forbidden('The group owner cannot be removed');
      const { error } = await client.from('group_members').delete().eq('group_id', groupId).eq('user_id', memberId);
      if (error) throw error;
      await logAction(client, groupId, 'remove', memberId, ctx.callerId, { reason });
      return ok({ status: 'ok', affected: memberId });
    }

    if (operation === 'reportMember') {
      assertFields(input, ['groupId', 'memberId', 'reason', 'description']);
      const role = await roleInGroup(client, groupId, ctx.callerId);
      if (role === 'none') forbidden('Group membership required');
      const memberId = requireUuid(input.memberId, 'memberId');
      const reason = oneOf(input.reason, 'reason', REPORT_REASONS);
      const description = optionalText(input.description, 'description', 500);
      const { data: target, error: targetError } = await client.from('group_members')
        .select('user_id').eq('group_id', groupId).eq('user_id', memberId).maybeSingle();
      if (targetError) throw targetError;
      if (!target) return ok({ status: 'target_not_found' });
      const id = await operationId(ctx.callerId, 'group:reportMember', { groupId, memberId, reason, description });
      const { error } = await client.from('group_reports').upsert({
        id, group_id: groupId, reported_user_id: memberId,
        reporter_user_id: ctx.callerId, reason, description, status: 'pending',
      }, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
      return ok({ status: 'ok', affected: memberId });
    }

    if (operation === 'restrictMember' || operation === 'unrestrictMember') {
      assertFields(input, ['groupId', 'memberId', 'restriction_type', 'ends_at', 'reason', 'rule_id']);
      const role = await roleInGroup(client, groupId, ctx.callerId);
      requireRole(role, 'owner', 'admin', 'moderator');
      const memberId = requireUuid(input.memberId, 'memberId');
      const restrictionType = input.restriction_type == null
        ? 'posting'
        : oneOf(input.restriction_type, 'restriction_type', RESTRICTIONS);
      const reason = optionalText(input.reason, 'reason', 500);
      const ruleId = optionalUuid(input.rule_id, 'rule_id');

      if (operation === 'restrictMember') {
        const endsAt = optionalIso(input.ends_at, 'ends_at');
        const id = await operationId(ctx.callerId, 'group:restrictMember', { groupId, memberId, restrictionType, endsAt, reason, ruleId });
        const { error } = await client.from('group_member_restrictions').upsert({
          id, group_id: groupId, user_id: memberId, restriction_type: restrictionType,
          restricted_by: ctx.callerId, reason, rule_id: ruleId,
          ends_at: endsAt, status: 'active', updated_at: new Date().toISOString(),
        }, { onConflict: 'id', ignoreDuplicates: true });
        if (error) throw error;
        await logAction(client, groupId, 'restrict', memberId, ctx.callerId, { reason, rule_id: ruleId, ends_at: endsAt });
      } else {
        const { error } = await client.from('group_member_restrictions').update({
          status: 'revoked', updated_at: new Date().toISOString(),
        }).eq('group_id', groupId).eq('user_id', memberId)
          .eq('status', 'active').eq('restriction_type', restrictionType);
        if (error) throw error;
        await logAction(client, groupId, 'unrestrict', memberId, ctx.callerId, { reason, rule_id: ruleId });
      }
      return ok({ status: 'ok', affected: memberId });
    }

    if (operation === 'banMember' || operation === 'unbanMember') {
      assertFields(input, ['groupId', 'memberId', 'ends_at', 'reason', 'rule_id']);
      const role = await roleInGroup(client, groupId, ctx.callerId);
      requireRole(role, 'owner', 'admin');
      const memberId = requireUuid(input.memberId, 'memberId');
      const group = await loadGroup(client, groupId);
      if (memberId === group.created_by) forbidden('The group owner cannot be banned');
      const reason = optionalText(input.reason, 'reason', 500);
      const ruleId = optionalUuid(input.rule_id, 'rule_id');

      if (operation === 'banMember') {
        const endsAt = optionalIso(input.ends_at, 'ends_at');
        const id = await operationId(ctx.callerId, 'group:banMember', { groupId, memberId, endsAt, reason, ruleId });
        const { error: banError } = await client.from('group_member_bans').upsert({
          id, group_id: groupId, user_id: memberId, banned_by: ctx.callerId,
          reason, expires_at: endsAt, status: 'active', updated_at: new Date().toISOString(),
        }, { onConflict: 'id', ignoreDuplicates: true });
        if (banError) throw banError;
        const { error: removeError } = await client.from('group_members')
          .delete().eq('group_id', groupId).eq('user_id', memberId);
        if (removeError) throw removeError;
        await logAction(client, groupId, 'ban', memberId, ctx.callerId, { reason, rule_id: ruleId, ends_at: endsAt });
      } else {
        const { error } = await client.from('group_member_bans').update({
          status: 'revoked', updated_at: new Date().toISOString(),
        }).eq('group_id', groupId).eq('user_id', memberId).eq('status', 'active');
        if (error) throw error;
        await logAction(client, groupId, 'unban', memberId, ctx.callerId, { reason, rule_id: ruleId });
      }
      return ok({ status: 'ok', affected: memberId });
    }

    return ok({ status: 'invalid', message: 'Unsupported operation' });
  });
}));

/** Retry-safe input for create operations (header key, when supplied, is included). */
function idempotentInput(ctx: VerifiedContext, input: Record<string, unknown>): Record<string, unknown> {
  const key = ctx.req.headers.get('idempotency-key') ?? input;
  return { ...input, key };
}
