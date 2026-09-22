// Voice-message pipeline diagnostics (do.md: "Create a fresh voice message and
// log: ..."). Every event is console.debug'd AND appended to an in-memory ring
// buffer so the user can reproduce a failed playback and copy the full trace
// from the console or window.__voiceDiagnostics.get(). No keys, no payloads,
// no network — metadata only.

export interface VoiceDiagEvent {
  t: string; // ISO timestamp
  kind: 'upload' | 'insert' | 'playback' | 'playback-error' | 'playback-retry';
  [key: string]: unknown;
}

const RING: VoiceDiagEvent[] = [];
const MAX = 200;

function record(event: VoiceDiagEvent): void {
  RING.push(event);
  if (RING.length > MAX) RING.shift();
  console.debug(`[voice] ${event.kind}`, event);
}

function expose(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __voiceDiagnostics?: { get: () => VoiceDiagEvent[]; clear: () => void } };
  w.__voiceDiagnostics = {
    get: () => RING.slice(),
    clear: () => {
      RING.length = 0;
    },
  };
}
expose();

export function logVoiceUpload(fields: {
  mime: string;
  size: number;
  duration: number;
  extension: string;
  path: string;
  audioUrl?: string;
}): void {
  record({ t: new Date().toISOString(), kind: 'upload', ...fields });
}

export function logVoiceInsert(fields: {
  audioPath: string;
  audioUrl: string | null | undefined;
  mime: string;
  duration: number;
  fileSize: number;
}): void {
  record({ t: new Date().toISOString(), kind: 'insert', ...fields });
}

export function logVoicePlayback(fields: {
  sourceUrl: string;
  finalUrl: string;
  mime: string | null | undefined;
  canPlayRecordedMime: boolean;
  httpStatus?: number;
  httpContentType?: string;
}): void {
  record({ t: new Date().toISOString(), kind: 'playback', ...fields });
}

export function logVoicePlaybackError(fields: {
  phase: 'load' | 'play';
  audioUrl: string;
  errorName?: string;
  errorCode?: number; // HTMLMediaElement.error.code
  mime: string | null | undefined;
  retried?: boolean;
}): void {
  record({ t: new Date().toISOString(), kind: 'playback-error', ...fields });
}

export function logVoicePlaybackRetry(fields: {
  fromUrl: string;
  toUrl: string;
  mime: string | null | undefined;
  result: 'ok' | 'still-failed';
}): void {
  record({ t: new Date().toISOString(), kind: 'playback-retry', ...fields });
}

// Cheap HTTP probe of the final audio URL (first byte via Range) to capture
// status + Content-Type — the two facts do.md asks to verify about the final
// response. Cloudinary honors Range and sends Access-Control-Allow-Origin: *.
export async function probeAudioUrl(url: string): Promise<{
  status: number;
  contentType: string;
  contentLength?: string;
  acceptRanges?: string;
}> {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-0' } });
    return {
      status: res.status,
      contentType: res.headers.get('content-type') || '',
      contentLength: res.headers.get('content-range') || res.headers.get('content-length') || undefined,
      acceptRanges: res.headers.get('accept-ranges') || undefined,
    };
  } catch {
    return { status: 0, contentType: '' };
  }
}