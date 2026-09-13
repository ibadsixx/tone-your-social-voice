export function buildSocialUrl(type: string, url: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;

  const username = url.replace(/^@/, '');

  switch (type) {
    case 'Twitter':
      return `https://twitter.com/${username}`;
    case 'Instagram':
      return `https://instagram.com/${username}`;
    case 'Facebook':
      return `https://facebook.com/${username}`;
    case 'YouTube':
      return `https://youtube.com/@${username}`;
    case 'TikTok':
      return `https://tiktok.com/@${username}`;
    case 'LinkedIn':
      return `https://linkedin.com/in/${username}`;
    case 'GitHub':
      return `https://github.com/${username}`;
    case 'Tone':
      return `https://tonesn.vercel.app/profile/${username}`;
    case 'Telegram':
      return `https://t.me/${username}`;
    default:
      return url;
  }
}
