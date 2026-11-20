import { gateway } from './client';
import type { ApiResult } from './client';

const GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL;

function getToken(): string | null {
  try {
    const sessionStr = localStorage.getItem('tone-auth-token');
    if (sessionStr) {
      const session = JSON.parse(sessionStr);
      return session?.access_token ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

async function liveFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${GATEWAY_URL}/api/live${path}`, { ...options, headers });
}

async function parseJson<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

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

// Sessions
export async function createLiveStream(data: CreateSessionData): Promise<ApiResult<LiveSession>> {
  const res = await liveFetch('/sessions', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) {
    const err = await parseJson<{ message?: string; error?: string }>(res);
    return { data: null, error: { message: err?.message || err?.error || res.statusText, code: String(res.status) } };
  }
  const json = await parseJson<LiveSession>(res);
  return { data: json, error: null };
}

export async function getLiveStream(id: string): Promise<ApiResult<LiveSession>> {
  const res = await liveFetch(`/sessions/${id}`);
  if (!res.ok) {
    if (res.status === 404) return { data: null, error: null };
    const err = await parseJson<{ message?: string }>(res);
    return { data: null, error: { message: err?.message || res.statusText, code: String(res.status) } };
  }
  const json = await parseJson<LiveSession>(res);
  return { data: json, error: null };
}

export async function getActiveLiveStreams(): Promise<ApiResult<LiveSession[]>> {
  const res = await liveFetch('/sessions');
  if (!res.ok) {
    const err = await parseJson<{ message?: string }>(res);
    return { data: null, error: { message: err?.message || res.statusText, code: String(res.status) } };
  }
  const json = await parseJson<LiveSession[]>(res);
  return { data: json || [], error: null };
}

export async function updateLiveStream(
  id: string,
  data: UpdateSessionData
): Promise<ApiResult<LiveSession>> {
  const res = await liveFetch(`/sessions/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  if (!res.ok) {
    const err = await parseJson<{ message?: string }>(res);
    return { data: null, error: { message: err?.message || res.statusText, code: String(res.status) } };
  }
  const json = await parseJson<LiveSession>(res);
  return { data: json, error: null };
}

export async function endLiveStream(id: string): Promise<ApiResult<LiveSession>> {
  const res = await liveFetch(`/sessions/${id}/end`, { method: 'POST' });
  if (!res.ok) {
    const err = await parseJson<{ message?: string }>(res);
    return { data: null, error: { message: err?.message || res.statusText, code: String(res.status) } };
  }
  const json = await parseJson<LiveSession>(res);
  return { data: json, error: null };
}

// Participants
export async function getStreamParticipants(sessionId: string): Promise<ApiResult<LiveParticipant[]>> {
  const res = await liveFetch(`/sessions/${sessionId}/participants`);
  if (!res.ok) {
    const err = await parseJson<{ message?: string }>(res);
    return { data: null, error: { message: err?.message || res.statusText, code: String(res.status) } };
  }
  const json = await parseJson<LiveParticipant[]>(res);
  return { data: json || [], error: null };
}

export async function addStreamParticipant(
  sessionId: string,
  userId: string,
  role: 'moderator' | 'guest' | 'viewer'
): Promise<ApiResult<LiveParticipant>> {
  const res = await liveFetch(`/sessions/${sessionId}/participants`, {
    method: 'POST',
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const err = await parseJson<{ message?: string }>(res);
    return { data: null, error: { message: err?.message || res.statusText, code: String(res.status) } };
  }
  const json = await parseJson<LiveParticipant>(res);
  return { data: json, error: null };
}

export async function updateStreamParticipant(
  sessionId: string,
  userId: string,
  data: Partial<LiveParticipant>
): Promise<ApiResult<LiveParticipant>> {
  const res = await liveFetch(`/sessions/${sessionId}/participants/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await parseJson<{ message?: string }>(res);
    return { data: null, error: { message: err?.message || res.statusText, code: String(res.status) } };
  }
  const json = await parseJson<LiveParticipant>(res);
  return { data: json, error: null };
}

export async function removeStreamParticipant(
  sessionId: string,
  userId: string
): Promise<ApiResult<{ error: string | null }>> {
  const res = await liveFetch(`/sessions/${sessionId}/leave`, { method: 'POST' });
  if (!res.ok) {
    const err = await parseJson<{ message?: string }>(res);
    return { data: null, error: { message: err?.message || res.statusText, code: String(res.status) } };
  }
  return { data: null, error: null };
}

export async function raiseHand(
  sessionId: string,
  userId: string
): Promise<ApiResult<LiveParticipant>> {
  const res = await liveFetch(`/sessions/${sessionId}/participants/${userId}/raise-hand`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await parseJson<{ message?: string }>(res);
    return { data: null, error: { message: err?.message || res.statusText, code: String(res.status) } };
  }
  const json = await parseJson<LiveParticipant>(res);
  return { data: json, error: null };
}

export async function lowerHand(
  sessionId: string,
  userId: string
): Promise<ApiResult<LiveParticipant>> {
  const res = await liveFetch(`/sessions/${sessionId}/participants/${userId}/lower-hand`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await parseJson<{ message?: string }>(res);
    return { data: null, error: { message: err?.message || res.statusText, code: String(res.status) } };
  }
  const json = await parseJson<LiveParticipant>(res);
  return { data: json, error: null };
}

// Comments
export async function getStreamComments(
  sessionId: string,
  offset: number,
  limit: number
): Promise<ApiResult<LiveComment[]>> {
  const res = await liveFetch(`/sessions/${sessionId}/comments?offset=${offset}&limit=${limit}`);
  if (!res.ok) {
    const err = await parseJson<{ message?: string }>(res);
    return { data: null, error: { message: err?.message || res.statusText, code: String(res.status) } };
  }
  const json = await parseJson<LiveComment[]>(res);
  return { data: json || [], error: null };
}

export async function sendComment(
  sessionId: string,
  content: string
): Promise<ApiResult<LiveComment>> {
  const res = await liveFetch(`/sessions/${sessionId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const err = await parseJson<{ message?: string }>(res);
    return { data: null, error: { message: err?.message || res.statusText, code: String(res.status) } };
  }
  const json = await parseJson<LiveComment>(res);
  return { data: json, error: null };
}

export async function hideComment(
  sessionId: string,
  commentId: string
): Promise<ApiResult<{ error: string | null }>> {
  const res = await liveFetch(`/sessions/${sessionId}/comments/${commentId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await parseJson<{ message?: string }>(res);
    return { data: null, error: { message: err?.message || res.statusText, code: String(res.status) } };
  }
  return { data: null, error: null };
}

// Reactions
export async function getStreamReactions(sessionId: string): Promise<{
  data: { counts: Record<string, number>; reactions: LiveReaction[] } | null;
  error: { message: string; code?: string } | null;
}> {
  const res = await liveFetch(`/sessions/${sessionId}/reactions`);
  if (!res.ok) {
    const err = await parseJson<{ message?: string }>(res);
    return { data: null, error: { message: err?.message || res.statusText, code: String(res.status) } };
  }
  const json = await parseJson<{ counts: Record<string, number>; reactions: LiveReaction[] }>(res);
  return { data: json, error: null };
}

export async function sendReaction(
  sessionId: string,
  reactionType: string
): Promise<ApiResult<LiveReaction>> {
  const res = await liveFetch(`/sessions/${sessionId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ reaction_type: reactionType }),
  });
  if (!res.ok) {
    const err = await parseJson<{ message?: string }>(res);
    return { data: null, error: { message: err?.message || res.statusText, code: String(res.status) } };
  }
  const json = await parseJson<LiveReaction>(res);
  return { data: json, error: null };
}

// Recordings
export async function getStreamRecordings(sessionId: string): Promise<ApiResult<LiveRecording[]>> {
  const res = await liveFetch(`/sessions/${sessionId}/recording`);
  if (!res.ok) {
    const err = await parseJson<{ message?: string }>(res);
    return { data: null, error: { message: err?.message || res.statusText, code: String(res.status) } };
  }
  const json = await parseJson<LiveRecording[]>(res);
  return { data: json || [], error: null };
}

export async function toggleRecording(
  sessionId: string,
  enabled: boolean
): Promise<ApiResult<LiveSession>> {
  const res = await liveFetch(`/sessions/${sessionId}/recording`, {
    method: 'POST',
    body: JSON.stringify({ recording: enabled }),
  });
  if (!res.ok) {
    const err = await parseJson<{ message?: string }>(res);
    return { data: null, error: { message: err?.message || res.statusText, code: String(res.status) } };
  }
  const json = await parseJson<LiveSession>(res);
  return { data: json, error: null };
}

// Reports
export async function submitReport(
  sessionId: string,
  data: { reported_user_id?: string; reason: string; description?: string }
): Promise<ApiResult<LiveReport>> {
  const res = await liveFetch(`/sessions/${sessionId}/reports`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await parseJson<{ message?: string }>(res);
    return { data: null, error: { message: err?.message || res.statusText, code: String(res.status) } };
  }
  const json = await parseJson<LiveReport>(res);
  return { data: json, error: null };
}

export async function getStreamReports(sessionId: string): Promise<ApiResult<LiveReport[]>> {
  const res = await liveFetch(`/sessions/${sessionId}/reports`);
  if (!res.ok) {
    const err = await parseJson<{ message?: string }>(res);
    return { data: null, error: { message: err?.message || res.statusText, code: String(res.status) } };
  }
  const json = await parseJson<LiveReport[]>(res);
  return { data: json || [], error: null };
}

// Events
export async function recordStreamEvent(
  sessionId: string,
  data: { event_type: string; target_user_id?: string; metadata?: Record<string, unknown> }
): Promise<ApiResult<LiveEvent>> {
  const res = await liveFetch(`/sessions/${sessionId}/events`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await parseJson<{ message?: string }>(res);
    return { data: null, error: { message: err?.message || res.statusText, code: String(res.status) } };
  }
  const json = await parseJson<LiveEvent>(res);
  return { data: json, error: null };
}

// Live post integration
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
  console.log('[LiveStream] createLivePost called, sessionId:', data.live_session_id,
    'streamType:', data.stream_type, 'audience:', data.audience_type);
  return liveFetch(`/sessions/${data.live_session_id}/posts`, {
    method: 'POST',
    body: JSON.stringify({
      ...data,
      type: 'live',
      status: 'live',
      viewer_count: 0,
    }),
  }).then(async (res) => {
    console.log('[LiveStream] createLivePost response status:', res.status,
      'sessionId:', data.live_session_id);
    if (!res.ok) {
      const err = await parseJson<{ message?: string; error?: string }>(res);
      console.warn('[LiveStream] createLivePost failed, status:', res.status,
        'message:', err?.message || err?.error || res.statusText,
        'sessionId:', data.live_session_id);
      return { data: null, error: { message: err?.message || err?.error || res.statusText, code: String(res.status) } };
    }
    const json = await parseJson<{ id: string }>(res);
    console.log('[LiveStream] createLivePost success, postId:', json?.id,
      'sessionId:', data.live_session_id);
    return { data: json, error: null };
  });
}

export async function updateLivePostStatus(
  sessionId: string,
  status: 'live' | 'ended'
): Promise<ApiResult<null>> {
  return gateway.from('posts').update({ status }).eq('live_session_id', sessionId);
}

export async function getLivePostBySessionId(sessionId: string): Promise<ApiResult<{ id: string }>> {
  return gateway.from('posts').select('id').eq('live_session_id', sessionId).maybeSingle();
}
