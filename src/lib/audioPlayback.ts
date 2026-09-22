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
 * playable in this browser (e.g. WebM/Opus in Safari), fall through to
 * toConvertedUrl() (f_mp3 on Cloudinary URLs, ?format=mp3 on gateway URLs).
 * URLS whose mime the browser can already play are never touched.
 */
export function voicePlaybackUrl(
  url: string,
  recordedMime: string | null | undefined
): string {
  if (audioCanPlay(recordedMime)) return url;
  return toConvertedUrl(url);
}

/**
 * Map the recorded MIME to the file extension used in the storage path. The
 * recorder produces webm/opus (Chrome/Edge/Firefox), mp4 (Safari) or mpeg;
 * every other value falls back to the container-family extension so the
 * Cloudinary public_id never pretends the payload is a different codec.
 */
export function voiceFileExtension(mime: string): string {
  if (/webm/i.test(mime)) return 'webm';
  if (/ogg/i.test(mime)) return 'ogg';
  if (/mp4|m4a/i.test(mime)) return mime.includes('m4a') ? 'm4a' : 'mp4';
  if (/mpeg|mp3/i.test(mime)) return 'mp3';
  return 'webm';
}

/**
 * Uppercase the Cloudinary delivery URL of the same asset: direct delivery
 * URLs get an f_mp3 transformation inserted, gateway /api/storage/* fallback
 * URLs get ?format=mp3 so the gateway's redirect serves f_mp3. Already-
 * converted URLs are returned unchanged. Used both by voicePlaybackUrl (static
 * canPlayType check) and as a runtime recovery when play() rejects with
 * NotSupportedError on a browser that claimed WebM support (Chrome/Brave).
 */
export function toConvertedUrl(url: string): string {
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