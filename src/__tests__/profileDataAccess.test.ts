// Phase 3G-A: real profile API -> dataClient -> Registry -> PostgREST path.
//
// The UI-level profile tests mock the API seam. This suite deliberately does
// not: it intercepts fetch, answers the Infrastructure Registry read, and then
// asserts the exact Profiles-project REST request and its result. That is the
// local evidence for public-column selection, Central Auth token forwarding,
// project selection, and error-vs-missing classification.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureProfile,
  getProfileById,
  getProfileByUsername,
  PUBLIC_PROFILE_COLUMNS,
} from '@/api/profiles';
import { classifyProfileLoadFailure } from '@/lib/profileLoadFailure';
import { clearClientCache } from '@/lib/supabase/clientFactory';
import { KNOWN_PROJECT_REFS, REGISTRY_PROJECT_KEYS } from '@/lib/supabase/projects';
import {
  clearCurrentAccessToken,
  setCurrentAccessToken,
} from '@/lib/supabase/sessionTokenProvider';
import {
  applyPostgrestFilters,
  INFRA_PROJECTS,
  isInfraRegistryRequest,
  jsonResponse,
  prefersObjectResponse,
  shapePostgrestRows,
} from './infraFixtures';

const PROFILES_ORIGIN = `https://${KNOWN_PROJECT_REFS.profiles}.supabase.co`;
const PUBLIC_COLUMNS = PUBLIC_PROFILE_COLUMNS.split(',').map((column) => column.trim());
const PRIVATE_COLUMNS = [
  'email',
  'phone',
  'phone_number',
  'birthday',
  'birth_date',
  'vault_pin',
  'vault_recovery_code',
  'security_warnings',
  'privacy',
];

type Row = Record<string, unknown>;
type CapturedRequest = { url: URL; init?: RequestInit };

const OWNER: Row = {
  id: 'owner-id',
  username: 'Ada',
  display_name: 'Ada Lovelace',
  profile_pic: 'https://images.test/ada.png',
  cover_pic: 'https://images.test/ada-cover.png',
  bio: 'Mathematician',
  // Deliberately present in the table fixture: none of it may be requested or
  // returned by a normal profile read.
  email: 'ada@secret.test',
  phone: '+1-555-0100',
  birthday: '1815-12-10',
  vault_pin: '1234',
  vault_recovery_code: 'recovery-secret',
  security_warnings: true,
  privacy: 'private',
};

const OTHER: Row = {
  ...OWNER,
  id: 'other-id',
  username: 'Grace',
  display_name: 'Grace Hopper',
  email: 'grace@secret.test',
};

const ROWS = [OWNER, OTHER];
// infraFixtures keeps ordinary test domains on a generic mock origin. Point
// only the approved `profiles-1` row at the real Profiles host so a wrong
// project selection cannot accidentally pass this suite.
const PROJECTS = INFRA_PROJECTS.map((project) =>
  project.domain === 'profiles'
    ? { ...project, project_key: REGISTRY_PROJECT_KEYS.profiles, project_url: PROFILES_ORIGIN }
    : project
);

const captured: CapturedRequest[] = [];
let forcedProfileResponse: ((url: URL, init?: RequestInit) => Response) | null = null;

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  captured.push({ url, init });

  if (isInfraRegistryRequest(input)) return infraRegistryResponseForProjects();

  if (url.origin === PROFILES_ORIGIN && url.pathname === '/rest/v1/profiles') {
    if (forcedProfileResponse) return forcedProfileResponse(url, init);
    const matches = applyPostgrestFilters(ROWS, input).map((row) =>
      Object.fromEntries(PUBLIC_COLUMNS.map((column) => [column, row[column]]))
    );
    return jsonResponse(200, shapePostgrestRows(matches, prefersObjectResponse(init)));
  }

  return jsonResponse(404, { code: 'PGRST116', message: 'unexpected test request' });
});

function infraRegistryResponseForProjects(): Response {
  return jsonResponse(200, PROJECTS);
}

function dataRequests(): CapturedRequest[] {
  return captured.filter(
    ({ url }) => url.origin === PROFILES_ORIGIN && url.pathname === '/rest/v1/profiles'
  );
}

function bearer(request: CapturedRequest): string | null {
  return new Headers(request.init?.headers).get('authorization');
}

function publicRow(row: Row): Row {
  return Object.fromEntries(PUBLIC_COLUMNS.map((column) => [column, row[column]]));
}

function hasPrivateField(row: Row | null): boolean {
  if (!row) return false;
  return Object.keys(row).some((key) =>
    PRIVATE_COLUMNS.some((privateColumn) => key.toLowerCase().includes(privateColumn))
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  captured.length = 0;
  forcedProfileResponse = null;
  clearClientCache();
  setCurrentAccessToken('central-token-1');
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  clearCurrentAccessToken();
  clearClientCache();
  forcedProfileResponse = null;
  vi.unstubAllGlobals();
});

