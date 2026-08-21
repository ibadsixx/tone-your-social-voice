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
}

export function encodeCallLogContent(info: CallLogInfo): string {
  return JSON.stringify({ __call: info });
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
      return info as CallLogInfo;
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

export function callLogLabel(info: CallLogInfo): string {
  const kind = info.callType === 'video' ? 'Video call' : 'Voice call';
  switch (info.status) {
    case 'missed':
      return `Missed ${kind.toLowerCase()}`;
    case 'declined':
      return `${kind} declined`;
    case 'failed':
      return `${kind} disconnected`;
    case 'ended':
    default:
      return info.duration > 0 ? kind : `${kind} ended`;
  }
}
