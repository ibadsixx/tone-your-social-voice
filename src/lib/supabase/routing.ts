// Tone frontend — deterministic multi-project routing.
//
// A domain is not a project. This is the single resolver used by all direct
// Supabase access. It never chooses by priority and never reads from an
// arbitrary project: project_key and explicit routing metadata must identify
// exactly one active destination.

import { getActiveProjectsByDomain, loadInfrastructureProjects } from './registry';
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
  user_blocks: 'blocking',
  user_restrictions: 'blocking',
};

/**
 * Explicit RPC ownership. Every RPC called by the frontend is listed here; a
 * missing mapping is an error, not a broadcast to projects sharing a domain.
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
  get_channel_members: 'conversation_participants',
  get_channel_stats: 'conversations',
  get_channel_user_role: 'conversation_participants',
  get_encryption_details: 'user_encryption_keys',
  get_group_members: 'conversation_participants',
  get_message_poll: 'message_polls',
  get_mutual_friends_count: 'friends',
  get_my_advertisers: 'advertisers',
  get_my_contact_settings: 'user_contacts',
  get_my_encryption_keys: 'user_encryption_keys',
  get_my_export_requests: 'export_requests',
  get_my_search_history: 'search_history',
  get_other_user_read_receipts_enabled: 'conversation_settings',
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

function hasMetadata(
  projects: InfrastructureProject[],
  field: keyof Pick<
    InfrastructureProject,
    'responsibility' | 'operation_types' | 'partition_key' | 'read_destination' | 'write_destination'
  >
): boolean {
  return projects.some((project) => {
    const value = project[field];
    return Array.isArray(value) ? value.length > 0 : value != null && value !== '';
  });
}

/**
 * Resolve exactly one active project for an operation.
 *
 * Priority is used only for stable registry ordering; it is never a selector.
 * When metadata is absent, a single active project for the domain is accepted.
 * More than one candidate without a distinguishing key/metadata fails loudly.
 */
export async function resolveProjectRoute(
  request: ProjectRouteRequest
): Promise<ResolvedProjectRoute> {
  const projects = await loadInfrastructureProjects();
  let candidates = getActiveProjectsByDomain(projects, request.domain);

  if (candidates.length === 0) {
    throw routeError(
      'DOMAIN_NOT_FOUND',
      `No active infrastructure project registered for domain: ${request.domain}`
    );
  }

  if (request.projectKey) {
    candidates = candidates.filter((project) => project.project_key === request.projectKey);
    if (candidates.length === 0) {
      throw routeError(
        'PROJECT_NOT_FOUND',
        `No active project ${request.projectKey} for domain ${request.domain}`,
        { projectKey: request.projectKey, domain: request.domain }
      );
    }
  } else {
    const destinationField =
      request.operation === 'write' || request.operation === 'sync'
        ? 'write_destination'
        : 'read_destination';

    if (hasMetadata(candidates, destinationField)) {
      const destinationKey = candidates.find((project) => project[destinationField])?.[destinationField];
      if (!destinationKey) {
        throw routeError(
          'INVALID_CONFIG',
          `No ${destinationField} declared for domain ${request.domain}`
        );
      }
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
  }

  if (hasMetadata(candidates, 'responsibility')) {
    const matched = request.responsibility
      ? candidates.filter((project) => project.responsibility === request.responsibility)
      : candidates.filter((project) => project.responsibility === request.domain);
    if (matched.length === 0) {
      throw routeError(
        'INVALID_CONFIG',
        `No project for domain ${request.domain} has responsibility ${request.responsibility ?? request.domain}`,
        { responsibility: request.responsibility ?? request.domain }
      );
    }
    candidates = matched;
  }

  if (hasMetadata(candidates, 'operation_types')) {
    const allowed = candidates.filter((project) =>
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
  }

  if (hasMetadata(candidates, 'partition_key')) {
    if (!request.partitionKey) {
      throw routeError(
        'AMBIGUOUS_ROUTE',
        `Domain ${request.domain} requires a partitionKey to select a project`,
        { projectKeys: candidates.map((project) => project.project_key) }
      );
    }
    // A domain with partition metadata requires an exact ownership match.
    // Unpartitioned projects are not silent fallbacks; that would make the
    // destination depend on registry ordering.
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

  const project = candidates[0];
  return {
    project,
    domain: request.domain,
    operation: request.operation,
    projectKey: project.project_key,
  };
}

export function resolveTableRoute(
  table: string,
  operation: OperationType
): Promise<ResolvedProjectRoute> {
  return resolveProjectRoute({ domain: domainForTable(table), operation });
}

export function resolveRpcRoute(
  functionName: string,
  operation: OperationType = 'write'
): Promise<ResolvedProjectRoute> {
  return resolveProjectRoute({ domain: domainForRpc(functionName), operation });
}
