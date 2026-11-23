// Music API tests.
// Verifies searchMusic and getMusicById use the registry-driven client factory.
// The client factory and registry are mocked; no real connection is made.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchMusic, getMusicById } from '@/api/music';
import { resetInfrastructureClient as resetInfraClient } from '@/lib/supabase/infrastructureClient';
import {
  getDomainSupabaseClient,
  isInfrastructureConfigured,
} from '@/lib/supabase/clientFactory';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/clientFactory', () => ({
  getDomainSupabaseClient: vi.fn(),
  getDomainProjectConfig: vi.fn(),
  isInfrastructureConfigured: vi.fn(() => true),
}));

const mockGetDomainSupabaseClient = vi.mocked(getDomainSupabaseClient);
const mockIsInfrastructureConfigured = vi.mocked(isInfrastructureConfigured);

const mockMusicRows = [
  { id: '1', title: 'Song One', artist: 'Artist A', url: 'https://example.com/1.mp3' },
  { id: '2', title: 'Song Two', artist: 'Artist B', url: 'https://example.com/2.mp3' },
];

function makeMockClient(musicData: unknown): any {
  return {
    from: vi.fn((table: string) => {
      if (table === 'music_library') {
        return {
          select: vi.fn().mockReturnValue({
            ilike: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: musicData,
                error: musicData !== undefined ? null : { message: 'Query failed' },
              }),
            }),
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data:
                  musicData && Array.isArray(musicData)
                    ? musicData.find((r: any) => r.id === '1')
                    : musicData,
                error: musicData !== null && musicData !== undefined ? null : { message: 'Item not found' },
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          ilike: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Unknown table' },
            }),
          }),
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Unknown table' },
            }),
          }),
        }),
      };
    }),
  };
}

beforeEach(() => {
  resetInfraClient();
  vi.resetAllMocks();
  mockIsInfrastructureConfigured.mockReturnValue(true);
});

afterEach(() => {
  resetInfraClient();
  vi.resetAllMocks();
});

describe('searchMusic', () => {
  it('returns music results when infrastructure is configured and project is found', async () => {
    mockGetDomainSupabaseClient.mockResolvedValue({
      client: makeMockClient(mockMusicRows),
      project: {
        project_key: 'music_1',
        domain: 'music',
        project_url: 'https://music.supabase.co',
        anon_key: 'music-key',
        status: 'active',
        priority: 1,
        region: 'us-east',
        health_status: 'online',
      },
    });

    const result = await searchMusic('song');

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(2);
    expect(result.data?.[0].title).toBe('Song One');
    expect(result.data?.[1].title).toBe('Song Two');
  });

  it('handles empty results gracefully', async () => {
    mockGetDomainSupabaseClient.mockResolvedValue({
      client: makeMockClient([]),
      project: {
        project_key: 'music_1',
        domain: 'music',
        project_url: 'https://music.supabase.co',
        anon_key: 'music-key',
        status: 'active',
        priority: 1,
        region: 'us-east',
        health_status: 'online',
      },
    });

    const result = await searchMusic('nonexistent');

    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
  });

  it('handles registry query errors', async () => {
    mockGetDomainSupabaseClient.mockRejectedValue(new Error('DB error'));

    const result = await searchMusic('song');

    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
  });
});

describe('getMusicById', () => {
  it('returns a single music item when found', async () => {
    const mockRow = { id: '1', title: 'Song One', artist: 'Artist A', url: 'https://example.com/1.mp3' };
    mockGetDomainSupabaseClient.mockResolvedValue({
      client: makeMockClient([mockRow]),
      project: {
        project_key: 'music_1',
        domain: 'music',
        project_url: 'https://music.supabase.co',
        anon_key: 'music-key',
        status: 'active',
        priority: 1,
        region: 'us-east',
        health_status: 'online',
      },
    });

    const result = await getMusicById('1');

    expect(result.error).toBeNull();
    expect(result.data).toEqual(mockRow);
  });

  it('returns an error when the item is not found', async () => {
    mockGetDomainSupabaseClient.mockResolvedValue({
      client: makeMockClient(null),
      project: {
        project_key: 'music_1',
        domain: 'music',
        project_url: 'https://music.supabase.co',
        anon_key: 'music-key',
        status: 'active',
        priority: 1,
        region: 'us-east',
        health_status: 'online',
      },
    });

    const result = await getMusicById('nonexistent');

    expect(result.data).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.error?.message).toBe('Item not found');
  });
});
