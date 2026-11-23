// Client factory tests.
// Verifies client caching, domain-based config resolution, and cache management.
// The Supabase JS SDK is mocked; no real connection is made.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  getDomainProjectConfig,
  getDomainSupabaseClient,
  getCachedClient,
  createClientForProject,
  clearClientCache,
  getCachedClientCount,
} from '@/lib/supabase/clientFactory';
import type { InfrastructureProject } from '@/lib/supabase/types';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

const mockCreateClient = vi.mocked(createClient);

const mockProject: InfrastructureProject = {
  project_key: 'music_1',
  domain: 'music',
  project_url: 'https://music.supabase.co',
  anon_key: 'music-anon-key',
  status: 'active',
  priority: 1,
  region: 'us-east',
  health_status: 'online',
};

const mockClient: any = {
  from: vi.fn(() => mockChain),
};

const mockChain = {
  select: vi.fn().mockReturnValue({
    order: vi.fn().mockResolvedValue({ data: [mockProject], error: null }),
  }),
};

beforeEach(() => {
  clearClientCache();
  mockCreateClient.mockReset();
  mockCreateClient.mockImplementation(() => ({
    from: vi.fn(() => mockChain),
  }));
});

afterEach(() => {
  clearClientCache();
});

describe('createClientForProject', () => {
  it('creates and caches a Supabase client', () => {
    const client = createClientForProject('https://music.supabase.co', 'music-anon-key');
    expect(client).toBeDefined();
    expect(getCachedClientCount()).toBe(1);
  });

  it('reuses the same client for the same project', () => {
    const client1 = createClientForProject('https://music.supabase.co', 'music-anon-key');
    const client2 = createClientForProject('https://music.supabase.co', 'music-anon-key');
    expect(client1).toBe(client2);
    expect(getCachedClientCount()).toBe(1);
  });

  it('creates separate clients for different projects', () => {
    const client1 = createClientForProject('https://music.supabase.co', 'key-1');
    const client2 = createClientForProject('https://posts.supabase.co', 'key-2');
    expect(client1).not.toBe(client2);
    expect(getCachedClientCount()).toBe(2);
  });

  it('returns undefined for uncached client', () => {
    expect(getCachedClient('https://unknown.supabase.co', 'unknown-key')).toBeUndefined();
  });
});

describe('getDomainSupabaseClient', () => {
  it('resolves a domain project config with client', async () => {
    mockCreateClient.mockReturnValue(mockClient);

    const { client, project } = await getDomainSupabaseClient('music');

    expect(client).toBeDefined();
    expect(project.project_key).toBe('music_1');
    expect(project.domain).toBe('music');
    expect(project.project_url).toBe('https://music.supabase.co');
  });

  it('throws when domain is not found', async () => {
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    await expect(getDomainSupabaseClient('nonexistent')).rejects.toThrow(
      'No active infrastructure project registered for domain: nonexistent'
    );
  });
});

describe('clearClientCache', () => {
  it('clears all cached clients', () => {
    createClientForProject('https://music.supabase.co', 'key-1');
    createClientForProject('https://posts.supabase.co', 'key-2');
    expect(getCachedClientCount()).toBe(2);

    clearClientCache();
    expect(getCachedClientCount()).toBe(0);
  });
});
