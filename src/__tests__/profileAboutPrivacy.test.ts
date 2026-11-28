// Phase 3G-R contract tests for About field privacy.
//
// These tests describe the rules the approved database-side reader must apply.
// They are deliberately not a browser security boundary: the browser has no
// grant on private profiles columns and must never filter fetched private rows.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ABOUT_PROFILE_FIELDS,
  ABOUT_VISIBILITY_EDITORS,
  PROFILE_ABOUT_READ_RPC,
  SECURE_ABOUT_FIELD_READ_AVAILABLE,
  canViewAboutField,
  normalizeAboutVisibility,
  type AboutViewerContext,
} from '@/lib/profileAboutPrivacy';

const OWNER: AboutViewerContext = {
  isOwner: true,
  isFriend: false,
  isBlocked: false,
  isRestricted: false,
};

const PUBLIC_VISITOR: AboutViewerContext = {
  isOwner: false,
  isFriend: false,
  isBlocked: false,
  isRestricted: false,
};

const FRIEND: AboutViewerContext = {
  ...PUBLIC_VISITOR,
  isFriend: true,
};

const BLOCKED: AboutViewerContext = {
  ...FRIEND,
  isBlocked: true,
};

const RESTRICTED: AboutViewerContext = {
  ...FRIEND,
  isRestricted: true,
};

