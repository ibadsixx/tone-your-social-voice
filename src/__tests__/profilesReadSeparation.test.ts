// Phase 3G-N guards for the application-side public/private Profiles split.
//
// These are source-level contract tests. A request mock can prove one endpoint,
// but it cannot stop a new component from reintroducing a broad nested profile
// embed or a direct private-column SELECT. This suite walks application source
// (not tests or generated types) and fails when either boundary regresses.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PUBLIC_PROFILE_COLUMNS } from '@/api/profiles';

const SRC = resolve(__dirname, '..');
const PUBLIC_COLUMNS = PUBLIC_PROFILE_COLUMNS.split(',').map((c) => c.trim());

const PRIVATE_PROFILE_COLUMNS = [
  'email',
  'phone',
  'phone_number',
  'phone_country_code',
  'birthday',
  'birth_date',
  'birth_year',
  'website',
  'websites_social_links',
  'gender',
  'pronouns',
  'relationship_status',
  'relationship_visibility',
  'about_you',
  'about_you_visibility',
  'name_pronunciation',
  'name_pronunciation_visibility',
  'manual_status',
  'notification_sounds',
  'do_not_disturb_until',
  'dark_mode',
  'show_read_indicator',
  'check_keys_in_conversations',
  'remember_browser',
  'disable_auto_uploads',
  'preview_mode',
  'security_warnings',
  'vault_pin',
  'vault_recovery_code',
  'font_scale',
  'reduce_motion',
  'reduce_transparency',
  'high_contrast',
  'privacy',
  'friends_visibility',
  'following_visibility',
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
  'company_id',
  'college_id',
  'high_school_id',
  'last_seen_at',
  'created_at',
];

const REPAIRED_PUBLIC_PATHS = [
  'components/OverviewSection.tsx',
  'components/AboutSection.tsx',
  'components/ContactBasicInfoForm.tsx',
  'components/FamilyAndRelationships.tsx',
  'components/DetailsAboutYouSection.tsx',
  'components/PrivacyCheckup.tsx',
  'components/PrivacySelector.tsx',
  'components/ProfileHeader.tsx',
  'components/messages/ChatInfoPanel.tsx',
  'components/settings/DisplayAndAccessibility.tsx',
  'components/settings/ProfilesAndPersonalDetails.tsx',
  'components/settings/SettingsLanding.tsx',
  'pages/PageDetail.tsx',
  'pages/ProfilePage.tsx',
  'pages/Settings.tsx',
  'hooks/useConversations.ts',
  'hooks/useFriendsList.ts',
  'hooks/useProfile.tsx',
  'hooks/useProfileSeo.ts',
  'hooks/useStatusVisibility.ts',
  'api/profiles.ts',
];

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue;
      files.push(...walk(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry)) continue;
    // Generated Supabase row types describe the whole schema; they are not reads.
    if (full.endsWith(join('integrations', 'supabase', 'types.ts'))) continue;
    files.push(full);
  }
  return files;
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// Extract the literal passed to `.from('profiles').select(...)`. Calls that use
// the canonical constant resolve to its name, which contains no private column.
function profileSelectLiterals(source: string): string[] {
  const pattern = /\.from\(\s*['"]profiles['"]\s*\)[\s\S]{0,500}?\.select\(\s*(['"`])([\s\S]*?)\1\s*\)/g;
  return [...source.matchAll(pattern)].map((match) => match[2]);
}

function privateColumnsIn(select: string): string[] {
  const normalized = select.toLowerCase();
  return PRIVATE_PROFILE_COLUMNS.filter((column) =>
    new RegExp(`(^|[^a-z0-9_])${column}([^a-z0-9_]|$)`).test(normalized)
  );
}

// Matches PostgREST embeds such as `profiles!posts_user_id_fkey (...)`,
// `sender_profile:profiles!messages_sender_id_fkey(...)`, and
// `profiles:user_id (...)`, including embeds nested inside `shared_post:...`.
function profileEmbedColumns(source: string): string[] {
  const pattern = /(?:[A-Za-z_]\w*:)?profiles(?:(?:!|:)[A-Za-z_]\w*)?\s*\(([^)]*)\)/g;
  return [...source.matchAll(pattern)].map((match) => match[1].trim());
}

describe('Phase 3G-N profile read separation', () => {
  it('passes embedded selects through PostgREST without a client-side join resolver', () => {
    const source = stripComments(readFileSync(join(SRC, 'lib', 'supabase', 'dataClient.ts'), 'utf8'));

    expect(source).not.toMatch(/resolveJoins|parseTopLevelEntries|hasNestedJoins/);
    expect(source).not.toMatch(/\.select\(columns\)/);
    expect(source).toMatch(/const primarySelect = this\.selectColumns/);
  });

  it('uses explicit public columns for every embedded profile join', () => {
    const offenders: string[] = [];
    let embedCount = 0;

    for (const file of walk(SRC)) {
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const columns of profileEmbedColumns(source)) {
        embedCount++;
        const relativePath = relative(SRC, file);
        const requested = columns
          .split(',')
          .map((column) => column.trim())
          .filter(Boolean);
        if (requested.length === 0 || requested.some((column) => !PUBLIC_COLUMNS.includes(column))) {
          offenders.push(`${relativePath}: ${columns || '<empty>'}`);
        }
      }
    }

    expect(embedCount).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it('never selects private profile columns in application source', () => {
    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const select of profileSelectLiterals(source)) {
        const privateColumns = privateColumnsIn(select);
        if (privateColumns.length > 0) {
          offenders.push(`${relative(SRC, file)}: ${privateColumns.join(', ')}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keeps every repaired public path free of private profile reads and new fallbacks', () => {
    for (const path of REPAIRED_PUBLIC_PATHS) {
      const source = stripComments(readFileSync(join(SRC, path), 'utf8'));
      for (const select of profileSelectLiterals(source)) {
        expect(privateColumnsIn(select), `${path}: ${select}`).toEqual([]);
      }
      // The SEO indexing sidecar is pre-existing; no profile read falls back to
      // a new Edge Function or backend proxy in these paths.
      expect(source, path).not.toMatch(/callEdgeFunction\(/);
    }
  });

  it('does not assume private columns are present on public profile objects', () => {
    const offenders: string[] = [];
    // `created_at` is outside the public projection but is explicitly optional
    // and guarded in ProfileHeader, so it is not an unsafe field assumption.
    const unsafeFields = PRIVATE_PROFILE_COLUMNS.filter((column) => column !== 'created_at');
    const privateFieldPattern = new RegExp(
      `\\b(?:profile|userProfile|adminProfile)\\??\\.(?:${unsafeFields.join('|')})\\b`
    );

    for (const path of REPAIRED_PUBLIC_PATHS) {
      const source = stripComments(readFileSync(join(SRC, path), 'utf8'));
      if (privateFieldPattern.test(source)) offenders.push(path);
    }

    expect(offenders).toEqual([]);
  });
});
