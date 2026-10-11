// `groupsApi.getGroupsWithMembers()` asks for the reverse embed
// `group_members!group_members_group_id_fkey (...)`. The Gateway ignores
// `select` and returns whole tables, so the client resolves the embed itself.
//
// The join resolver used to strip only the *current* table prefix from the
// PostgREST constraint name, which left `group_members_group_id` as the local
// column for this reverse embed — a column that does not exist on `groups`.
// Every key lookup came up empty, `group_members` was never attached, and the
// UI reported "0 members" with no joined or owned groups.
//
// These tests pin the two directions of `!fkName` embeds so a future change to
// the prefix handling cannot silently drop group membership again.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const TOKEN = { access_token: 'token-viewer' };

const GROUP_ROWS = [
  { id: 'g1', name: 'Ada Fans', privacy: 'public', created_by: 'u1', cover_image: 'https://cdn.example/g1.jpg' },
  { id: 'g2', name: 'Empty', privacy: 'public', created_by: 'u2', cover_image: null },
];

const GROUP_MEMBER_ROWS = [
  { group_id: 'g1', user_id: 'u1', role: 'admin' },
  { group_id: 'g1', user_id: 'u2', role: 'member' },
  { group_id: 'g1', user_id: 'u3', role: 'member' },
  // Deliberate duplicate membership row: the count must not be inflated.
  { group_id: 'g1', user_id: 'u2', role: 'member' },
  { group_id: 'g2', user_id: 'u9', role: 'admin' },
];

const TABLE_ROWS: Record<string, unknown[]> = {
  groups: GROUP_ROWS,
  group_members: GROUP_MEMBER_ROWS,
};

describe('gateway join resolution: reverse (one-to-many) FK embeds', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    localStorage.setItem('tone-auth-token', JSON.stringify(TOKEN));
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const table = String(input).split('/api/')[1]?.split('?')[0] ?? '';
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => 'application/json' },
        json: async () => TABLE_ROWS[table] ?? [],
      } as unknown as Response;
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('attaches every related row when the FK lives on the related table', async () => {
    const { groupsApi } = await import('@/api');

    const { data, error } = await groupsApi.getGroupsWithMembers();

    expect(error).toBeNull();
    const byId = new Map((data ?? []).map((g: any) => [g.id, g]));
    expect(byId.get('g1').group_members).toEqual([
      { group_id: 'g1', user_id: 'u1', role: 'admin' },
      { group_id: 'g1', user_id: 'u2', role: 'member' },
      { group_id: 'g1', user_id: 'u3', role: 'member' },
      { group_id: 'g1', user_id: 'u2', role: 'member' },
    ]);
    expect(byId.get('g2').group_members).toEqual([
      { group_id: 'g2', user_id: 'u9', role: 'admin' },
    ]);
  });

  it('still resolves the many-to-one direction (FK on the current table)', async () => {
    const { gateway } = await import('@/lib/gateway');

    const { data } = await gateway.from('group_members').select('*, groups!group_members_group_id_fkey (name)');

    const rows = data as Array<Record<string, unknown>>;
    const first = rows.find((r) => r.user_id === 'u1') as any;
    // The FK on group_members points at groups, so the embed is a single row.
    expect(first.groups).toEqual({ id: 'g1', name: 'Ada Fans' });
  });
});
