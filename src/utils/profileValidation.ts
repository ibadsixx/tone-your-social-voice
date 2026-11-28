import { Visibility } from '@/components/VisibilitySelector';

export const ALLOWED_VISIBILITY_VALUES: Visibility[] = ["public", "friends", "only_me"];

// Fields that require Title Case values in the DB (per CHECK constraint)
const UPPERCASE_FIELDS = new Set<string>([
  "phone_visibility",
  "websites_visibility",
  "gender_visibility",
  "pronouns_visibility",
  "birth_date_visibility",
  "birth_year_visibility",
]);

// Fields that require lowercase values in the DB (per CHECK constraint)
const LOWERCASE_FIELDS = new Set<string>([
  "email_visibility",
  "college_visibility",
  "company_visibility",
  "function_visibility",
  "high_school_visibility",
  "relationship_status",
  "relationship_visibility",
  "friends_visibility",
]);

// Normalize any input to our internal union (lowercase) and map legacy values
export const normalizeVisibilityValue = (value: any): Visibility | null => {
  if (!value && value !== "") return null;
  const lower = String(value).toLowerCase().replace(/\s+/g, "_");
  if (lower === "private") return "only_me"; // map legacy value
  if ((ALLOWED_VISIBILITY_VALUES as readonly string[]).includes(lower)) return lower as Visibility;
  return null;
};

// Simple sanitizer for basic visibility fields (used in new components)
export const sanitizeVisibility = (value: any): Visibility => {
  const normalized = normalizeVisibilityValue(value);
  return normalized ?? "friends"; // default to friends if invalid
};

// Columns whose live CHECK constraint accepts the canonical lowercase value.
// `relationship_visibility` was added with
// CHECK (public, friends, private), so writing the legacy `only_me` spelling
// there would fail the constraint. Other legacy spellings keep their existing
// DB formatting; the canonical three-value contract is preserved in the UI.
const CANONICAL_PRIVATE_FIELDS = new Set<string>([
  "relationship_visibility",
]);

// Format a normalized visibility value for the DB column casing
export const formatVisibilityForDb = (field: string, value: any): string => {
  const normalized = normalizeVisibilityValue(value) ?? "only_me"; // default safe value
  if (CANONICAL_PRIVATE_FIELDS.has(field)) {
    return normalized === "only_me" ? "private" : normalized;
  }
  if (UPPERCASE_FIELDS.has(field)) {
    // Title case expected by DB CHECK constraint
    if (normalized === "public") return "Public";
    if (normalized === "friends") return "Friends";
    return "Private";
  }
  if (LOWERCASE_FIELDS.has(field)) {
    // Lowercase expected (e.g., friends_visibility using enum)
    return normalized;
  }
  // Default to lowercase for unknown fields
  return normalized;
};

export const validateProfileVisibility = (payload: Record<string, any>): void => {
  const visibilityFields = [
    "phone_visibility",
    "websites_visibility",
    "gender_visibility",
    "pronouns_visibility",
    "birth_date_visibility",
    "birth_year_visibility",
    "email_visibility",
    "college_visibility",
    "company_visibility",
    "function_visibility",
    "high_school_visibility",
    "relationship_visibility",
    "friends_visibility",
  ];

  for (const field of visibilityFields) {
    if (payload[field] !== undefined) {
      const normalized = normalizeVisibilityValue(payload[field]);
      if (normalized && !ALLOWED_VISIBILITY_VALUES.includes(normalized)) {
        throw new Error(`Invalid visibility option for ${field}. Allowed values are public, friends, only_me.`);
      }
    }
  }
};

export const sanitizeProfilePayload = (payload: Record<string, any>): Record<string, any> => {
  const sanitized: Record<string, any> = { ...payload };

  const visibilityFields = [
    "phone_visibility",
    "websites_visibility",
    "gender_visibility",
    "pronouns_visibility",
    "birth_date_visibility",
    "birth_year_visibility",
    "email_visibility",
    "college_visibility",
    "company_visibility",
    "function_visibility",
    "high_school_visibility",
    "relationship_visibility",
    "about_you_visibility",
    "name_pronunciation_visibility",
    "friends_visibility",
  ];

  for (const field of visibilityFields) {
    if (sanitized[field] !== undefined) {
      sanitized[field] = formatVisibilityForDb(field, sanitized[field]);
    }
  }

  // Handle following_visibility as a boolean field (not enum)
  if (sanitized.following_visibility !== undefined) {
    sanitized.following_visibility = Boolean(sanitized.following_visibility);
  }

  return sanitized;
};
