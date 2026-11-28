// Phase 3G-R — per-field profile privacy contract.
//
// IMPORTANT: this is a specification used by tests and the SQL proposal. It is
// NOT a browser security boundary. The browser must never fetch a private
// `public.profiles` column and then hide it in JavaScript. Only a database-side
// read that derives the viewer from trusted Central Auth identity and applies
// these rules before returning explicit columns may release these values.
//
// The browser read path is wired to a reviewed RPC; if that RPC is absent,
// unauthorized, or malformed, the adapter fails closed. No private column is
// granted to browser roles.

import type { AboutSectionId } from '@/lib/profileAbout';

/** The three supported, user-controlled visibility values. */
export type ProfileVisibility = 'public' | 'friends' | 'private';

/** Legacy stored spellings are normalized to the three supported values. */
export const PROFILE_VISIBILITY_OPTIONS: readonly {
  value: ProfileVisibility;
  label: string;
  description: string;
}[] = [
  { value: 'public', label: 'Public', description: 'Anyone on Tone' },
  { value: 'friends', label: 'Friends', description: 'Your friends only' },
  { value: 'private', label: 'Private', description: 'Only you can see this' },
] as const;

export interface AboutViewerContext {
  /** Derived only from trusted identity, never from a browser-supplied id. */
  isOwner: boolean;
  /** Derived only from an authoritative Friends source. */
  isFriend: boolean;
  /** Derived only from the authoritative Blocking domain. */
  isBlocked: boolean;
  /** Derived only from the authoritative Blocking domain. */
  isRestricted: boolean;
}

export interface AboutProfileFieldSpec {
  /** Stable UI/API key. */
  key: string;
  section: AboutSectionId;
  /** Explicit `public.profiles` columns required to render the value. */
  valueColumns: readonly string[];
  /** Column that controls this field's visibility; null means always public. */
  visibilityColumn: string | null;
  /** True when the value is not one of the six approved public columns. */
  requiresSecureRead: boolean;
  /** Live/migration evidence for the value column(s). */
  sqlTypes: readonly string[];
  /** Human-readable note for aliases and legacy columns. */
  note?: string;
}

/**
 * Complete supported About fields stored in `public.profiles`.
 *
 * `profile_details` rows and the separate `other_names`, `life_events` and
 * `family_relationships` tables have their own RLS/visibility controls and are
 * outside this private-column map. This map is specifically the set of fields
 * whose values and visibility flags live on the profiles row.
 *
 * `birthday`, legacy `college`, and legacy `high_school` are included because
 * they are still present in the live row. They are aliases: `birthday` follows
 * `birth_date_visibility`; legacy school names follow the ID-backed visibility
 * column for the same logical field.
 */