describe('Phase 3G-R About field map', () => {
  it('maps every supported private profiles field to its own visibility column', () => {
    const privateFields = ABOUT_PROFILE_FIELDS.filter((field) => field.requiresSecureRead);

    expect(privateFields.length).toBeGreaterThan(0);
    for (const field of privateFields) {
      expect(field.visibilityColumn, `${field.key} must have a visibility column`).toBeTruthy();
      expect(field.valueColumns.length, `${field.key} must name explicit columns`).toBeGreaterThan(0);
      expect(field.valueColumns.every((column) => column.includes('visibility'))).toBe(false);
      expect(field.sqlTypes.length, `${field.key} must declare SQL types`).toBeGreaterThan(0);
    }

    // Includes the live aliases that must remain gated by the shared visibility
    // column (birthday, college_name, high_school_name, relationship).
    const keys = privateFields.map((field) => field.key);
    expect(keys).toEqual([
      'about_you',
      'name_pronunciation',
      'email',
      'phone',
      'websites_social_links',
      'gender',
      'pronouns',
      'birthday',
      'birth_date',
      'birth_year',
      'function',
      'company',
      'college',
      'college_name',
      'high_school',
      'high_school_name',
      'relationship_status',
      'relationship',
    ]);

    // Exactly one independent owner editor per distinct visibility column.
    expect(ABOUT_VISIBILITY_EDITORS.map((editor) => editor.visibilityColumn)).toEqual([
      'about_you_visibility',
      'name_pronunciation_visibility',
      'email_visibility',
      'phone_visibility',
      'websites_visibility',
      'gender_visibility',
      'pronouns_visibility',
      'birth_date_visibility',
      'birth_year_visibility',
      'function_visibility',
      'company_visibility',
      'college_visibility',
      'high_school_visibility',
      'relationship_visibility',
    ]);
  });

  it('keeps bio on the approved public projection', () => {
    const bio = ABOUT_PROFILE_FIELDS.find((field) => field.key === 'bio');
    expect(bio).toBeDefined();
    expect(bio?.valueColumns).toEqual(['bio']);
    expect(bio?.visibilityColumn).toBeNull();
    expect(bio?.requiresSecureRead).toBe(false);
  });

  it('advertises only a fail-closed routed RPC, never a private profiles SELECT', () => {
    expect(SECURE_ABOUT_FIELD_READ_AVAILABLE).toBe(false);
    expect(PROFILE_ABOUT_READ_RPC).toBe('get_profile_about_fields');

    const source = readFileSync(resolve(__dirname, '..', 'api', 'profileAbout.ts'), 'utf8');
    expect(source).not.toMatch(/from\s+['"]@\/lib\/supabase\/dataClient['"]/);
    expect(source).not.toMatch(/\.from\(['"]profiles['"]\)/);
    expect(source).toMatch(/\.rpc\(PROFILE_ABOUT_READ_RPC, \{ p_profile_id: profileId \}\)/);
    // No viewer id, friendship assertion, block flag, or authorization decision
    // may be supplied by the browser.
    expect(source).not.toMatch(/p_viewer|viewer_id|is_friend|is_blocked|is_restricted/i);
  });

  it('routes the About field read to the Profiles domain', () => {
    const routing = readFileSync(resolve(__dirname, '..', 'lib', 'supabase', 'routing.ts'), 'utf8');
    expect(routing).toMatch(/get_profile_about_fields:\s*['"]profiles['"]/);
  });

  it('does not fall back to a gateway, edge function, proxy, or service-role read', () => {
    const source = readFileSync(resolve(__dirname, '..', 'api', 'profileAbout.ts'), 'utf8');
    for (const forbidden of [
      /callEdgeFunction/,
      /supabase\.functions/,
      /service_role/,
      /SERVICE_ROLE/i,
      /fetch\(\s*['"]http/,
      /gateway/i,
      /proxy/i,
    ]) {
      expect(source, String(forbidden)).not.toMatch(forbidden);
    }
  });
});

describe('Phase 3G-R About visibility rules', () => {
  it('normalizes legacy values but fails closed for unknown values', () => {
    expect(normalizeAboutVisibility('Public')).toBe('public');
    expect(normalizeAboutVisibility('friends')).toBe('friends');
    expect(normalizeAboutVisibility('Only Me')).toBe('private');
    expect(normalizeAboutVisibility('only_me')).toBe('private');
    expect(normalizeAboutVisibility('private')).toBe('private');
    expect(normalizeAboutVisibility('custom')).toBeNull();
    expect(normalizeAboutVisibility(null)).toBeNull();
    expect(normalizeAboutVisibility('everyone')).toBeNull();
  });

  it('lets the owner see every own field, including owner-only values', () => {
    for (const visibility of ['public', 'friends', 'only_me', 'private', 'custom', null, 'unknown']) {
      expect(canViewAboutField(visibility, OWNER), `owner/${visibility}`).toBe(true);
    }
  });

  it('shows public visitors only public fields', () => {
    expect(canViewAboutField('public', PUBLIC_VISITOR)).toBe(true);
    for (const visibility of ['friends', 'only_me', 'private', 'custom', null, 'unknown']) {
      expect(canViewAboutField(visibility, PUBLIC_VISITOR), `guest/${visibility}`).toBe(false);
    }
  });

  it('shows friends public and friends-only fields only', () => {
    expect(canViewAboutField('public', FRIEND)).toBe(true);
    expect(canViewAboutField('friends', FRIEND)).toBe(true);
    for (const visibility of ['only_me', 'private', 'custom', null, 'unknown']) {
      expect(canViewAboutField(visibility, FRIEND), `friend/${visibility}`).toBe(false);
    }
  });

  it('denies blocked viewers even for friends and public fields', () => {
    expect(canViewAboutField('public', BLOCKED)).toBe(false);
    expect(canViewAboutField('friends', BLOCKED)).toBe(false);
    expect(canViewAboutField('only_me', BLOCKED)).toBe(false);
  });

  it('denies restricted viewers even for friends and public fields', () => {
    expect(canViewAboutField('public', RESTRICTED)).toBe(false);
    expect(canViewAboutField('friends', RESTRICTED)).toBe(false);
    expect(canViewAboutField('only_me', RESTRICTED)).toBe(false);
  });

  it('applies a visibility change to the very next read', () => {
    const settings: Record<string, string> = { email_visibility: 'public' };

    expect(canViewAboutField(settings.email_visibility, PUBLIC_VISITOR)).toBe(true);
    expect(canViewAboutField(settings.email_visibility, FRIEND)).toBe(true);

    settings.email_visibility = 'friends';
    expect(canViewAboutField(settings.email_visibility, PUBLIC_VISITOR)).toBe(false);
    expect(canViewAboutField(settings.email_visibility, FRIEND)).toBe(true);

    settings.email_visibility = 'private';
    expect(canViewAboutField(settings.email_visibility, FRIEND)).toBe(false);
    expect(canViewAboutField(settings.email_visibility, OWNER)).toBe(true);

    settings.email_visibility = 'public';
    expect(canViewAboutField(settings.email_visibility, PUBLIC_VISITOR)).toBe(true);
  });

  it('keeps the R proposal identity-derived, explicit-column, hardened, and blocked', () => {
    const raw = readFileSync(
      resolve(
        __dirname,
        '..',
        '..',
        '..',
        'TONE_PHASE_3G_R_PROFILE_FIELD_PRIVACY_READ_PROPOSAL.sql'
      ),
      'utf8'
    );
    // Rule text says "SELECT *" as a warning; ignore line comments when
    // asserting the executable sketch itself.
    const sql = raw
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');

    expect(raw).toContain('DO NOT EXECUTE');
    expect(raw).toContain('get_profile_about_fields(p_profile_id uuid)');
    expect(raw).toContain('auth.uid()');
    expect(raw).toContain('RETURNS TABLE (');
    expect(raw).not.toMatch(/RETURNS\s+SETOF\s+profiles/i);
    // Every DDL statement is deliberately commented out: no live object changes.
    expect(sql.trim()).toBe('');
    // SECURITY DEFINER is justified and hardened with a fixed search path.
    expect(raw).toContain('SECURITY DEFINER justification');
    expect(raw).toContain('SET search_path = ');
    // Authoritative Blocking/Friends sources are documented, not invented.
    expect(raw).toContain('<VERIFIED_PROFILES_AUTHORIZATION_PROJECTION>');
    expect(raw).toContain('Friends domain');
  });
});
