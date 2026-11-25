// Route username normalization and ambiguity at the profile API boundary.
// The page passes a decoded route segment here; the API must not turn a bad
// segment or a case-folded collision into a "profile not found" answer.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '@/lib/supabase/dataClient';
import type { Profile } from '@/api/profiles';

const query = vi.hoisted(() => ({
  from: vi.fn(),
  eq: vi.fn(),
  ilike: vi.fn(),
  limit: vi.fn(),
  maybeSingle: vi.fn(),
}));

const responses = vi.hoisted(() => ({
  exact: null as ApiResult<Profile> | null,
  ilike: null as ApiResult<Profile[]> | null,
}));

vi.mock('@/lib/supabase/dataClient', () => {
  const builder = {
    select: vi.fn(() => builder),
    eq: (...args: unknown[]) => {
      query.eq(...args);
      return builder;
    },
    ilike: (...args: unknown[]) => {
      query.ilike(...args);
      return builder;
    },
    limit: (...args: unknown[]) => {
      query.limit(...args);
      return Promise.resolve(responses.ilike ?? { data: [], error: null });
    },
    maybeSingle: () => Promise.resolve(responses.exact ?? { data: null, error: null }),
  };
  return {
    dataClient: {
      from: (...args: unknown[]) => {
        query.from(...args);
        return builder;
      },
    },
  };
});

import { getProfileByUsername } from '@/api/profiles';

const profile = (username: string): Profile => ({
  id: 'p1',
  username,
  display_name: 'Ada',
  profile_pic: null,
  cover_pic: null,
  bio: null,
  location: null,
  website: null,
  manual_status: null,
  status_visibility: null,
  notification_sounds: false,
  do_not_disturb_until: null,
  dark_mode: false,
  show_read_indicator: false,
  check_keys_in_conversations: false,
  remember_browser: false,
  disable_auto_uploads: false,
  preview_mode: false,
  vault_pin: null,
  vault_recovery_code: null,
  security_warnings: false,
  font_scale: null,
  reduce_motion: false,
  reduce_transparency: false,
  high_contrast: false,
  created_at: '2026-01-01T00:00:00Z',
});

beforeEach(() => {
  vi.clearAllMocks();
  responses.exact = { data: profile('Ada'), error: null };
  responses.ilike = { data: [], error: null };
});

describe('getProfileByUsername', () => {
  it('normalizes an @-prefixed, padded route segment before the exact query', async () => {
    const result = await getProfileByUsername('  @Ada  ');

    expect(result.data?.username).toBe('Ada');
    expect(query.from).toHaveBeenCalledWith('profiles');
    expect(query.eq).toHaveBeenCalledWith('username', 'Ada');
    expect(query.ilike).not.toHaveBeenCalled();
  });

  it('rejects an unusable segment without querying or fabricating a 404 row', async () => {
    const result = await getProfileByUsername('   ');

    expect(result.data).toBeNull();
    expect(result.error?.code).toBe('INVALID_ROUTE');
    expect(query.from).not.toHaveBeenCalled();
  });

  it('falls back to a single case-insensitive match when exact lookup finds nothing', async () => {
    responses.exact = { data: null, error: null };
    responses.ilike = { data: [profile('ada')], error: null };

    const result = await getProfileByUsername('Ada');

    expect(result.data?.username).toBe('ada');
    expect(query.ilike).toHaveBeenCalledWith('username', 'Ada');
  });

  it('escapes LIKE wildcards in a literal username', async () => {
    responses.exact = { data: null, error: null };
    responses.ilike = { data: [profile('a_da')], error: null };

    await getProfileByUsername('a_da');

    expect(query.ilike).toHaveBeenCalledWith('username', 'a\\_da');
  });

  it('reports a case-folded collision as ambiguity instead of picking a row', async () => {
    responses.exact = { data: null, error: null };
    responses.ilike = { data: [profile('Ada'), profile('ada')], error: null };

    const result = await getProfileByUsername('ada');

    expect(result.data).toBeNull();
    expect(result.error?.code).toBe('AMBIGUOUS_USERNAME');
  });

  it('propagates routing/config errors from the exact query unchanged', async () => {
    responses.exact = {
      data: null,
      error: {
        message: 'Multiple active projects for domain profiles',
        configCode: 'AMBIGUOUS_ROUTE',
      },
    };

    const result = await getProfileByUsername('Ada');

    expect(result.error?.configCode).toBe('AMBIGUOUS_ROUTE');
    expect(query.ilike).not.toHaveBeenCalled();
  });
});
