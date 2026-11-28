// Test-only fixtures for the direct-Supabase architecture.
//
// Before a domain query, the data client resolves its project through the
// infrastructure registry (`infrastructure_projects_public`). Tests that mock
// global fetch must answer that registry read too, otherwise routing fails
// before the domain request they actually care about is issued.
//
// One active project per domain is still explicitly identified. Approved
// domains use their real project keys; other test-only domains declare
// complete routing metadata. All URLs point at the test's fetch mock.

import { DOMAIN_PROJECT_KEYS, KNOWN_PROJECT_REFS } from '@/lib/supabase/projects';

export const MOCK_ORIGIN = 'http://mock.test';
// Storage routing validates the verified Supabase project identity from the
// Registry URL. Fixtures therefore give the `users` row a realistic host while
// every request is still intercepted by the test's fetch mock.
export const MOCK_STORAGE_ORIGIN = `https://${KNOWN_PROJECT_REFS.centralAuth}.supabase.co`;
export const MOCK_ANON_KEY = 'test-anon-key';

export function jsonResponse(status: number, body: unknown): Response {
  // A real Response matters here: supabase-js reads `text()` before `json()`,
  // and a hand-rolled object with only `json()` makes routing fail before the
  // domain request the test is interested in is issued.
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function infraRegistryResponse(): Response {
  return jsonResponse(200, INFRA_PROJECTS);
}

const DOMAINS = [
  'ad_topics', 'advertisers', 'blocked_message_senders', 'blocking', 'call_history',
  'comments', 'conversation_participants', 'conversation_reads', 'conversation_settings',
  'conversations', 'export_requests', 'followers', 'friends', 'friend_requests', 'groups',
  'group_members', 'group_chat_members', 'group_member_bans', 'group_member_restrictions',
  'group_moderation_actions', 'group_reports', 'hashtags', 'live_comments', 'live_events',
  'live_participants', 'live_reactions', 'live_recordings', 'live_reports', 'live_sessions',
  'live_streams', 'media', 'message_poll_votes', 'message_polls', 'message_reads',
  'message_requests', 'messages', 'music', 'music_library', 'notifications', 'pages',
  'page_posts', 'posts', 'profiles', 'profile_photos', 'restricted_users', 'reels',
  'search_history', 'stories', 'user_blocks', 'user_contacts', 'user_encryption_keys',
  'user_restrictions', 'users',
];

export const INFRA_PROJECTS = DOMAINS.map((domain) => {
  const projectKey = DOMAIN_PROJECT_KEYS[domain] ?? `project-${domain}`;
  return {
    project_key: projectKey,
    domain,
    project_url: domain === 'users' ? MOCK_STORAGE_ORIGIN : MOCK_ORIGIN,
    anon_key: MOCK_ANON_KEY,
    status: 'active',
    priority: 1,
    region: 'test',
    health_status: 'healthy',
    responsibility: domain,
    operation_types: ['read', 'write', 'sync', 'auth'],
    read_destination: projectKey,
    write_destination: projectKey,
    partition_key: null,
  };
});

/** True for the infrastructure registry read, which is not a domain query. */
export function isInfraRegistryRequest(input: RequestInfo | URL | string): boolean {
  const url = typeof input === 'string' ? new URL(input, MOCK_ORIGIN) : new URL(String(input));
  return url.pathname === '/rest/v1/infrastructure_projects_public';
}

/** Table name from a PostgREST URL (the old Gateway tests used `/api/<table>`). */
export function postgrestTable(input: RequestInfo | URL | string): string {
  const url = typeof input === 'string' ? new URL(input, MOCK_ORIGIN) : new URL(String(input));
  return url.pathname.startsWith('/rest/v1/') ? url.pathname.slice('/rest/v1/'.length) : '';
}

/** Supabase `.single()` / `.maybeSingle()` ask PostgREST for one object via Accept. */
export function prefersObjectResponse(init?: RequestInit): boolean {
  return (new Headers(init?.headers).get('accept') ?? '').includes('application/vnd.pgrst.object+json');
}

/** Shape an in-memory table like PostgREST does for array vs single responses. */
export function shapePostgrestRows<T>(rows: T[], single?: boolean): T | T[] | null {
  return single ? rows[0] ?? null : rows;
}

/** Apply PostgREST `order=` to an in-memory table (`.order('created_at', { ascending: false })`). */
export function applyPostgrestOrder<T extends Record<string, unknown>>(
  rows: T[],
  input: RequestInfo | URL | string
): T[] {
  const url = typeof input === 'string' ? new URL(input, MOCK_ORIGIN) : new URL(String(input));
  const order = url.searchParams.get('order');
  if (!order) return rows.slice();
  const specs = order.split(',').map((part) => {
    const [column, direction] = part.split('.');
    return { column, direction: direction === 'desc' ? -1 : 1 };
  });
  return rows.slice().sort((a, b) => {
    for (const { column, direction } of specs) {
      const av = String(a[column] ?? '');
      const bv = String(b[column] ?? '');
      if (av !== bv) return (av < bv ? -1 : 1) * direction;
    }
    return 0;
  });
}

/** Apply PostgREST filters to an in-memory table, preserving old Gateway-era filter semantics. */
export function applyPostgrestFilters<T extends Record<string, unknown>>(
  rows: T[],
  input: RequestInfo | URL | string
): T[] {
  let result = rows.slice();
  for (const filter of postgrestFilters(input)) {
    if (filter.startsWith('or=(') && filter.endsWith(')')) {
      const alternatives = filter.slice(4, -1).split(',');
      result = result.filter((row) => alternatives.some((alt) => matchesFilter(row, alt)));
      continue;
    }
    result = result.filter((row) => matchesFilter(row, filter));
  }
  return result;
}

function matchesFilter(row: Record<string, unknown>, filter: string): boolean {
  const eq = /^([^=]+)=eq\.(.*)$/.exec(filter);
  if (eq) return String(row[eq[1]]) === eq[2];
  const neq = /^([^=]+)=neq\.(.*)$/.exec(filter);
  if (neq) return String(row[neq[1]]) !== neq[2];
  const inFilter = /^([^=]+)=in\.\((.*)\)$/.exec(filter);
  if (inFilter) return new Set(inFilter[2].split(',')).has(String(row[inFilter[1]]));
  return true;
}

/**
 * PostgREST sends each filter as its own query parameter (`id=eq.x`,
 * `conversation_id=in.(a,b)`, ...). Convert them to the `column=operator.value`
 * strings the in-memory Gateway-era filter helpers accept.
 */
export function postgrestFilters(input: RequestInfo | URL | string): string[] {
  const url = typeof input === 'string' ? new URL(input, MOCK_ORIGIN) : new URL(String(input));
  const ignored = new Set(['select', 'order', 'limit', 'offset', 'page']);
  return [...url.searchParams.entries()]
    .filter(([key]) => !ignored.has(key))
    .map(([key, value]) => `${key}=${value}`);
}
