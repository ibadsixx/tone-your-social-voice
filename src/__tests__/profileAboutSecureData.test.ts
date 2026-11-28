// Phase 3G-R: the browser adapter must accept only the reviewed RPC shape and
// must never make an authorization decision or fetch private columns itself.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  loadSecureAboutFields,
  readSecureAboutFieldsFromClient,
} from '@/api/profileAbout';
import { PROFILE_ABOUT_READ_RPC } from '@/lib/profileAboutPrivacy';
import { buildProfileSeo } from '@/lib/profileSeo';

const SRC = resolve(__dirname, '..');
const TARGET_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_UUID = '22222222-2222-4222-8222-222222222222';

const UNAVAILABLE = {
  status: 'unavailable',
  fields: {},
  visibleFields: [],
  visibilitySettings: {},
};

const EXPECTED_RPC_COLUMNS = [
  'about_you',
  'name_pronunciation',
  'email',
  'phone_country_code',
  'phone_number',
  'websites_social_links',
  'gender',
  'pronouns',
  'birthday',
  'birth_date',
  'birth_year',
  'function',
  'company_id',
  'college_id',
  'college',
  'high_school_id',
  'high_school',
  'relationship_status',
  'relationship',
];

function rpcRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const column of EXPECTED_RPC_COLUMNS) row[column] = null;
  return {
    ...row,
    visible_fields: [],
    visibility_settings: {},
    ...overrides,
  };
}

interface RpcCall {
  name: string;
  args: Record<string, string>;
}

