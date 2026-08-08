// Media links are exposed on the application's own URL (/media/<id>) instead of
// the CDN's URL. The actual bytes are still streamed from Cloudinary, but the
// URL shown to visitors — in the address bar, copied links, and shared posts —
// points at this application's domain, which helps with SEO and branding.
//
// The <id> is a base64url-encoded source URL, so /media/<id> resolves back to
// the real URL with no server lookup, which works on fully static hosting.

const MEDIA_PREFIX = '/media/';

export function isAbsoluteHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

// Converts a media URL into the app-hosted route (/media/<id>).
export function mediaAppUrl(url: string): string {
  if (!url || !isAbsoluteHttpUrl(url)) return url;
  return `${MEDIA_PREFIX}${toBase64Url(url)}`;
}

// Resolves a /media/<id> id back to the source URL.
export function mediaAppUrlToSrc(id: string): string {
  try {
    const decoded = fromBase64Url(id);
    if (decoded && isAbsoluteHttpUrl(decoded)) return decoded;
  } catch {
    // malformed id
  }
  return '';
}

// If a value is already an app media route, resolve it back to the source URL;
// otherwise return it unchanged. Useful for <img>/<video> src attributes.
export function resolveMediaSrc(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith(MEDIA_PREFIX)) {
    return mediaAppUrlToSrc(url.slice(MEDIA_PREFIX.length));
  }
  return url;
}

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
