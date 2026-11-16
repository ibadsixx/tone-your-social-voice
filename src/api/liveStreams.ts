import { gateway } from '@/lib/gateway';
import type { ApiResult } from './client';

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
  [key: string]: unknown;
}

export interface LiveInvite {
  id: string;
  session_id: string;
  inviter_id: string;
  invitee_id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  created_at: string;
  responded_at: string | null;
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

export interface ReactionCounts {
  counts: Record<string, number>;
  reactions: LiveReaction[];
}

// Sessions
export async function createLiveStream(data: CreateSessionData): Promise<ApiResult<LiveSession>> {
  return gateway.from('live_sessions').insert(data).select().single() as unknown as Promise<ApiResult<LiveSession>>;
}

export async function getLiveStream(id: string): Promise<ApiResult<LiveSession>> {
  return gateway.from('live_sessions').select('*').eq('id', id).maybeSingle() as unknown as Promise<ApiResult<LiveSession>>;
}

export async function getActiveLiveStreams(): Promise<ApiResult<LiveSession[]>> {
  return gateway
    .from('live_sessions')
    .select('*')
    .eq('status', 'live')
    .order('started_at', { ascending: false }) as unknown as Promise<ApiResult<LiveSession[]>>;
}

export async function updateLiveStream(
  id: string,
  data: UpdateSessionData
): Promise<ApiResult<LiveSession>> {
  return gateway
    .from('live_sessions')
    .update(data)
    .eq('id', id)
    .select()
    .single() as unknown as Promise<ApiResult<LiveSession>>;
}

export async function endLiveStream(id: string): Promise<ApiResult<LiveSession>> {
  return updateLiveStream(id, { status: 'ended', ended_at: new Date().toISOString() } as unknown as UpdateSessionData);
}

// Participants
export async function getStreamParticipants(sessionId: string): Promise<ApiResult<LiveParticipant[]>> {
  return gateway
    .from('live_participants')
    .select('*')
    .eq('session_id', sessionId)
    .is('left_at', null)
    .order('joined_at', { ascending: true }) as unknown as Promise<ApiResult<LiveParticipant[]>>;
}

export async function addStreamParticipant(
  sessionId: string,
  userId: string,
  role: 'moderator' | 'guest' | 'viewer'
): Promise<ApiResult<LiveParticipant>> {
  return gateway
    .from('live_participants')
    .insert({ session_id: sessionId, user_id: userId, role })
    .select()
    .single() as unknown as Promise<ApiResult<LiveParticipant>>;
}

export async function updateStreamParticipant(
  sessionId: string,
  userId: string,
  data: Partial<LiveParticipant>
): Promise<ApiResult<LiveParticipant>> {
  return gateway
    .from('live_participants')
    .update(data)
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .is('left_at', null)
    .select()
    .single() as unknown as Promise<ApiResult<LiveParticipant>>;
}

export async function removeStreamParticipant(
  sessionId: string,
  userId: string
): Promise<ApiResult<{ error: string | null }>> {
  const { error } = await gateway
    .from('live_participants')
    .delete()
    .eq('session_id', sessionId)
    .eq('user_id', userId);
  return { data: null, error };
}

// Comments
export async function getStreamComments(
  sessionId: string,
  offset: number,
  limit: number
): Promise<ApiResult<LiveComment[]>> {
  return gateway
    .from('live_comments')
    .select('*')
    .eq('session_id', sessionId)
    .eq('is_hidden', false)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1) as unknown as Promise<ApiResult<LiveComment[]>>;
}

export async function sendComment(
  sessionId: string,
  content: string
): Promise<ApiResult<LiveComment>> {
  return gateway
    .from('live_comments')
    .insert({ session_id: sessionId, user_id: '', content, created_at: new Date().toISOString(), is_hidden: false })
    .select()
    .single() as unknown as Promise<ApiResult<LiveComment>>;
}

export async function hideComment(commentId: string): Promise<ApiResult<{ error: string | null }>> {
  const { error } = await gateway
    .from('live_comments')
    .update({ is_hidden: true })
    .eq('id', commentId);
  return { data: null, error };
}

// Reactions
export async function getStreamReactions(sessionId: string): Promise<ReactionCounts> {
  const { data, error } = await gateway
    .from('live_reactions')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) return { counts: {}, reactions: [] };
  const reactions = (data as LiveReaction[]) || [];
  const counts: Record<string, number> = {};
  for (const r of reactions) {
    counts[r.reaction_type] = (counts[r.reaction_type] || 0) + 1;
  }
  return { counts, reactions };
}

export async function sendReaction(
  sessionId: string,
  reactionType: string
): Promise<ApiResult<LiveReaction>> {
  return gateway
    .from('live_reactions')
    .upsert({
      session_id: sessionId,
      user_id: '',
      reaction_type: reactionType,
      created_at: new Date().toISOString(),
    }, { onConflict: 'session_id,user_id,reaction_type' })
    .select()
    .single() as unknown as Promise<ApiResult<LiveReaction>>;
}

// Recordings
export async function getStreamRecordings(sessionId: string): Promise<ApiResult<LiveRecording[]>> {
  return gateway
    .from('live_recordings')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true }) as unknown as Promise<ApiResult<LiveRecording[]>>;
}

export async function toggleRecording(
  sessionId: string,
  enabled: boolean
): Promise<ApiResult<LiveSession>> {
  return updateLiveStream(sessionId, { recording: enabled } as unknown as UpdateSessionData);
}

// Reports
export async function submitReport(
  sessionId: string,
  data: { reported_user_id?: string; reason: string; description?: string }
): Promise<ApiResult<LiveReport>> {
  return gateway
    .from('live_reports')
    .insert({
      session_id: sessionId,
      reporter_id: '',
      reported_user_id: data.reported_user_id ?? null,
      reason: data.reason,
      description: data.description ?? null,
      status: 'open',
      created_at: new Date().toISOString(),
    })
    .select()
    .single() as unknown as Promise<ApiResult<LiveReport>>;
}

export async function getStreamReports(sessionId: string): Promise<ApiResult<LiveReport[]>> {
  return gateway
    .from('live_reports')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true }) as unknown as Promise<ApiResult<LiveReport[]>>;
}

// Events
export async function recordStreamEvent(
  sessionId: string,
  data: { event_type: string; target_user_id?: string; metadata?: Record<string, unknown> }
): Promise<ApiResult<LiveEvent>> {
  return gateway
    .from('live_events')
    .insert({
      session_id: sessionId,
      actor_id: '',
      event_type: data.event_type,
      target_user_id: data.target_user_id ?? null,
      metadata: data.metadata ?? null,
      created_at: new Date().toISOString(),
    })
    .select()
    .single() as unknown as Promise<ApiResult<LiveEvent>>;
}
