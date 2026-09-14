import { resolveMediaSrc } from '@/lib/mediaUrl';

export function isCloudinaryUrl(url: string | null | undefined): boolean {
  return !!url && /^https?:\/\/res\.cloudinary\.com\//i.test(url);
}

export function getMediaThumbnail(
  url: string | null | undefined,
  width = 640,
  options?: { height?: number; crop?: 'fill' | 'thumb' }
): string {
  const src = resolveMediaSrc(url);
  if (!src || !isCloudinaryUrl(src)) return src;
  const match = src.match(/(\/?(?:image|video)\/upload\/)/);
  if (!match) return src;
  const crop = options?.crop ?? (options?.height ? 'fill' : 'thumb');
  const transforms = [
    `w_${width}`,
    options?.height ? `h_${options.height}` : null,
    `c_${crop}`,
    'f_auto',
    'q_auto',
  ]
    .filter((t): t is string => !!t)
    .join(',');
  return src.replace(match[1], `${match[1]}${transforms}/`);
}

const VIDEO_FILE_EXT_RE = /\.(mp4|webm|mov|m4v|avi|mkv)(?=$|\?)/i;

// Cloudinary generates a poster image for any video resource. Requesting the
// same delivery URL with a .jpg extension returns that frame, so Reels/videos
// without a saved cover still get a lightweight 9:16 poster for the grid.
export function getVideoPoster(
  url: string | null | undefined,
  width = 720,
  height?: number
): string {
  const src = resolveMediaSrc(url);
  if (!src || !isCloudinaryUrl(src) || !src.includes('/video/upload/')) return '';
  const match = src.match(/^(https?:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.*)$/i);
  if (!match) return '';
  const transforms = [
    `w_${width}`,
    height ? `h_${height}` : null,
    'c_fill',
    'f_auto',
    'q_auto',
  ]
    .filter((t): t is string => !!t)
    .join(',');
  const resource = match[2].replace(VIDEO_FILE_EXT_RE, '');
  return `${match[1]}${transforms}/${resource}.jpg`;
}

export function isVideoUrl(url: string | null | undefined): boolean {
  const src = resolveMediaSrc(url);
  return !!src && (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(src) || src.includes('/video/upload/'));
}

export function formatDuration(duration: number | null | undefined): string {
  if (!duration || duration <= 0) return '';
  const total = Math.round(duration);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}