export const ABOUT_PROFILE_FIELDS: readonly AboutProfileFieldSpec[] = [
  {
    key: 'bio',
    section: 'overview',
    valueColumns: ['bio'],
    visibilityColumn: null,
    requiresSecureRead: false,
    sqlTypes: ['text'],
  },
  {
    key: 'about_you',
    section: 'details',
    valueColumns: ['about_you'],
    visibilityColumn: 'about_you_visibility',
    requiresSecureRead: true,
    sqlTypes: ['text'],
  },
  {
    key: 'name_pronunciation',
    section: 'details',
    valueColumns: ['name_pronunciation'],
    visibilityColumn: 'name_pronunciation_visibility',
    requiresSecureRead: true,
    sqlTypes: ['text'],
  },
  {
    key: 'email',
    section: 'contact',
    valueColumns: ['email'],
    visibilityColumn: 'email_visibility',
    requiresSecureRead: true,
    sqlTypes: ['text[]'],
  },
  {
    key: 'phone',
    section: 'contact',
    valueColumns: ['phone_country_code', 'phone_number'],
    visibilityColumn: 'phone_visibility',
    requiresSecureRead: true,
    sqlTypes: ['text', 'text'],
  },
  {
    key: 'websites_social_links',
    section: 'contact',
    valueColumns: ['websites_social_links'],
    visibilityColumn: 'websites_visibility',
    requiresSecureRead: true,
    sqlTypes: ['jsonb'],
  },
  {
    key: 'gender',
    section: 'contact',
    valueColumns: ['gender'],
    visibilityColumn: 'gender_visibility',
    requiresSecureRead: true,
    sqlTypes: ['text'],
  },
  {
    key: 'pronouns',
    section: 'contact',
    valueColumns: ['pronouns'],
    visibilityColumn: 'pronouns_visibility',
    requiresSecureRead: true,
    sqlTypes: ['text'],
  },
  {
    key: 'birthday',
    section: 'contact',
    valueColumns: ['birthday'],
    visibilityColumn: 'birth_date_visibility',
    requiresSecureRead: true,
    sqlTypes: ['date'],
    note: 'Synchronized alias of birth_date/birth_year; no separate visibility column exists.',
  },
  {
    key: 'birth_date',
    section: 'contact',
    valueColumns: ['birth_date'],
    visibilityColumn: 'birth_date_visibility',
    requiresSecureRead: true,
    sqlTypes: ['date'],
  },
  {
    key: 'birth_year',
    section: 'contact',
    valueColumns: ['birth_year'],
    visibilityColumn: 'birth_year_visibility',
    requiresSecureRead: true,
    sqlTypes: ['integer'],
  },
  {
    key: 'function',
    section: 'work_education',
    valueColumns: ['function'],
    visibilityColumn: 'function_visibility',
    requiresSecureRead: true,
    sqlTypes: ['text'],
  },
  {
    key: 'company',
    section: 'work_education',
    valueColumns: ['company_id'],
    visibilityColumn: 'company_visibility',
    requiresSecureRead: true,
    sqlTypes: ['uuid'],
  },
  {
    key: 'college',
    section: 'work_education',
    valueColumns: ['college_id'],
    visibilityColumn: 'college_visibility',
    requiresSecureRead: true,
    sqlTypes: ['uuid'],
  },
  {
    key: 'college_name',
    section: 'work_education',
    valueColumns: ['college'],
    visibilityColumn: 'college_visibility',
    requiresSecureRead: true,
    sqlTypes: ['text'],
    note: 'Legacy text label; gated by the same college_visibility setting.',
  },
  {
    key: 'high_school',
    section: 'work_education',
    valueColumns: ['high_school_id'],
    visibilityColumn: 'high_school_visibility',
    requiresSecureRead: true,
    sqlTypes: ['uuid'],
  },
  {
    key: 'high_school_name',
    section: 'work_education',
    valueColumns: ['high_school'],
    visibilityColumn: 'high_school_visibility',
    requiresSecureRead: true,
    sqlTypes: ['text'],
    note: 'Legacy text label; gated by the same high_school_visibility setting.',
  },
  {
    key: 'relationship_status',
    section: 'family',
    valueColumns: ['relationship_status'],
    visibilityColumn: 'relationship_visibility',
    requiresSecureRead: true,
    sqlTypes: ['text'],
  },
  {
    key: 'relationship',
    section: 'family',
    valueColumns: ['relationship'],
    visibilityColumn: 'relationship_visibility',
    requiresSecureRead: true,
    sqlTypes: ['text'],
    note: 'Legacy alias retained in the live row; gated by relationship_visibility.',
  },
] as const;

