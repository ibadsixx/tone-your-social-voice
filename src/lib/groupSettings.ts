// Group settings validation shared by the create dialog and the "About this
// group" editor. Mirrors the authoritative checks in the API Gateway
// (gateway/src/features/groupSettings.ts); the backend re-validates everything.

export const GROUP_PRIVACY_VALUES = ['public', 'private', 'closed'] as const;
export type GroupPrivacy = (typeof GROUP_PRIVACY_VALUES)[number];

export const PRIVACY_OPTIONS: { value: GroupPrivacy; label: string; description: string }[] = [
  { value: 'public', label: 'Public', description: "Anyone can see who's in the group and what they post." },
  { value: 'private', label: 'Private', description: "Only members can see who's in the group and what they post." },
  { value: 'closed', label: 'Closed', description: 'Anyone can see the group, but only members can post.' },
];

export function isGroupPrivacy(value: unknown): value is GroupPrivacy {
  return typeof value === 'string' && (GROUP_PRIVACY_VALUES as readonly string[]).includes(value);
}

export function normalizeGroupName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeGroupDescription(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function validateGroupName(value: unknown): string | null {
  if (normalizeGroupName(value).length === 0) return 'Group name is required.';
  return null;
}

export function validateGroupPrivacy(value: unknown): string | null {
  return isGroupPrivacy(value) ? null : 'Please select a privacy setting.';
}

export function validateRuleText(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return 'Rule text is required.';
  return null;
}
