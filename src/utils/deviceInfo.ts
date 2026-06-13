export interface DeviceInfo {
  os: string;
  browser: string;
  deviceName: string;
}

export function parseUserAgent(ua: string): DeviceInfo {
  let os = 'Unknown OS';
  let browser = 'Unknown Browser';

  if (ua.includes('Windows NT 10.0')) os = 'Windows 10';
  else if (ua.includes('Windows NT 11.0')) os = 'Windows 11';
  else if (ua.includes('Windows NT 6.3')) os = 'Windows 8.1';
  else if (ua.includes('Windows NT 6.1')) os = 'Windows 7';
  else if (ua.includes('Mac OS X')) {
    const match = ua.match(/Mac OS X (\d+[._]\d+)/);
    os = match ? `macOS ${match[1].replace('_', '.')}` : 'macOS';
  } else if (ua.includes('Linux') && ua.includes('Android')) {
    const match = ua.match(/Android (\d+(?:\.\d+)?)/);
    os = match ? `Android ${match[1]}` : 'Android';
  } else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('iPhone') || ua.includes('iPad')) {
    const match = ua.match(/OS (\d+[._]\d+)/);
    os = match ? `iOS ${match[1].replace('_', '.')}` : 'iOS';
  } else if (ua.includes('CrOS')) os = 'ChromeOS';

  if (ua.includes('Edg/') || ua.includes('Edge/')) browser = 'Microsoft Edge';
  else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';
  else if (ua.includes('OPR/') || ua.includes('Opera/')) browser = 'Opera';
  else if (ua.includes('Trident/')) browser = 'Internet Explorer';
  else if (ua.includes('SamsungBrowser/')) browser = 'Samsung Internet';

  const deviceName = `${browser} on ${os}`;
  return { os, browser, deviceName };
}

let locationCache: string | null = null;

async function tryIpInfo(): Promise<string | null> {
  try {
    const res = await fetch('https://ipinfo.io/json', { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const data = await res.json();
    const parts: string[] = [];
    if (data.city) parts.push(data.city);
    if (data.region) parts.push(data.region);
    if (data.country) parts.push(data.country);
    return parts.join(', ') || null;
  } catch {
    return null;
  }
}

async function tryIpApi(): Promise<string | null> {
  try {
    const res = await fetch('https://ip-api.com/json/', { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'success') return null;
    const parts: string[] = [];
    if (data.city) parts.push(data.city);
    if (data.regionName) parts.push(data.regionName);
    if (data.country) parts.push(data.country);
    return parts.join(', ') || null;
  } catch {
    return null;
  }
}

function getLocationFromTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) return tz.replace('_', ' ');
  } catch {
    // ignore
  }
  return null;
}

export async function fetchLocation(): Promise<string> {
  if (locationCache) return locationCache;
  const result = (await tryIpInfo()) || (await tryIpApi()) || getLocationFromTimezone() || 'Unknown location';
  locationCache = result;
  return result;
}

export function formatLastSeen(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
