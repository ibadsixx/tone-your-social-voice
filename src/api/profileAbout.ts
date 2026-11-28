// Phase 3G-R — browser entry point for field-level private About reads.
//
// Security boundary statement:
//   This module never SELECTs private `public.profiles` columns. It calls one
//   narrow, reviewed Profiles RPC with the target profile id only. The database
//   derives the viewer from the Central Auth JWT, applies saved visibility and
//   authoritative Friends/Blocking state, and returns only authorized columns.
//
//   The RPC does not yet exist and SECURE_ABOUT_FIELD_READ_AVAILABLE is false.
//   Every request therefore fails closed as `unavailable`. After an authorized
//   reviewer installs and verifies the SQL proposal, that single flag may be
//   turned on; the rest of this adapter is already written to accept only the
//   reviewed output shape and never to substitute a browser authorization
//   decision.

import { getProjectClient } from '@/lib/supabase/clientFactory';
import {
  ABOUT_PROFILE_FIELDS,
  ABOUT_VISIBILITY_EDITORS,
  PROFILE_ABOUT_READ_RPC,
  SECURE_ABOUT_FIELD_READ_AVAILABLE,
  SECURE_ABOUT_OUTPUT_COLUMNS,
} from '@/lib/profileAboutPrivacy';

export type AboutSecureDataStatus = 'loading' | 'unavailable' | 'denied' | 'ready';

export interface AboutSecureDataResult {
  status: Exclude<AboutSecureDataStatus, 'loading'>;
  /** Authorized values only. Absent keys were not authorized by the database. */
  fields: Readonly<Record<string, unknown>>;
  /**
   * Logical field keys the database explicitly authorized. A key present here
   * with a null value is genuinely missing; a key absent here is denied. An
   * `unavailable` status means neither conclusion is possible yet.
   */
  visibleFields: readonly string[];
  /** Owner-only saved settings; never returned to a visitor by the RPC. */
  visibilitySettings: Readonly<Record<string, string | null>>;
}

interface SecureAboutRpcClient {
  rpc(
    name: string,
    args: Readonly<Record<string, string>>
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

const SECURE_FIELD_KEYS: readonly string[] = Object.freeze(
  ABOUT_PROFILE_FIELDS.filter((field) => field.requiresSecureRead).map((field) => field.key)
);

const COLUMN_OWNERS: Readonly<Record<string, readonly string[]>> = Object.freeze(
  ABOUT_PROFILE_FIELDS.filter((field) => field.requiresSecureRead).reduce<
    Record<string, string[]>
  >((owners, field) => {
    for (const column of field.valueColumns) {
      owners[column] = Array.from(new Set([...(owners[column] ?? []), field.key]));
    }
    return owners;
  }, {})
);

const COLUMN_TYPES: Readonly<Record<string, readonly string[]>> = Object.freeze(
  ABOUT_PROFILE_FIELDS.filter((field) => field.requiresSecureRead).reduce<
    Record<string, string[]>
  >((types, field) => {
    for (const column of field.valueColumns) {
      types[column] = Array.from(new Set([...(types[column] ?? []), ...field.sqlTypes]));
    }
    return types;
  }, {})
);

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function unavailable(): AboutSecureDataResult {
  return Object.freeze({
    status: 'unavailable' as const,
    fields: Object.freeze({}),
    visibleFields: Object.freeze([]),
    visibilitySettings: Object.freeze({}),
  });
}

function denied(): AboutSecureDataResult {
  return Object.freeze({
    status: 'denied' as const,
    fields: Object.freeze({}),
    visibleFields: Object.freeze([]),
    visibilitySettings: Object.freeze({}),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function matchesDeclaredType(column: string, value: unknown): boolean {
  if (value === null) return true;
  const types = COLUMN_TYPES[column] ?? [];

  if (types.includes('integer') || types.includes('number')) {
    return typeof value === 'number' && Number.isFinite(value);
  }
  if (types.includes('jsonb')) {
    return typeof value === 'object';
  }
  if (types.some((type) => type.includes('[]'))) {
    return (
      Array.isArray(value) &&
      value.every((entry) => typeof entry === 'string' || entry === null)
    );
  }
  if (types.includes('uuid')) {
    return typeof value === 'string' && UUID_PATTERN.test(value);
  }
  return typeof value === 'string';
}

function normalizeVisibleFields(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const allowed = new Set(SECURE_FIELD_KEYS);
  const unique = new Set<string>();
  for (const value of raw) {
    if (typeof value !== 'string' || !allowed.has(value)) return null;
    unique.add(value);
  }
  return [...unique];
}

function normalizeVisibilitySettings(
  raw: unknown
): Record<string, string | null> | null {
  if (raw === null || raw === undefined) return {};
  if (!isRecord(raw)) return null;

  const allowed = new Set(ABOUT_VISIBILITY_EDITORS.map((editor) => editor.visibilityColumn));
  const settings: Record<string, string | null> = {};
  for (const [column, value] of Object.entries(raw)) {
    if (!allowed.has(column)) return null;
    if (value === null) {
      settings[column] = null;
    } else if (typeof value === 'string') {
      settings[column] = value;
    } else {
      return null;
    }
  }
  return settings;
}

/**
 * Parse and allow-list one RPC response. Exported for focused tests; it takes
 * an already-routed Profiles client and never accepts a viewer identity.
 */
export async function readSecureAboutFieldsFromClient(
  client: SecureAboutRpcClient,
  profileId: string
): Promise<AboutSecureDataResult> {
  if (typeof profileId !== 'string' || !UUID_PATTERN.test(profileId)) {
    return unavailable();
  }

  let response: { data: unknown; error: unknown };
  try {
    // The only argument is the target profile resolved from the public route.
    // No viewer id, friendship assertion, block flag, or decision is sent.
    response = await client.rpc(PROFILE_ABOUT_READ_RPC, { p_profile_id: profileId });
  } catch {
    return unavailable();
  }

  if (response.error) return unavailable();

  const row = Array.isArray(response.data) ? response.data[0] : response.data;
  if (!isRecord(row)) return denied();

  const visibleFields = normalizeVisibleFields(row.visible_fields);
  if (visibleFields === null) return unavailable();
  if (visibleFields.length === 0) return denied();

  const visibilitySettings = normalizeVisibilitySettings(row.visibility_settings);
  if (visibilitySettings === null) return unavailable();

  const visible = new Set(visibleFields);
  const fields: Record<string, unknown> = {};

  for (const column of SECURE_ABOUT_OUTPUT_COLUMNS) {
    if (!Object.prototype.hasOwnProperty.call(row, column)) continue;
    const owners = COLUMN_OWNERS[column] ?? [];
    if (!owners.some((key) => visible.has(key))) continue;

    const value = row[column];
    if (!matchesDeclaredType(column, value)) return unavailable();
    fields[column] = value;
  }

  return Object.freeze({
    status: 'ready' as const,
    fields: Object.freeze(fields),
    visibleFields: Object.freeze(visibleFields),
    visibilitySettings: Object.freeze(visibilitySettings),
  });
}

/**
 * Load About fields through the routed Profiles client. The Central Auth JWT is
 * attached by the existing client factory; this module neither reads nor sends
 * a token itself.
 */
export async function loadSecureAboutFields(profileId: string): Promise<AboutSecureDataResult> {
  if (!SECURE_ABOUT_FIELD_READ_AVAILABLE) return unavailable();

  try {
    const { client } = await getProjectClient({ domain: 'profiles', operation: 'read' });
    return await readSecureAboutFieldsFromClient(
      client as unknown as SecureAboutRpcClient,
      profileId
    );
  } catch {
    return unavailable();
  }
}
