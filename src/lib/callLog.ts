// Facebook-style call-log messages stored in the conversation thread.
// A call-log message is a system message whose `content` is a JSON envelope
// ({ __call: CallLogInfo }) so both participants see one row per call in the
// shared DM, rendered as a centered pill instead of a chat bubble.

export type CallLogStatus = 'ended' | 'missed' | 'declined' | 'failed';
export type CallLogCallType = 'voice' | 'video';

export interface CallLogInfo {
  status: CallLogStatus;
  callType: CallLogCallType;
  duration: number;
  // Who placed the call and who was called — lets each participant see a
  // label phrased from their own side ("X missed your voice call" for the
  // caller, "You missed X's voice call" for the callee). Optional so rows
  // written before this existed still parse (they render generic labels).
  callerId?: string;
  callerName?: string;
  receiverId?: string;
  receiverName?: string;
}

export function encodeCallLogContent(info: CallLogInfo): string {
  return JSON.stringify({ __call: info });
}

function optString(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

export function parseCallLog(content?: string | null): CallLogInfo | null {
  if (!content || !content.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(content);
    const info = parsed?.__call;
    if (
      info &&
      typeof info === 'object' &&
      ['ended', 'missed', 'declined', 'failed'].includes(info.status) &&
      ['voice', 'video'].includes(info.callType) &&
      typeof info.duration === 'number'
    ) {
      return {
        status: info.status,
        callType: info.callType,
        duration: info.duration,
        callerId: optString(info.callerId),
        callerName: optString(info.callerName),
        receiverId: optString(info.receiverId),
        receiverName: optString(info.receiverName),
      };
    }
  } catch {
    // not a call log
  }
  return null;
}

export function isMissedLike(status: CallLogStatus): boolean {
  return status === 'missed' || status === 'failed';
}

export function formatCallDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    return `${hrs}:${String(mins % 60).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// Label phrased from the viewer's side. `viewerId` is the reading user's id:
// - missed, viewer is the callee: "You missed <caller>'s voice call"
// - missed, otherwise:            "<receiver> missed your voice call"
// - declined, viewer declined:    "You declined the video call"
// - declined, otherwise:          "<receiver> declined the video call"
// Without participant names/ids (old rows) it falls back to generic labels.
export function callLogLabel(info: CallLogInfo, viewerId?: string): string {
  const kind = info.callType === 'video' ? 'video call' : 'voice call';
  const Kind = info.callType === 'video' ? 'Video call' : 'Voice call';
  const iAmCaller = !viewerId || !info.callerId || viewerId === info.callerId;

  switch (info.status) {
    case 'missed':
      if (!iAmCaller && info.callerName) return `You missed ${info.callerName}'s ${kind}`;
      return info.receiverName ? `${info.receiverName} missed your ${kind}` : `Missed ${kind}`;
    case 'declined':
      if (!iAmCaller) return `You declined the ${kind}`;
      return info.receiverName ? `${info.receiverName} declined the ${kind}` : `${Kind} declined`;
    case 'failed':
      return `${Kind} disconnected`;
    case 'ended':
    default:
      return info.duration > 0 ? Kind : `${Kind} ended`;
  }
}
