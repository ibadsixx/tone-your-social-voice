// Shared request plumbing for the narrow cross-project Edge Functions.
//
// Every authenticated function uses `handleRequest`: CORS/OPTIONS, method
// check, central Auth JWT verification, bounded JSON parsing, strict field
// checking and non-leaking error responses in one place. Functions never read
// a service key from the client; `serviceClient()` in crossProject.ts is the
// only way to obtain one and it reads Function secrets exclusively.
//
// Required Function secrets for every authenticated function:
//   CENTRAL_AUTH_URL, CENTRAL_AUTH_ANON_KEY.
// Per-function target-project secrets are named in each function file.

import {
  corsHeaders,
  errorResponse,
  isUuid,
  jsonResponse,
  privateResponseHeaders,
  readJson,
  requireMethod,
  serviceClient,
  verifyCaller,
} from './crossProject.ts';
import {
  blockedIdsFromRows,
  friendIdsFromCanonicalRows,
  friendIdsFromLegacyRows,
  readAllPages,
  text,
  type FeedRow,
} from './feedTimelineCore.ts';

type Client = ReturnType<typeof serviceClient>;

export class RequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export function badRequest(message: string): never {
  throw new RequestError(message, 400);
}

export function forbidden(message = 'Not allowed'): never {
  throw new RequestError(message, 403);
}

export function notFound(message = 'Not found'): never {
  throw new RequestError(message, 404);
}

export interface VerifiedContext {
  callerId: string;
  body: Record<string, unknown>;
  req: Request;
}

/** Reject unknown fields so a client cannot smuggle privileged columns in. */
export function assertFields(value: Record<string, unknown>, allowed: readonly string[]): void {
  const extra = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extra.length > 0) badRequest('Unknown request fields');
}

export function requireValue(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 2_000) {
    badRequest(`Invalid ${name}`);
  }
  return value.trim();
}

export function requireUuid(value: unknown, name: string): string {
  if (!isUuid(value)) badRequest(`Invalid ${name}`);
  return value as string;
}

export function optionalUuid(value: unknown, name: string): string | null {
  if (value == null || value === '') return null;
  return requireUuid(value, name);
}

export function oneOf<T extends string>(value: unknown, name: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) badRequest(`Invalid ${name}`);
  return value as T;
}

export function optionalText(value: unknown, name: string, max = 500): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > max) badRequest(`Invalid ${name}`);
  return value.trim() || null;
}

export function optionalIso(value: unknown, name: string): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 40 || Number.isNaN(Date.parse(value))) {
    badRequest(`Invalid ${name}`);
  }
  return new Date(value).toISOString();
}

export function bool(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') badRequest(`Invalid ${name}`);
  return value as boolean;
}

export function uuidArray(value: unknown, name: string, max = 100): string[] {
  if (!Array.isArray(value) || value.length > max) badRequest(`Invalid ${name}`);
  return value.map((item) => requireUuid(item, name));
}

