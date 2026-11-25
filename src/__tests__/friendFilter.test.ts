// Friend-system filter routing regression test.
//
// The old Gateway had to parse `or=(and(...),and(...))` locally. The direct
// client must instead forward that expression unchanged to the routed Supabase
// project, where PostgREST applies it under RLS. This test pins that behavior
// and that the read is resolved through the shared routing resolver.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { orCalls, query, resolveTableRoute, getClientForRoute } = vi.hoisted(() => {
  const orCalls: string[] = [];
  const query: Record<string, unknown> = {};
  const result = { data: [], error: null };

  Object.assign(query, {
    select: () => query,
    or: (expression: string) => {
      orCalls.push(expression);
      return query;
    },
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    catch: () => Promise.resolve(result),
    finally: (callback?: () => void) => Promise.resolve(result).finally(callback),
  });

  return {
    orCalls,
    query,
    resolveTableRoute: vi.fn(async () => ({
      project: {
        project_key: 'friends-1',
        domain: 'friends',
        project_url: 'https://friends.supabase.co',
        anon_key: 'anon',
        status: 'active',
        priority: 1,
        region: null,
        health_status: null,
      },
      domain: 'friends',
      operation: 'read',
      projectKey: 'friends-1',
    })),
    getClientForRoute: vi.fn(async () => ({
      from: () => query,
    })),
  };
});

vi.mock('@/lib/supabase/routing', () => ({
  resolveTableRoute,
  resolveRpcRoute: vi.fn(),
}));

vi.mock('@/lib/supabase/clientFactory', () => ({
  getClientForRoute,
  getProjectClient: vi.fn(),
  clearClientCache: vi.fn(),
}));

const { dataClient } = await import('@/lib/supabase/dataClient');

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const NESTED_OR = `or=(and(requester_id.eq.${A},receiver_id.eq.${B}),and(requester_id.eq.${B},receiver_id.eq.${A}))`;

beforeEach(() => {
  orCalls.length = 0;
  resolveTableRoute.mockClear();
  getClientForRoute.mockClear();
});

describe('friendship filter forwarding', () => {
  it('forwards the nested or(...) expression unchanged', async () => {
    await dataClient.from('friend_requests').select('*').or(NESTED_OR);

    expect(orCalls).toEqual([NESTED_OR]);
  });

  it('routes the read through the friends domain', async () => {
    await dataClient.from('friend_requests').select('*').or(NESTED_OR);

    expect(resolveTableRoute).toHaveBeenCalledWith('friend_requests', 'read');
    expect(getClientForRoute).toHaveBeenCalledTimes(1);
  });

  it('forwards plain or(...) expressions unchanged', async () => {
    const expression = `or=(requester_id.eq.${A},receiver_id.eq.${A})`;
    await dataClient.from('friend_requests').select('*').or(expression);

    expect(orCalls).toEqual([expression]);
  });
});
