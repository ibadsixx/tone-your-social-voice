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