function fakeClient(response: { data: unknown; error: unknown }, calls: RpcCall[] = []) {
  return {
    rpc(name: string, args: Record<string, string>) {
      calls.push({ name, args });
      return Promise.resolve(response);
    },
  };
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('Phase 3G-R private About data boundary', () => {
  it('returns an explicit unavailable result without a network request', async () => {
    await expect(loadSecureAboutFields('target-profile-id')).resolves.toEqual(UNAVAILABLE);
  });

  it('does not issue a direct profiles SELECT from the About UI', () => {
    for (const path of [
      'components/AboutSection.tsx',
      'components/ContactBasicInfoForm.tsx',
      'components/FamilyAndRelationships.tsx',
      'components/LifeEventsSection.tsx',
      'components/DetailsAboutYouSection.tsx',
    ]) {
      const source = stripComments(readFileSync(resolve(SRC, path), 'utf8'));
      expect(source, path).not.toMatch(/\.from\(['"]profiles['"]\)\s*\.select\(/);
      expect(source, path).not.toMatch(/\.rpc\(['"]can_view_profile_field['"]/);
    }
  });

  it('renders a distinct unavailable notice in AboutSection', () => {
    const source = stripComments(readFileSync(resolve(SRC, 'components', 'AboutSection.tsx'), 'utf8'));
    expect(source).toContain('loadSecureAboutFields(profileId)');
    expect(source).toContain('data-testid="about-secure-data-unavailable"');
    expect(source).toContain('secureAboutStatus === \'unavailable\'');
  });

  it('does not dereference a null public profile when rendering details', () => {
    const detailsSource = stripComments(
      readFileSync(resolve(SRC, 'components', 'DetailsAboutYouSection.tsx'), 'utf8'),
    );
    expect(detailsSource).toContain('profileId: string');
    expect(detailsSource).toContain('useOtherNames(profileId)');
    expect(detailsSource).not.toMatch(/\bprofile\.id\b/);

    const aboutSource = stripComments(
      readFileSync(resolve(SRC, 'components', 'AboutSection.tsx'), 'utf8'),
    );
    expect(aboutSource).toContain('<DetailsAboutYouSection');
    expect(aboutSource).not.toMatch(/<DetailsAboutYouSection[\s\S]{0,200}\bprofile=\{profile\}/);
    expect(aboutSource).not.toContain("from '@/hooks/useProfile'");
  });
});

describe('Phase 3G-R routed RPC adapter', () => {
  it('sends only the target profile id and never a viewer id or decision', async () => {
    const calls: RpcCall[] = [];
    const client = fakeClient({ data: [rpcRow({ visible_fields: ['about_you'], about_you: 'hi' })], error: null }, calls);

    await readSecureAboutFieldsFromClient(client, TARGET_ID);

    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe(PROFILE_ABOUT_READ_RPC);
    expect(Object.keys(calls[0].args)).toEqual(['p_profile_id']);
    expect(calls[0].args.p_profile_id).toBe(TARGET_ID);
  });

  it('fails closed without calling the RPC for an invalid profile id', async () => {
    const calls: RpcCall[] = [];
    const client = fakeClient({ data: [rpcRow()], error: null }, calls);

    await expect(readSecureAboutFieldsFromClient(client, 'not-a-uuid')).resolves.toEqual(UNAVAILABLE);
    await expect(readSecureAboutFieldsFromClient(client, '')).resolves.toEqual(UNAVAILABLE);
    expect(calls).toEqual([]);
  });

  it('returns owner values and owner-only visibility settings from an explicit row', async () => {
    const visibilitySettings = {
      email_visibility: 'friends',
      birth_date_visibility: 'private',
      relationship_visibility: 'public',
    };
    const client = fakeClient({
      data: [rpcRow({
        visible_fields: ['about_you', 'email', 'phone', 'websites_social_links', 'birth_year', 'company', 'relationship_status'],
        visibility_settings: visibilitySettings,
        about_you: 'Owner note',
        email: ['owner@example.test'],
        phone_country_code: '+1',
        phone_number: '5550000',
        websites_social_links: [{ type: 'website', url: 'https://example.test' }],
        birth_year: 1990,
        company_id: OTHER_UUID,
        relationship_status: 'single',
      })],
      error: null,
    });

    const result = await readSecureAboutFieldsFromClient(client, TARGET_ID);

    expect(result.status).toBe('ready');
    expect(result.visibleFields).toContain('email');
    expect(result.fields.email).toEqual(['owner@example.test']);
    expect(result.fields.company_id).toBe(OTHER_UUID);
    expect(result.fields.birth_year).toBe(1990);
    expect(result.visibilitySettings).toEqual(visibilitySettings);
  });

  it('does not release a value the database did not authorize', async () => {
    const client = fakeClient({
      data: [rpcRow({
        visible_fields: ['about_you'],
        about_you: 'Public note',
        name_pronunciation: 'SHOULD-NOT-BE-RELEASED',
        email: ['should-not-be-released@example.test'],
      })],
      error: null,
    });

    const result = await readSecureAboutFieldsFromClient(client, TARGET_ID);

    expect(result.status).toBe('ready');
    expect(result.fields).not.toHaveProperty('name_pronunciation');
    expect(result.fields).not.toHaveProperty('email');
    expect(result.fields.about_you).toBe('Public note');
  });

  it('distinguishes denied (no authorized fields) from unavailable (bad response)', async () => {
    const deniedClient = fakeClient({ data: [rpcRow({ visible_fields: [] })], error: null });
    await expect(readSecureAboutFieldsFromClient(deniedClient, TARGET_ID)).resolves.toEqual({
      status: 'denied',
      fields: {},
      visibleFields: [],
      visibilitySettings: {},
    });

    const errorClient = fakeClient({ data: null, error: { message: 'rpc failed' } });
    await expect(readSecureAboutFieldsFromClient(errorClient, TARGET_ID)).resolves.toEqual(UNAVAILABLE);

    const malformedClient = fakeClient({ data: [rpcRow({ visible_fields: ['unknown_field'] })], error: null });
    await expect(readSecureAboutFieldsFromClient(malformedClient, TARGET_ID)).resolves.toEqual(UNAVAILABLE);
  });

  it('accepts an authorized null value as genuinely empty, not denied', async () => {
    const client = fakeClient({
      data: [rpcRow({ visible_fields: ['about_you'], about_you: null })],
      error: null,
    });

    const result = await readSecureAboutFieldsFromClient(client, TARGET_ID);
    expect(result.status).toBe('ready');
    expect(result.visibleFields).toEqual(['about_you']);
    expect(result.fields.about_you).toBeNull();
  });

  it('rejects wrong SQL types and non-owner visibility settings', async () => {
    const wrongEmail = fakeClient({
      data: [rpcRow({ visible_fields: ['email'], email: 'not-an-array' })],
      error: null,
    });
    await expect(readSecureAboutFieldsFromClient(wrongEmail, TARGET_ID)).resolves.toEqual(UNAVAILABLE);

    const badUuid = fakeClient({
      data: [rpcRow({ visible_fields: ['company'], company_id: 'not-a-uuid' })],
      error: null,
    });
    await expect(readSecureAboutFieldsFromClient(badUuid, TARGET_ID)).resolves.toEqual(UNAVAILABLE);

    const leakedSettings = fakeClient({
      data: [rpcRow({
        visible_fields: ['about_you'],
        visibility_settings: { vault_pin: 'secret' },
      })],
      error: null,
    });
    await expect(readSecureAboutFieldsFromClient(leakedSettings, TARGET_ID)).resolves.toEqual(UNAVAILABLE);
  });

  it('fails closed when the RPC throws', async () => {
    const client = {
      rpc(): Promise<{ data: unknown; error: unknown }> {
        return Promise.reject(new Error('network unavailable'));
      },
    };
    await expect(readSecureAboutFieldsFromClient(client, TARGET_ID)).resolves.toEqual(UNAVAILABLE);
  });
});

describe('Phase 3G-R SEO and public projection leak guards', () => {
  it('does not put gated profile values into public SEO metadata', () => {
    const seo = buildProfileSeo({
      username: 'jane',
      display_name: 'Jane',
      bio: 'A public bio',
      profile_pic: null,
      // Deliberately injected gated values. They must not appear in metadata.
      email: ['private-value@example.test'],
      company: 'SECRET_COMPANY_VALUE',
      birth_year: 1990,
    } as never, true);

    for (const value of ['private-value@example.test', 'SECRET_COMPANY_VALUE', '1990']) {
      expect(seo.title + seo.description + seo.canonical, value).not.toContain(value);
    }
  });

  it('keeps the public projection to the six approved identity columns', () => {
    const source = stripComments(readFileSync(resolve(SRC, 'api', 'profiles.ts'), 'utf8'));
    expect(source).toMatch(/id,\s*username,\s*display_name,\s*profile_pic,\s*cover_pic,\s*bio/);
    expect(source).not.toMatch(/select\s*\(\s*['"`]\*['"`]\s*\)/i);
  });
});
