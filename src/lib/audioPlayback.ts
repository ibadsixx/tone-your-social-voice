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

/**
 * Resolve the URL used for <audio> playback. Direct Cloudinary delivery URLs
 * are rewritten to request an MP3 conversion when the recorded mime is not
 * playable in this browser (e.g. WebM/Opus in Safari). Every other URL — the
 * gateway /api/storage/* redirect fallback, or a URL whose mime the browser can
 * already play — is returned unchanged. Already-converted URLs are never
 * rewritten a second time.
 */
export function voicePlaybackUrl(
  url: string,
  recordedMime: string | null | undefined
): string {
  if (audioCanPlay(recordedMime)) return url;

  const match = url.match(CLOUDINARY_DELIVERY_RE);
  if (match) {
    // Insert the f_mp3 transformation between '/upload/' and the version:
    //   .../upload/f_mp3/<v<version>/]tone/<path>
    return `${match[1]}f_mp3/${match[2]}`;
  }
  return url;
}