/** Visibility-controlled settings that do not map to a profiles value column. */
export const ADDITIONAL_PROFILE_VISIBILITY_SETTINGS: readonly {
  key: string;
  visibilityColumn: string;
  storedType: string;
  controls: string;
  safeDefault: string;
  note: string;
}[] = [
  {
    key: 'friends_list',
    visibilityColumn: 'friends_visibility',
    storedType: 'text',
    controls: 'friends list',
    safeDefault: 'friends',
    note: 'Owned by the Friends domain; browser relationship checks are not authorization.',
  },
  {
    key: 'following_list',
    visibilityColumn: 'following_visibility',
    storedType: 'boolean',
    controls: 'following list',
    safeDefault: 'false',
    note: 'Boolean visibility flag; not an About profile-column value.',
  },
  {
    key: 'default_privacy',
    visibilityColumn: 'privacy',
    storedType: 'text',
    controls: 'profile-wide default privacy',
    safeDefault: 'private',
    note: 'Owner-only setting with no *_visibility column; not a public field.',
  },
] as const;

/** The browser-side RPC is wired; it stays fail-closed until the reviewed DB function exists. */
export const PROFILE_ABOUT_READ_RPC = 'get_profile_about_fields' as const;

/**
 * Normalize legacy stored spellings to the three supported values.
 * `custom`, unknown, and null values return null and must fail closed for
 * non-owners. Existing valid choices (`public`, `friends`, `only_me`,
 * `private`, and their Title Case variants) are preserved semantically.
 */
export function normalizeProfileVisibility(
  value: string | null | undefined
): ProfileVisibility | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'public') return 'public';
  if (normalized === 'friends') return 'friends';
  if (normalized === 'private' || normalized === 'only_me') return 'private';
  return null;
}

/** Backwards-compatible name used by earlier guards and tests. */
export const normalizeAboutVisibility = normalizeProfileVisibility;

/**
 * Legacy union retained for older UI helpers. The database proposal normalizes
 * all of these spellings to the three supported values before making a decision.
 */
export type AboutVisibilityValue =
  | ProfileVisibility
  | 'only_me'
  | 'custom';

/** Legacy name retained so earlier guards keep compiling. */
export type AboutVisibility = AboutVisibilityValue;

/**
 * The secure browser read is deliberately disabled until an authorized reviewer
 * installs and verifies the reviewed database function. Setting this to true
 * without that verification would not make the read safe; it would only turn on
 * a request to a function that does not yet exist.
 */
export const SECURE_ABOUT_FIELD_READ_AVAILABLE = false as const;

/** One independent owner control per distinct visibility column. */
export const ABOUT_VISIBILITY_EDITORS: readonly {
  visibilityColumn: string;
  label: string;
  section: AboutSectionId;
}[] = ABOUT_PROFILE_FIELDS
  .filter(
    (field, index, fields) =>
      field.requiresSecureRead &&
      field.visibilityColumn !== null &&
      fields.findIndex((candidate) => candidate.visibilityColumn === field.visibilityColumn) === index
  )
  .map((field) => ({
    visibilityColumn: field.visibilityColumn as string,
    label: field.key.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase()),
    section: field.section,
  }));

/**
 * Privacy decision contract for the proposed database function.
 *
 * Callers must supply trusted context. Passing a browser-supplied owner or
 * friend flag here would defeat the purpose; the database function must derive
 * these values itself and return only the allowed fields.
 */
export function canViewAboutField(
  visibility: string | null | undefined,
  viewer: AboutViewerContext
): boolean {
  // The owner is identified by trusted identity in the database, not by a
  // browser parameter. A user cannot be blocked from their own profile row.
  if (viewer.isOwner) return true;

  // Blocking and restriction are authoritative and take precedence over every
  // visibility label, including 'public'.
  if (viewer.isBlocked || viewer.isRestricted) return false;

  const normalized = normalizeProfileVisibility(visibility);
  if (normalized === 'public') return true;
  if (normalized === 'friends') return viewer.isFriend;

  // private, custom, null, and unrecognized values are owner-only.
  return false;
}

/** Every private value column the reviewed RPC may return. */
export const SECURE_ABOUT_OUTPUT_COLUMNS: readonly string[] = Object.freeze(
  Array.from(
    new Set(
      ABOUT_PROFILE_FIELDS.filter((field) => field.requiresSecureRead).flatMap(
        (field) => field.valueColumns
      )
    )
  )
);
