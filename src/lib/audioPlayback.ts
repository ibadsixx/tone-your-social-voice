// Voice-message playback helpers, used by MessageBubble.
//
// Voice messages are recorded with the browser's MediaRecorder — WebM/Opus on
// Chrome/Edge/Firefox, MP4/AAC on Safari — and stored on Cloudinary via the
// gateway. Some browsers' <audio> element cannot decode the recorded container
// at all; the classic case is Safari/iOS, which cannot play WebM/Opus, so
// HTMLMediaElement.play() rejects with NotSupportedError and the UI surfaces
// "Failed to play audio" even though the URL loaded fine.
//
// When the browser reports it cannot play the recorded mime, we ask Cloudinary
// to convert the SAME asset to MP3 on delivery (f_mp3, a documented Cloudinary
// format flag for audio). No new storage, no new backend: the converted copy is
// streamed from the existing CDN for the same public_id. Browsers that can
// already play the original container keep getting the original URL unchanged.

/**
 * True when the browser's <audio> element reports it can play `mime`.
 * Missing/unknown mime is treated as playable so we never rewrite URLs for
 * legacy rows that predate audio_mime.
 */
export function audioCanPlay(mime: string | null | undefined): boolean {
  if (!mime) return true;
  if (typeof document === 'undefined') return true;
  try {
    return document.createElement('audio').canPlayType(mime) !== '';
  } catch {
    return true;
  }
}

// Direct Cloudinary delivery URLs look like:
//   https://res.cloudinary.com/<cloud>/<type>/upload/[v<version>/]tone/<path>
// Group 1 = everything up to and including '/upload/'; group 2 = the rest,
// required to start with an optional version segment followed by 'tone/'.
const CLOUDINARY_DELIVERY_RE =
  /^(https:\/\/res\.cloudinary\.com\/[^/]+\/[^/]+\/upload\/)((?:v\d+\/)?tone\/.+)$/;

// Legacy voice-message rows (sent before audio_url was persisted) and any row
// whose CDN URL is missing resolve through the gateway fallback form below.
// The gateway's GET /storage/:bucket/* redirects that URL to the reconstructed
// Cloudinary asset; appending ?format=mp3 makes it redirect to an f_mp3
// conversion of the SAME asset instead.
function isGatewayStorageUrl(url: string): boolean {
  return url.includes('/api/storage/');
}

function alreadyConverted(url: string): boolean {
  return url.includes('f_mp3') || /[?&]format=/.test(url);
}

/**
 * Resolve the URL used for <audio> playback. When the recorded mime is not
 * playable in this browser (e.g. WebM/Opus in Safari):
 *  - direct Cloudinary delivery URLs are rewritten to request an MP3
 *    conversion of the same asset (f_mp3), and
 *  - gateway /api/storage/* fallback URLs get ?format=mp3 appended, so the
 *    gateway's existing redirect serves the converted MP3 too.
 * URLs whose mime the browser can already play, and already-converted URLs,
 * are never touched.
 */
export function voicePlaybackUrl(
  url: string,
  recordedMime: string | null | undefined
): string {
  if (audioCanPlay(recordedMime)) return url;
  if (alreadyConverted(url)) return url;

  const match = url.match(CLOUDINARY_DELIVERY_RE);
  if (match) {
    // Insert the f_mp3 transformation between '/upload/' and the version:
    //   .../upload/f_mp3/<v<version>/]tone/<path>
    return `${match[1]}f_mp3/${match[2]}`;
  }
  if (isGatewayStorageUrl(url)) {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}format=mp3`;
  }
  return url;
}