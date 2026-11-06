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
    const info = parsed?.__group_share;
    if (!info || info !== true) return null;
    return {
      __group_share: true,
      group_id: optString(info.group_id) ?? '',
      group_name: optString(info.group_name) ?? '',
      group_image: optString(info.group_image) ?? null,
      group_description: optString(info.group_description) ?? null,
      shared_by: optString(info.shared_by) ?? '',
      shared_by_name: optString(info.shared_by_name) ?? '',
      shared_at: optString(info.shared_at) ?? '',
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