describe('Phase 3G-A direct profile data access', () => {
  it('loads an authenticated user’s own profile from the Profiles project', async () => {
    const result = await getProfileById(OWNER.id as string);

    expect(result.error).toBeNull();
    expect(result.data).toEqual(publicRow(OWNER));
    const request = dataRequests()[0];
    expect(request.url.host).toBe(new URL(PROFILES_ORIGIN).host);
    expect(request.url.searchParams.get('id')).toBe(`eq.${OWNER.id}`);
  });

  it('loads another user’s public profile by id', async () => {
    const result = await getProfileById(OTHER.id as string);

    expect(result.error).toBeNull();
    expect(result.data?.id).toBe(OTHER.id);
    expect(result.data?.username).toBe('Grace');
    expect(dataRequests()).toHaveLength(1);
  });

  it('looks up a public profile by normalized username without a fallback query', async () => {
    const result = await getProfileByUsername('  @Ada  ');

    expect(result.error).toBeNull();
    expect(result.data?.username).toBe('Ada');
    expect(dataRequests()).toHaveLength(1);
    expect(dataRequests()[0].url.searchParams.get('username')).toBe('eq.Ada');
  });

  it('never selects or returns private profile fields', async () => {
    const byId = await getProfileById(OWNER.id as string);
    const byUsername = await getProfileByUsername('Ada');

    for (const request of dataRequests()) {
      expect(request.url.searchParams.get('select')).toBe(PUBLIC_COLUMNS.join(','));
      expect(request.url.searchParams.get('select')).not.toContain('*');
      expect(request.url.searchParams.get('select')).not.toMatch(/email|phone|birth|vault|security|privacy/i);
    }
    expect(Object.keys(byId.data ?? {}).sort()).toEqual([...PUBLIC_COLUMNS].sort());
    expect(Object.keys(byUsername.data ?? {}).sort()).toEqual([...PUBLIC_COLUMNS].sort());
    expect(hasPrivateField(byId.data as unknown as Row | null)).toBe(false);
    expect(hasPrivateField(byUsername.data as unknown as Row | null)).toBe(false);
  });

  it('forwards the current Central Auth token through the cached profiles client', async () => {
    await getProfileById(OWNER.id as string);
    setCurrentAccessToken('central-token-2');
    await getProfileById(OTHER.id as string);

    expect(dataRequests().map(bearer)).toEqual([
      'Bearer central-token-1',
      'Bearer central-token-2',
    ]);
  });

  it('selects profiles-1 through the Registry before issuing the REST read', async () => {
    await getProfileById(OWNER.id as string);

    const registryRequests = captured.filter(({ url }) => isInfraRegistryRequest(url));
    expect(registryRequests.length).toBeGreaterThan(0);
    expect(registryRequests[0].url.pathname).toBe('/rest/v1/infrastructure_projects_public');
    expect(dataRequests()[0].url.host).toBe(new URL(PROFILES_ORIGIN).host);
    expect(PROJECTS.find((project) => project.domain === 'profiles')?.project_key).toBe(
      REGISTRY_PROJECT_KEYS.profiles
    );
  });

  it('classifies JWT and RLS failures instead of turning them into a missing profile', async () => {
    const cases = [
      {
        body: { code: 'PGRST301', message: 'JWT could not be decoded' },
        status: 401,
        kind: 'authentication',
      },
      {
        body: { code: '401', message: 'Unauthorized' },
        status: 401,
        kind: 'authentication',
      },
      {
        body: { code: '42501', message: 'permission denied for table profiles' },
        status: 403,
        kind: 'access-denied',
      },
      {
        body: { code: '403', message: 'forbidden' },
        status: 403,
        kind: 'access-denied',
      },
    ] as const;

    for (const testCase of cases) {
      clearClientCache();
      forcedProfileResponse = () => jsonResponse(testCase.status, testCase.body);
      const result = await getProfileById(OWNER.id as string);

      expect(result.data).toBeNull();
      expect(result.error).not.toBeNull();
      expect(classifyProfileLoadFailure(result.error).kind).toBe(testCase.kind);
    }
  });

  it('distinguishes a readable empty result from an authorization failure', async () => {
    forcedProfileResponse = (_url, init) =>
      jsonResponse(200, shapePostgrestRows([], prefersObjectResponse(init)));

    const missing = await getProfileById('missing-id');
    expect(missing).toEqual({ data: null, error: null });

    clearClientCache();
    forcedProfileResponse = () =>
      jsonResponse(401, { code: 'PGRST301', message: 'No suitable key or wrong key type' });

    const unauthorized = await getProfileById(OWNER.id as string);
    expect(unauthorized.data).toBeNull();
    expect(unauthorized.error).not.toBeNull();
    expect(classifyProfileLoadFailure(unauthorized.error).kind).toBe('authentication');
    expect(unauthorized).not.toEqual({ data: null, error: null });
  });

  it('uses no Gateway or Edge Function request for profile display data', async () => {
    await getProfileById(OWNER.id as string);
    await getProfileByUsername('Ada');
    await ensureProfile({ id: OWNER.id as string, email: OWNER.email as string });

    const forbidden = captured.filter(({ url }) =>
      url.pathname.startsWith('/functions/v1/') ||
      url.pathname.startsWith('/api/') ||
      url.hostname.includes('vercel.app')
    );
    expect(forbidden).toEqual([]);
    expect(dataRequests().every(({ url }) => url.pathname === '/rest/v1/profiles')).toBe(true);
  });

  it('does not create or query an Auth user while ensuring a profile', async () => {
    await ensureProfile({ id: OWNER.id as string, email: OWNER.email as string });

    const authWritesOrLookups = captured.filter(({ url, init }) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      return (
        url.pathname.startsWith('/auth/v1/') ||
        (url.pathname === '/rest/v1/users' && method !== 'GET')
      );
    });

    expect(authWritesOrLookups).toEqual([]);
    expect(dataRequests().every(({ url }) => url.pathname === '/rest/v1/profiles')).toBe(true);
  });
});
