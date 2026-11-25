// A routing failure must survive the dataClient boundary with its configCode.
// Losing that code is what let ProfilePage report an ambiguous project route as
// "profile not found" in the first place.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const routing = vi.hoisted(() => ({
  resolveTableRoute: vi.fn(),
  resolveRpcRoute: vi.fn(),
}));

vi.mock('@/lib/supabase/routing', () => routing);
vi.mock('@/lib/supabase/clientFactory', () => ({
  getClientForRoute: vi.fn(),
  getProjectClient: vi.fn(),
  clearClientCache: vi.fn(),
}));
vi.mock('@/lib/supabase/crossProject', () => ({ callEdgeFunction: vi.fn() }));

import { dataClient } from '@/lib/supabase/dataClient';
import { classifyProfileLoadFailure } from '@/lib/profileLoadFailure';

function configError(code: string): Error & { configCode: string } {
  const error = new Error('Multiple active projects for domain profiles');
  return Object.assign(error, { configCode: code });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('profile route error propagation', () => {
  it('preserves AMBIGUOUS_ROUTE through a profiled query', async () => {
    routing.resolveTableRoute.mockRejectedValue(configError('AMBIGUOUS_ROUTE'));

    const result = await dataClient.from('profiles').select('*').eq('username', 'Ada').maybeSingle();

    expect(result.data).toBeNull();
    expect(result.error?.configCode).toBe('AMBIGUOUS_ROUTE');
    expect(classifyProfileLoadFailure(result.error).kind).toBe('routing-config');
  });

  it('preserves DOMAIN_NOT_FOUND through a profiled query', async () => {
    routing.resolveTableRoute.mockRejectedValue(configError('DOMAIN_NOT_FOUND'));

    const result = await dataClient.from('profiles').select('*').eq('username', 'Ada').maybeSingle();

    expect(result.error?.configCode).toBe('DOMAIN_NOT_FOUND');
    expect(classifyProfileLoadFailure(result.error).message).toBe(
      'The profile service is not configured correctly. Please try again later.'
    );
  });
});
