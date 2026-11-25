// Tone Live data access — direct Supabase only.
//
// Session/participant/comment/reaction data is read and written through the
// registry-routed frontend client, so project RLS decides what a viewer may
// see. Only short-lived signaling tickets and ICE configuration are delegated
// to the narrow `live` and `realtime` Edge Functions; there is no Gateway and no
// generic server-side CRUD proxy.
//
// Tables live in the registered `live_streams` domain: live_sessions,
// live_participants, live_comments, live_reactions, live_recordings,
// live_reports and live_events.

import { dataClient } from '@/lib/supabase/dataClient';
import type { ApiResult } from '@/lib/supabase/dataClient';
import { getEdgeFunctionUrl } from '@/lib/supabase/edgeTransport';

export interface LiveSession {
  id: string;
  host_id: string;
  title: string | null;
  description: string | null;
  stream_type: 'video' | 'audio';
  status: 'scheduled' | 'live' | 'ended';
  audience_type: 'public' | 'friends' | 'friends_except' | 'specific' | 'only_me' | 'custom_list';
  audience_user_ids: string[] | null;
  audience_excluded_user_ids: string[] | null;
  audience_list_id: string | null;
  recording: boolean;
  recording_url: string | null;
  viewer_count: number;
  max_viewers: number | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface LiveParticipant {
  id: string;
  session_id: string;
  user_id: string;
  role: 'host' | 'moderator' | 'guest' | 'viewer';
  joined_at: string | null;
  left_at: string | null;
  is_muted: boolean;
  is_video_off: boolean;
  raised_hand: boolean;
  [key: string]: unknown;
}

export interface LiveComment {
  id: string;
  session_id: string;
  user_id: string;
  content: string;
  created_at: string;
  is_hidden: boolean;
  hidden_by: string | null;
  hidden_at: string | null;
  [key: string]: unknown;
}

export interface LiveReaction {
  id: string;
  session_id: string;
  user_id: string;
  reaction_type: string;
  created_at: string;
  [key: string]: unknown;
}

export interface LiveRecording {
  id: string;
  session_id: string;
  status: 'pending' | 'recording' | 'completed' | 'failed';
  url: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  [key: string]: unknown;
}

export interface LiveReport {
  id: string;
  session_id: string;
  reporter_id: string;
  reported_user_id: string | null;
  reason: string;
  description: string | null;
  status: 'open' | 'reviewed' | 'resolved';
  created_at: string;
  [key: string]: unknown;
}

export interface LiveEvent {
  id: string;
  session_id: string;
  event_type: string;
  actor_id: string | null;
  target_user_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  [key: string]: unknown;
}

export interface CreateSessionData {
  title: string;
  description?: string;
  stream_type: 'video' | 'audio';
  audience_type: 'public' | 'friends' | 'friends_except' | 'specific' | 'only_me' | 'custom_list';
  audience_user_ids?: string[];
  audience_excluded_user_ids?: string[];
  audience_list_id?: string;
  recording?: boolean;
}

export interface UpdateSessionData {
  title?: string;
  description?: string;
  stream_type?: 'video' | 'audio';
  audience_type?: 'public' | 'friends' | 'friends_except' | 'specific' | 'only_me' | 'custom_list';
  audience_user_ids?: string[];
  audience_excluded_user_ids?: string[];
  audience_list_id?: string;
  recording?: boolean;
}

async function currentUserId(): Promise<string | null> {
  const { data } = await dataClient.auth.getUser();
  return (data?.user?.id as string | undefined) ?? null;
}

function notAuthenticated<T>(): ApiResult<T> {
  return { data: null, error: { message: 'Authentication required' } };
}

/** URL used by LiveSignalingClient to trade the central Auth JWT for a ticket. */
export function getLiveSignalingTicketUrl(sessionId: string): string {
  return `${getEdgeFunctionUrl('live')}/sessions/${encodeURIComponent(sessionId)}/signaling-ticket`;
}

// --- Sessions ---------------------------------------------------------------

export async function createLiveStream(data: CreateSessionData): Promise<ApiResult<LiveSession>> {
  const hostId = await currentUserId();
  if (!hostId) return notAuthenticated();
  return dataClient.from('live_sessions').insert({
    ...data,
    host_id: hostId,
    status: 'live',
    viewer_count: 0,
    started_at: new Date().toISOString(),
  }).select().single() as Promise<ApiResult<LiveSession>>;
}

export async function getLiveStream(id: string): Promise<ApiResult<LiveSession>> {
  return dataClient.from('live_sessions').select('*').eq('id', id).maybeSingle() as Promise<ApiResult<LiveSession>>;
}

export async function getActiveLiveStreams(): Promise<ApiResult<LiveSession[]>> {
  return dataClient.from('live_sessions')
    .select('*')
    .eq('status', 'live')
    .order('created_at', { ascending: false }) as Promise<ApiResult<LiveSession[]>>;
}

export async function updateLiveStream(
  id: string,
  data: UpdateSessionData
): Promise<ApiResult<LiveSession>> {
  return dataClient.from('live_sessions').update(data).eq('id', id).select().single() as Promise<ApiResult<LiveSession>>;
}

export async function endLiveStream(id: string): Promise<ApiResult<LiveSession>> {
  return dataClient.from('live_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single() as Promise<ApiResult<LiveSession>>;
}

// --- Participants -----------------------------------------------------------

export async function getStreamParticipants(sessionId: string): Promise<ApiResult<LiveParticipant[]>> {
  return dataClient.from('live_participants')
    .select('*')
    .eq('session_id', sessionId)
    .is('left_at', null) as Promise<ApiResult<LiveParticipant[]>>;
}

export async function addStreamParticipant(
  sessionId: string,
  userId: string,
  role: 'moderator' | 'guest' | 'viewer'
): Promise<ApiResult<LiveParticipant>> {
  return dataClient.from('live_participants')
    .upsert({ session_id: sessionId, user_id: userId, role, left_at: null }, { onConflict: 'session_id,user_id' })
    .select()
    .single() as Promise<ApiResult<LiveParticipant>>;
}

export async function updateStreamParticipant(
  sessionId: string,
  userId: string,
  data: Partial<LiveParticipant>
): Promise<ApiResult<LiveParticipant>> {
  const { role, is_muted, is_video_off, raised_hand } = data;
  return dataClient.from('live_participants')
    .update({ role, is_muted, is_video_off, raised_hand })
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .select()
    .single() as Promise<ApiResult<LiveParticipant>>;
}

/** Leave the current authenticated user from a session. */
export async function removeStreamParticipant(
  sessionId: string,
  _userId?: string
): Promise<ApiResult<{ error: string | null }>> {
  const userId = await currentUserId();
  if (!userId) return notAuthenticated();
  await dataClient.from('live_participants')
    .update({ left_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .eq('user_id', userId);
  return { data: null, error: null };
}

/** Remove another participant. RLS restricts this to host/moderator roles. */
export async function removeStreamParticipantById(
  sessionId: string,
  userId: string
): Promise<ApiResult<{ error: string | null }>> {
  await dataClient.from('live_participants')
    .update({ left_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .eq('user_id', userId);
  return { data: null, error: null };
}

export async function raiseHand(
  sessionId: string,
  userId: string
): Promise<ApiResult<LiveParticipant>> {
  return dataClient.from('live_participants')
    .update({ raised_hand: true })
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .select()
    .single() as Promise<ApiResult<LiveParticipant>>;
}

export async function lowerHand(
  sessionId: string,
  userId: string
): Promise<ApiResult<LiveParticipant>> {
  return dataClient.from('live_participants')
    .update({ raised_hand: false })
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .select()
    .single() as Promise<ApiResult<LiveParticipant>>;
}

// --- Comments ---------------------------------------------------------------

export async function getStreamComments(
  sessionId: string,
  offset: number,
  limit: number
): Promise<ApiResult<LiveComment[]>> {
  return dataClient.from('live_comments')
    .select('*')
    .eq('session_id', sessionId)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1) as Promise<ApiResult<LiveComment[]>>;
}

export async function sendComment(
  sessionId: string,
  content: string
): Promise<ApiResult<LiveComment>> {
  const userId = await currentUserId();
  if (!userId) return notAuthenticated();
  return dataClient.from('live_comments').insert({
    session_id: sessionId,
    user_id: userId,
    content,
  }).select().single() as Promise<ApiResult<LiveComment>>;
}

export async function hideComment(
  sessionId: string,
  commentId: string
): Promise<ApiResult<{ error: string | null }>> {
  const userId = await currentUserId();
  if (!userId) return notAuthenticated();
  await dataClient.from('live_comments')
    .update({ is_hidden: true, hidden_by: userId, hidden_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .eq('id', commentId);
  return { data: null, error: null };
}

// --- Reactions --------------------------------------------------------------

export async function getStreamReactions(sessionId: string): Promise<{
  data: { counts: Record<string, number>; reactions: LiveReaction[] } | null;
  error: { message: string; code?: string } | null;
}> {
  const result = await dataClient.from('live_reactions')
    .select('*')
    .eq('session_id', sessionId) as ApiResult<LiveReaction[]>;
  if (result.error) return { data: null, error: result.error };
  const reactions = result.data ?? [];
  const counts: Record<string, number> = {};
  for (const reaction of reactions) {
    counts[reaction.reaction_type] = (counts[reaction.reaction_type] ?? 0) + 1;
  }
  return { data: { counts, reactions }, error: null };
}

export async function sendReaction(
  sessionId: string,
  reactionType: string
): Promise<ApiResult<LiveReaction>> {
  const userId = await currentUserId();
  if (!userId) return notAuthenticated();
  return dataClient.from('live_reactions').insert({
    session_id: sessionId,
    user_id: userId,
    reaction_type: reactionType,
  }).select().single() as Promise<ApiResult<LiveReaction>>;
}

// --- Recordings -------------------------------------------------------------

export async function getStreamRecordings(sessionId: string): Promise<ApiResult<LiveRecording[]>> {
  return dataClient.from('live_recordings')
    .select('*')
    .eq('session_id', sessionId)
    .order('started_at', { ascending: false }) as Promise<ApiResult<LiveRecording[]>>;
}

export async function toggleRecording(
  sessionId: string,
  enabled: boolean
): Promise<ApiResult<LiveSession>> {
  return dataClient.from('live_sessions')
    .update({ recording: enabled })
    .eq('id', sessionId)
    .select()
    .single() as Promise<ApiResult<LiveSession>>;
}

// --- Reports and events -----------------------------------------------------

export async function submitReport(
  sessionId: string,
  data: { reported_user_id?: string; reason: string; description?: string }
): Promise<ApiResult<LiveReport>> {
  const reporterId = await currentUserId();
  if (!reporterId) return notAuthenticated();
  return dataClient.from('live_reports').insert({
    session_id: sessionId,
    reporter_id: reporterId,
    ...data,
  }).select().single() as Promise<ApiResult<LiveReport>>;
}

export async function getStreamReports(sessionId: string): Promise<ApiResult<LiveReport[]>> {
  return dataClient.from('live_reports')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false }) as Promise<ApiResult<LiveReport[]>>;
}

export async function recordStreamEvent(
  sessionId: string,
  data: { event_type: string; target_user_id?: string; metadata?: Record<string, unknown> }
): Promise<ApiResult<LiveEvent>> {
  const actorId = await currentUserId();
  if (!actorId) return notAuthenticated();
  return dataClient.from('live_events').insert({
    session_id: sessionId,
    actor_id: actorId,
    ...data,
  }).select().single() as Promise<ApiResult<LiveEvent>>;
}

// --- Live post integration --------------------------------------------------

export async function createLivePost(data: {
  host_id: string;
  title: string | null;
  stream_type: 'video' | 'audio';
  audience_type: string;
  audience_user_ids: string[] | null;
  audience_excluded_user_ids: string[] | null;
  audience_list_id: string | null;
  live_session_id: string;
}): Promise<ApiResult<{ id: string }>> {
  return dataClient.from('posts').insert({
    user_id: data.host_id,
    content: data.title,
    type: 'live',
    status: 'live',
    stream_type: data.stream_type,
    audience_type: data.audience_type,
    audience_user_ids: data.audience_user_ids,
    audience_excluded_user_ids: data.audience_excluded_user_ids,
    audience_list_id: data.audience_list_id,
    live_session_id: data.live_session_id,
    viewer_count: 0,
  }).select('id').single() as Promise<ApiResult<{ id: string }>>;
}

export async function updateLivePostStatus(
  sessionId: string,
  status: 'live' | 'ended'
): Promise<ApiResult<null>> {
  return dataClient.from('posts').update({ status }).eq('live_session_id', sessionId) as Promise<ApiResult<null>>;
}

export async function getLivePostBySessionId(sessionId: string): Promise<ApiResult<{ id: string }>> {
  return dataClient.from('posts').select('id').eq('live_session_id', sessionId).maybeSingle() as Promise<ApiResult<{ id: string }>>;
}
