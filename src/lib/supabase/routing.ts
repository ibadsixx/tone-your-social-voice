// Tone frontend — deterministic multi-project routing.
//
// A domain is not a project. This is the single resolver used by all direct
// Supabase access. Priority only orders registry results; it never selects a
// destination. A route is accepted only when an explicit approved project key
// or validated routing metadata identifies exactly one active project.

import { getActiveProjectsByDomain, loadInfrastructureProjects } from './registry';
import { knownProjectKeyForDomain } from './projects';
import type {
  InfrastructureConfigError,
  InfrastructureProject,
  OperationType,
  ProjectRouteRequest,
  ResolvedProjectRoute,
} from './types';

/** Tables whose registered domain name differs from the table name. */
const TABLE_DOMAIN_OVERRIDES: Record<string, string> = {
  conversation_reads: 'message_reads',
  friend_requests: 'friends',
  group_chat_members: 'group_members',
  group_member_bans: 'groups',
  group_member_restrictions: 'groups',
  group_moderation_actions: 'groups',
  group_reports: 'groups',
  live_comments: 'live_streams',
  live_events: 'live_streams',
  live_participants: 'live_streams',
  live_reactions: 'live_streams',
  live_recordings: 'live_streams',
  live_reports: 'live_streams',
  live_sessions: 'live_streams',
  profile_photos: 'profiles',
  restricted_users: 'blocking',
  user_blocks: 'blocking',
  user_restrictions: 'blocking',
};

/**
 * Explicit RPC ownership. Every RPC called by the frontend is listed here; a
 * missing mapping is routed by its function name only when validated registry
 * metadata exists for that domain.
 */
const RPC_DOMAIN_OVERRIDES: Record<string, string> = {
  add_blocked_nickname: 'blocking',
  add_blocked_sender: 'blocked_message_senders',
  add_channel_follower: 'conversation_participants',
  add_channel_moderator: 'conversation_participants',
  add_group_member: 'conversation_participants',
  add_or_increment_music: 'music_library',
  add_search_entry: 'search_history',
  archive_conversation: 'conversations',
  block_user: 'blocking',
  clear_my_search_history: 'search_history',
  create_export_request: 'export_requests',
  delete_channel: 'conversations',
  delete_read_vanish_messages: 'messages',
  follow_channel: 'conversation_participants',
  get_archived_conversations: 'conversations',
  get_block_relation: 'blocking',
  get_blocked_nicknames: 'blocking',
  get_blocked_senders: 'blocked_message_senders',
  get_blocked_users: 'blocking',
  get_call_history: 'call_history',
  get_profile_about_fields: 'profiles',
  get_channel_members: 'conversation_participants',
  get_channel_stats: 'conversations',
  get_channel_user_role: 'conversation_participants',
  get_encryption_details: 'user_encryption_keys',
  get_group_members: 'conversation_participants',
  get_message_poll: 'message_polls',
  get_music_library_with_stats: 'music_library',
  get_mutual_friends_count: 'friends',
  get_my_advertisers: 'advertisers',
  get_my_contact_settings: 'user_contacts',
  get_my_encryption_keys: 'user_encryption_keys',
  get_my_export_requests: 'export_requests',
  get_my_search_history: 'search_history',
  get_other_user_read_receipts_enabled: 'conversation_settings',
  get_or_create_dm: 'conversations',
  get_people_you_may_know: 'friends',
  get_restricted_users: 'blocking',
  get_trending_music: 'music',
  get_unread_conversation_ids: 'message_reads',
  get_user_blocks: 'blocking',
  increment_post_share_counts: 'posts',
  is_blocked: 'blocking',
  is_restricted: 'blocking',
  log_call: 'call_history',
  promote_group_member: 'conversation_participants',
  remove_blocked_nickname: 'blocking',
  remove_blocked_sender: 'blocked_message_senders',
  remove_channel_moderator: 'conversation_participants',
  remove_search_entry: 'search_history',
  rename_group_conversation: 'conversations',
  restrict_user: 'blocking',
  seed_default_ad_topics: 'ad_topics',
  send_poll_message: 'message_polls',
  unarchive_conversation: 'conversations',
  unblock_user: 'blocking',
  unfollow_channel: 'conversation_participants',
  unrestrict_user: 'blocking',
  update_contact_setting: 'user_contacts',
  update_conversation_settings: 'conversation_settings',
  update_group_member_role: 'conversation_participants',
  upsert_encryption_key: 'user_encryption_keys',
  verify_conversation_encryption: 'conversations',
  vote_on_poll: 'message_poll_votes',
};

export function domainForTable(table: string): string {
  return TABLE_DOMAIN_OVERRIDES[table] ?? table;
}

