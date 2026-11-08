// Group-share messages stored in DM conversations.
// A group-share message is a regular text message whose `content` is a JSON
// envelope ({ __group_share: GroupShareInfo }) so both participants see the
// shared group as a real message in their DM thread, rendered as a card.
export interface GroupShareInfo {
  __group_share: true;
  group_id: string;
  group_name: string;
  group_image: string | null;
  group_description: string | null;
  shared_by: string;
  shared_by_name: string;
  shared_at: string;
}

/**
 * Strip Markdown link wrapping from a URL string.
 *
 * Some callers or stored values may contain Markdown image links like
 * `[https://example.com/image.png](https://example.com/image.png)` instead of
 * a plain URL. This extracts the bare URL so it can be used as an `img src`.
 *
 * Returns the input unchanged when it is not a Markdown-wrapped URL.
 */
export function sanitizeImageUrl(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return value;
  const m = value.match(/^\[([^\]]+)\]\((.+?)\)\s*$/);
  return m ? m[2] : value;
}

export function encodeGroupShareContent(info: Omit<GroupShareInfo, '__group_share'>): string {
  return JSON.stringify({ __group_share: true, ...info });
}

function optString(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

export function parseGroupShareContent(content?: string | null): GroupShareInfo | null {
  if (!content || !content.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(content);
    if (!parsed || parsed.__group_share !== true) return null;
    return {
      __group_share: true,
      group_id: optString(parsed.group_id) ?? '',
      group_name: optString(parsed.group_name) ?? '',
      group_image: sanitizeImageUrl(optString(parsed.group_image)) ?? null,
      group_description: optString(parsed.group_description) ?? null,
      shared_by: optString(parsed.shared_by) ?? '',
      shared_by_name: optString(parsed.shared_by_name) ?? '',
      shared_at: optString(parsed.shared_at) ?? '',
    };
  } catch {
    return null;
  }
}

export function formatGroupShareLabel(info: GroupShareInfo, viewerId?: string): string {
  const iAmSender = !viewerId || !info.shared_by || viewerId === info.shared_by;
  if (iAmSender) return `You shared ${info.group_name}`;
  return `${info.shared_by_name} shared ${info.group_name}`;
}