export function boundedInt(value: unknown, name: string, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

/** Quote a dynamic value inside a PostgREST `or=(...)` filter string. */
export function quoteFilterValue(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function errorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' ? message : '';
}

function missingRelation(error: unknown): boolean {
  const code = errorCode(error);
  const message = errorMessage(error);
  return code === 'PGRST205' || code === '42P01' ||
    /could not find the table|relation .* does not exist/i.test(message);
}

function missingBlockTypeColumn(error: unknown): boolean {
  const code = errorCode(error);
  const message = errorMessage(error);
  return code === '42703' || /column .*block_type.* does not exist/i.test(message);
}

function rowKey(row: FeedRow): string {
  return text(row.id) ?? `${String(row.requester_id ?? row.sender_id ?? row.blocker_id)}:${String(row.receiver_id ?? row.blocked_id)}`;
}

/**
 * Accepted friend IDs for a verified viewer, read from the friends project.
 *
 * The authoritative application table is `friends(requester_id, receiver_id,
 * status='accepted')`: it is what the frontend, the friend-request RPCs and
 * the block cleanup use. `friendships(sender_id, receiver_id, status='ACCEPTED')`
 * is a separate legacy table; it is consulted only when `friends` is genuinely
 * absent. Both sources are read page-by-page to completion — never capped.
 */
export async function viewerFriendIds(client: Client, viewerId: string): Promise<Set<string>> {
  try {
    const rows = await readAllPages<FeedRow, string>(
      (from, to) => client
        .from('friends')
        .select('id, requester_id, receiver_id, status')
        .or(`requester_id.eq.${viewerId},receiver_id.eq.${viewerId}`)
        .eq('status', 'accepted')
        .order('id', { ascending: true })
        .range(from, to) as Promise<{ data: FeedRow[] | null; error: unknown }>,
      rowKey
    );
    return friendIdsFromCanonicalRows(rows, viewerId);
  } catch (error) {
    if (!missingRelation(error)) throw error;
  }

  const legacyRows = await readAllPages<FeedRow, string>(
    (from, to) => client
      .from('friendships')
      .select('id, sender_id, receiver_id, status')
      .or(`sender_id.eq.${viewerId},receiver_id.eq.${viewerId}`)
      .eq('status', 'ACCEPTED')
      .order('id', { ascending: true })
      .range(from, to) as Promise<{ data: FeedRow[] | null; error: unknown }>,
    rowKey
  );
  return friendIdsFromLegacyRows(legacyRows, viewerId);
}

/**
 * Bidirectional full-block set for a verified viewer. A block either direction
 * hides content from the other party; the caller's own id is never included.
 * Read to completion page-by-page: a 500-row cap would silently unblock peers.
 */
export async function viewerBlockedIds(client: Client, viewerId: string): Promise<Set<string>> {
  try {
    const rows = await readAllPages<FeedRow, string>(
      (from, to) => client
        .from('blocks')
        .select('id, blocker_id, blocked_id, block_type')
        .or(`blocker_id.eq.${viewerId},blocked_id.eq.${viewerId}`)
        .order('id', { ascending: true })
        .range(from, to) as Promise<{ data: FeedRow[] | null; error: unknown }>,
      rowKey
    );
    return blockedIdsFromRows(rows, viewerId);
  } catch (error) {
    if (!missingBlockTypeColumn(error)) throw error;
  }

  // Older schema without `block_type`: every row is treated as a full block,
  // which is the schema default and the non-permissive interpretation.
  const rows = await readAllPages<FeedRow, string>(
    (from, to) => client
      .from('blocks')
      .select('id, blocker_id, blocked_id')
      .or(`blocker_id.eq.${viewerId},blocked_id.eq.${viewerId}`)
      .order('id', { ascending: true })
      .range(from, to) as Promise<{ data: FeedRow[] | null; error: unknown }>,
    rowKey
  );
  return blockedIdsFromRows(rows, viewerId);
}

function publicError(error: unknown): Response {
  if (error instanceof RequestError) return errorResponse(error.message, error.status);
  // Never echo driver errors, env values, or secrets to the browser.
  console.error('[cross-project] request failed:', error instanceof Error ? error.message : 'unknown error');
  return errorResponse('Cross-project operation failed', 500);
}

/** Authenticated request wrapper used by all authenticated functions. */
export async function handleRequest(
  req: Request,
  methods: readonly string[],
  handler: (ctx: VerifiedContext) => Promise<Response> | Response
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { ...corsHeaders, ...privateResponseHeaders } });
  }
  const methodError = requireMethod(req, ...methods);
  if (methodError) return methodError;

  let callerId: string;
  try {
    callerId = await verifyCaller(req);
  } catch {
    return errorResponse('Authentication required', 401);
  }

  try {
    let body: Record<string, unknown>;
    try {
      body = await readJson(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/too large/i.test(message)) badRequest('Request body too large');
      badRequest('Invalid JSON body');
    }
    return await handler({ callerId, body, req });
  } catch (error) {
    return publicError(error);
  }
}

/** Public, unauthenticated GET wrapper (only for genuinely public reads). */
export async function handlePublicRequest(
  req: Request,
  handler: (url: URL) => Promise<Response> | Response
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { ...corsHeaders, ...privateResponseHeaders } });
  }
  const methodError = requireMethod(req, 'GET');
  if (methodError) return methodError;
  try {
    return await handler(new URL(req.url));
  } catch (error) {
    return publicError(error);
  }
}

export function ok(data: unknown, status = 200): Response {
  return jsonResponse({ data, error: null }, status);
}

/**
 * Sub-path of a filesystem Edge Function. Supabase may either keep the full
 * `/functions/v1/<name>/...` path or strip it before invoking `Deno.serve`;
 * both shapes resolve to the same relative path here.
 */
export function functionSubPath(req: Request, functionName: string): string {
  const path = new URL(req.url).pathname.replace(/\/+$/, '');
  const marker = `/${functionName}`;
  const index = path.lastIndexOf(marker);
  const rest = index >= 0 ? path.slice(index + marker.length) : path;
  return rest.startsWith('/') ? rest : `/${rest || ''}`;
}