export function domainForRpc(functionName: string): string {
  return RPC_DOMAIN_OVERRIDES[functionName] ?? functionName;
}

/**
 * RPCs that only read data must use the project's `read_destination`. Everything
 * else — including `get_or_create_dm`, which creates a conversation — stays on
 * the write path. This is derived from the function contract, never from a
 * project name or priority.
 */
export function rpcOperation(functionName: string): OperationType {
  return /^(get_|is_)/.test(functionName) && functionName !== 'get_or_create_dm'
    ? 'read'
    : 'write';
}

/**
 * Extract the Supabase project reference from a standard project URL. Returns
 * null for custom domains or malformed hosts so identity checks fail closed.
 */
export function projectRefFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const match = host.match(/^([a-z0-9]{20})\.supabase\.co$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function routeError(
  code: InfrastructureConfigError['code'],
  message: string,
  details?: unknown
): Error {
  const error = new Error(message) as Error & { configCode?: string; details?: unknown };
  error.configCode = code;
  error.details = details;
  return error;
}

type DeclaredField =
  | 'responsibility'
  | 'partition_key'
  | 'read_destination'
  | 'write_destination';

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function collectDeclaredStrings(
  projects: InfrastructureProject[],
  field: DeclaredField
): string[] {
  const values = new Set<string>();
  for (const project of projects) {
    const value = project[field];
    if (nonEmptyString(value)) values.add(value);
  }
  return [...values];
}

function declaredStrings(
  projects: InfrastructureProject[],
  field: DeclaredField,
  domain: string
): string[] {
  const list = collectDeclaredStrings(projects, field);
  if (list.length > 1) {
    throw routeError(
      'AMBIGUOUS_ROUTE',
      `Conflicting ${field} declarations for domain ${domain}; routing refused`,
      { field, values: list }
    );
  }
  return list;
}

function destinationFieldFor(operation: OperationType): 'read_destination' | 'write_destination' {
  return operation === 'write' || operation === 'sync' ? 'write_destination' : 'read_destination';
}

/** Attach an explicitly approved project key when the domain has one. */
export function withKnownProjectKey(request: ProjectRouteRequest): ProjectRouteRequest {
  if (request.projectKey) return request;
  const projectKey = knownProjectKeyForDomain(request.domain);
  return projectKey ? { ...request, projectKey } : request;
}

/**
 * Resolve exactly one active project for an operation.
 *
 * A single active project is never enough by itself. The caller must supply an
 * approved `projectKey`, or the extended registry metadata must identify one
 * destination. Conflicting metadata, missing partition keys, and unresolved
 * ambiguity all fail closed.
 */
export async function resolveProjectRoute(
  request: ProjectRouteRequest
): Promise<ResolvedProjectRoute> {
  const projects = await loadInfrastructureProjects();
  const active = getActiveProjectsByDomain(projects, request.domain);

  if (active.length === 0) {
    throw routeError(
      'DOMAIN_NOT_FOUND',
      `No active infrastructure project registered for domain: ${request.domain}`
    );
  }

  let candidates = active;
  const selectorsUsed: string[] = [];
  const projectKey = request.projectKey;

  if (projectKey) {
    candidates = active.filter((project) => project.project_key === projectKey);
    if (candidates.length === 0) {
      throw routeError(
        'PROJECT_NOT_FOUND',
        `No active project ${projectKey} for domain ${request.domain}`,
        { projectKey, domain: request.domain }
      );
    }
    selectorsUsed.push('project_key');
  }

  // A project reference is an identity check, never a Registry key. This is
  // used by explicit resource routes (Storage buckets and confirmed channels)
  // whose host was verified by the Phase 3B read-only probe.
  if (request.expectedProjectRef) {
    const identityMatches = candidates.filter(
      (project) => projectRefFromUrl(project.project_url) === request.expectedProjectRef
    );
    if (identityMatches.length === 0) {
      throw routeError(
        'INVALID_CONFIG',
        `Registry project for domain ${request.domain} does not match the verified project identity`,
        { domain: request.domain, projectKey }
      );
    }
    candidates = identityMatches;
    selectorsUsed.push('project_ref');
  }

  // Operation-specific destination must agree with the selected project.
  const destinationField = destinationFieldFor(request.operation);
  const destinationValues = declaredStrings(candidates, destinationField, request.domain);
  if (destinationValues.length > 0) {
    const destinationKey = destinationValues[0];
    if (projectKey && destinationKey !== projectKey) {
      throw routeError(
        'INVALID_CONFIG',
        `${destinationField} ${destinationKey} does not match ${projectKey} for domain ${request.domain}`,
        { destinationKey, projectKey }
      );
    }
    if (!projectKey) {
      const destination = candidates.filter((project) => project.project_key === destinationKey);
      if (destination.length === 0) {
        throw routeError(
          'PROJECT_NOT_FOUND',
          `${destinationField} ${destinationKey} is not an active project for domain ${request.domain}`,
          { destinationKey, domain: request.domain }
        );
      }
      candidates = destination;
    }
    selectorsUsed.push(destinationField);
  }

  if (request.responsibility) {
    const matched = candidates.filter((project) => project.responsibility === request.responsibility);
    if (matched.length === 0) {
      throw routeError(
        'INVALID_CONFIG',
        `No project for domain ${request.domain} has responsibility ${request.responsibility}`,
        { responsibility: request.responsibility }
      );
    }
    candidates = matched;
    selectorsUsed.push('responsibility');
  } else {
    const values = declaredStrings(candidates, 'responsibility', request.domain);
    if (values.length > 0) {
      candidates = candidates.filter((project) => project.responsibility === values[0]);
      selectorsUsed.push('responsibility');
    }
  }

  const withOperationMetadata = candidates.filter(
    (project) => Array.isArray(project.operation_types) && project.operation_types.length > 0
  );
  if (withOperationMetadata.length > 0) {
    const allowed = withOperationMetadata.filter((project) =>
      (project.operation_types ?? []).includes(request.operation)
    );
    if (allowed.length === 0) {
      throw routeError(
        'INVALID_CONFIG',
        `No project for domain ${request.domain} supports ${request.operation} operations`,
        { operation: request.operation }
      );
    }
    candidates = allowed;
    selectorsUsed.push('operation_types');
  }

  const partitionValues = collectDeclaredStrings(candidates, 'partition_key');
  if (partitionValues.length > 0) {
    if (!request.partitionKey) {
      throw routeError(
        'AMBIGUOUS_ROUTE',
        `Domain ${request.domain} requires a partitionKey to select a project`,
        { projectKeys: candidates.map((project) => project.project_key) }
      );
    }
    // A domain with partition metadata requires an exact ownership match.
    // Unpartitioned projects are not silent fallbacks.
    const partitioned = candidates.filter(
      (project) => project.partition_key === request.partitionKey
    );
    if (partitioned.length === 0) {
      throw routeError(
        'PROJECT_NOT_FOUND',
        `No project for domain ${request.domain} owns partition ${request.partitionKey}`
      );
    }
    candidates = partitioned;
    selectorsUsed.push('partition_key');
  }

  const invalid = candidates.filter((project) => !project.project_url || !project.anon_key);
  if (invalid.length > 0) {
    throw routeError(
      'INVALID_CONFIG',
      `Infrastructure project for domain ${request.domain} is missing project_url or anon_key`,
      { projectKeys: invalid.map((project) => project.project_key) }
    );
  }

  if (candidates.length === 0) {
    throw routeError(
      'INVALID_CONFIG',
      `No project for domain ${request.domain} supports ${request.operation} with the supplied routing constraints`
    );
  }

  if (candidates.length > 1) {
    throw routeError(
      'AMBIGUOUS_ROUTE',
      `Multiple active projects for domain ${request.domain} match this ${request.operation}; supply projectKey or complete routing metadata`,
      { projectKeys: candidates.map((project) => project.project_key) }
    );
  }

  if (selectorsUsed.length === 0) {
    throw routeError(
      'AMBIGUOUS_ROUTE',
      `Routing metadata is insufficient for domain ${request.domain}; supply projectKey or apply the extended registry metadata`,
      { projectKeys: candidates.map((project) => project.project_key) }
    );
  }

  const project = candidates[0];
  return {
    project,
    domain: request.domain,
    operation: request.operation,
    projectKey: project.project_key,
  };
}

/** Resolve a domain with any approved project identity applied automatically. */
export function resolveDomainRoute(
  domain: string,
  operation: OperationType,
  options: Pick<ProjectRouteRequest, 'projectKey' | 'responsibility' | 'partitionKey'> = {}
): Promise<ResolvedProjectRoute> {
  return resolveProjectRoute(withKnownProjectKey({ domain, operation, ...options }));
}

export function resolveTableRoute(
  table: string,
  operation: OperationType
): Promise<ResolvedProjectRoute> {
  return resolveDomainRoute(domainForTable(table), operation);
}

export function resolveRpcRoute(
  functionName: string,
  operation?: OperationType
): Promise<ResolvedProjectRoute> {
  return resolveDomainRoute(domainForRpc(functionName), operation ?? rpcOperation(functionName));
}
