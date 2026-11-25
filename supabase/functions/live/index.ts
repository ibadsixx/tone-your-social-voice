// Tone Live signaling tickets (HTTP only). This function does NOT proxy the
// WebSocket relay, session CRUD or any generic table access.
//
// Browsers cannot set an Authorization header on a WebSocket upgrade, so the
// client first calls /live/sessions/:id/signaling-ticket with its central Auth
// JWT. After checking session status, audience and the viewer cap, this function
// issues a random, single-use ticket that expires in 60 seconds. Only the
// SHA-256 hash of the ticket is stored; the raw value is returned once. The
// WebSocket endpoint consumes (deletes) that short-lived row. No long-lived
// token or secret is ever placed in a WebSocket URL.
//
// Function secrets: CENTRAL_AUTH_URL, CENTRAL_AUTH_ANON_KEY,
// LIVE_PROJECT_URL, LIVE_SERVICE_ROLE_KEY,
// LIVE_SIGNALING_PROJECT_URL, LIVE_SIGNALING_SERVICE_ROLE_KEY,
// FRIENDS_PROJECT_URL, FRIENDS_SERVICE_ROLE_KEY.
//
// Assumed tables/columns (confirm externally):
//   live_sessions(id, host_id, status, audience_type, audience_user_ids,
//                 audience_excluded_user_ids, max_viewers)
//   live_participants(session_id, user_id, role, left_at)
//   live_signaling_tickets(token_hash, session_id, user_id, role,
//                           expires_at, consumed_at)
// LIVE_SIGNALING_* may point at the same registered live-streams project if
// that is where the signaling tables live; ownership must be confirmed.

import { jsonResponse, serviceClient } from '../_shared/crossProject.ts';
import {
  assertFields,
  forbidden,
  functionSubPath,
  handleRequest,
  notFound,
  requireUuid,
} from '../_shared/operation.ts';
import { canonicalAudienceType } from '../_shared/postVisibility.ts';

const TICKET_RE = /^\/sessions\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/signaling-ticket$/i;
const TTL_SECONDS = 60;

type Row = Record<string, unknown>;

function live() {
  return serviceClient('LIVE_PROJECT_URL', 'LIVE_SERVICE_ROLE_KEY');
}
function signaling() {
  return serviceClient('LIVE_SIGNALING_PROJECT_URL', 'LIVE_SIGNALING_SERVICE_ROLE_KEY');
}

async function sessionAccess(session: Row, callerId: string): Promise<boolean> {
  if (session.host_id === callerId) return true;
  const audience = canonicalAudienceType(session.audience_type) ?? 'denied';
  const allowed = new Set(
    Array.isArray(session.audience_user_ids)
      ? session.audience_user_ids.filter((id): id is string => typeof id === 'string')
      : []
  );
  const excluded = new Set(
    Array.isArray(session.audience_excluded_user_ids)
      ? session.audience_excluded_user_ids.filter((id): id is string => typeof id === 'string')
      : []
  );
  if (audience === 'public') return true;
  if (audience === 'only_me' || audience === 'denied') return false;
  if (audience === 'specific' || audience === 'custom_list') return allowed.has(callerId);
  if (audience === 'friends' || audience === 'friends_except') {
    if (audience === 'friends_except' && excluded.has(callerId)) return false;
    const host = typeof session.host_id === 'string' ? session.host_id : '';
    const { data, error } = await serviceClient('FRIENDS_PROJECT_URL', 'FRIENDS_SERVICE_ROLE_KEY')
      .from('friendships')
      .select('requester_id, receiver_id')
      .or(`requester_id.eq.${host},receiver_id.eq.${host}`)
      .eq('status', 'accepted')
      .limit(500);
    if (error) throw error;
    return (data ?? []).some((row) =>
      (row.requester_id === host && row.receiver_id === callerId) ||
      (row.receiver_id === host && row.requester_id === callerId)
    );
  }
  return false;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve((req) => handleRequest(req, ['POST'], async (ctx) => {
    const match = TICKET_RE.exec(functionSubPath(req, 'live'));
    if (!match) notFound('Signaling endpoint not found');
    assertFields(ctx.body, []);
    const sessionId = requireUuid(match[1], 'sessionId');
    const client = live();

    const { data: session, error: sessionError } = await client
      .from('live_sessions')
      .select('id, host_id, status, audience_type, audience_user_ids, audience_excluded_user_ids, max_viewers')
      .eq('id', sessionId)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) notFound('Session not found');
    if (session.status !== 'live' && session.status !== 'scheduled') {
      forbidden('Session is not active');
    }
    if (!await sessionAccess(session as Row, ctx.callerId)) forbidden('Session audience denied');

    const { data: participants, error: participantError } = await client
      .from('live_participants')
      .select('user_id, role')
      .eq('session_id', sessionId)
      .is('left_at', null);
    if (participantError) throw participantError;
    const me = (participants ?? []).find((row) => row.user_id === ctx.callerId);
    const role = session.host_id === ctx.callerId
      ? 'host'
      : (me && typeof me.role === 'string' ? me.role : 'viewer');
    if (typeof session.max_viewers === 'number' &&
        session.host_id !== ctx.callerId &&
        (participants ?? []).length >= session.max_viewers) {
      forbidden('Session is full');
    }

    const ticket = base64Url(crypto.getRandomValues(new Uint8Array(32)));
    const tokenHash = await sha256Hex(ticket);
    const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();
    const tickets = signaling();

    // Cleanup is scoped to this session's EXPIRED temporary ticket rows only.
    // It can never touch permanent session, participant or message rows.
    const { error: cleanupError } = await tickets
      .from('live_signaling_tickets')
      .delete()
      .eq('session_id', sessionId)
      .lt('expires_at', new Date().toISOString());
    if (cleanupError) throw cleanupError;

    const { error: insertError } = await tickets.from('live_signaling_tickets').insert({
      token_hash: tokenHash,
      session_id: sessionId,
      user_id: ctx.callerId,
      role,
      expires_at: expiresAt,
      consumed_at: null,
    });
    if (insertError) throw insertError;

    // Flat envelope: the WebSocket client reads this body directly.
    return jsonResponse({
      ticket,
      sessionId,
      userId: ctx.callerId,
      role,
      expiresAt,
      ttlSeconds: TTL_SECONDS,
    });
}));
