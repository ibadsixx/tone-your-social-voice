// Registry loading tests.
// Verifies project loading from the infrastructure registry, domain-based
// resolution, inactive-project filtering, and priority ordering.
// The infrastructure client is mocked; no real connection is made.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadInfrastructureProjects,
  getInfrastructureProjectByDomain,
  clearRegistryCache,
} from '@/lib/supabase/registry';
import { getInfrastructureClient } from '@/lib/supabase/infrastructureClient';
import type { InfrastructureProject } from '@/lib/supabase/types';

vi.mock('@/lib/supabase/infrastructureClient', () => ({
  getInfrastructureClient: vi.fn(),
  getInfrastructureInitError: vi.fn(() => null),
  readInfraEnv: vi.fn(),
  resetInfrastructureClient: vi.fn(),
}));

const mockGetInfrastructureClient = vi.mocked(getInfrastructureClient);

const mockProjects: InfrastructureProject[] = [
  {
    project_key: 'music_1',
    domain: 'music',
    project_url: 'https://music.supabase.co',
    anon_key: 'music-anon-key',
    status: 'active',
    priority: 1,
    region: 'us-east',
    health_status: 'online',
  },
  {
    project_key: 'posts_1',
    domain: 'posts',
    project_url: 'https://posts.supabase.co',
    anon_key: 'posts-anon-key',
    status: 'active',
    priority: 1,
    region: 'us-west',
    health_status: 'online',
  },
  {
    project_key: 'posts_2',
    domain: 'posts',
    project_url: 'https://posts-2.supabase.co',
    anon_key: 'posts-2-anon-key',
    status: 'active',
    priority: 2,
    region: 'eu-west',
    health_status: 'online',
  },
];

beforeEach(() => {
  clearRegistryCache();
  mockGetInfrastructureClient.mockReset();
});

afterEach(() => {
  clearRegistryCache();
});

describe('loadInfrastructureProjects', () => {
  it('loads active projects ordered by priority', async () => {
    const mockSelect = vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: mockProjects, error: null }),
    });
    const mockFrom = vi.fn().mockReturnValue({
      select: mockSelect,
    });
    mockGetInfrastructureClient.mockReturnValue({ from: mockFrom });

    const projects = await loadInfrastructureProjects();

    expect(projects.length).toBeGreaterThan(0);
    const postsProjects = projects.filter((p) => p.domain === 'posts');
    if (postsProjects.length >= 2) {
      expect(postsProjects[0].priority).toBeLessThanOrEqual(postsProjects[1].priority);
    }

    // Verify the correct table/view is queried
    expect(mockGetInfrastructureClient).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalledWith('infrastructure_projects_public');
    expect(mockFrom).not.toHaveBeenCalledWith('infrastructure_projects');

    // Verify only approved fields are selected
    const mockSelectCall = mockSelect.mock.calls[0];
    expect(mockSelectCall[0]).toBe(
      'project_key, domain, project_url, anon_key, status, priority, region, health_status'
    );
  });

  it('throws when the registry query fails', async () => {
    mockGetInfrastructureClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
        }),
      }),
    });

    await expect(loadInfrastructureProjects()).rejects.toThrow('DB error');
  });

  it('throws when the view is missing', async () => {
    mockGetInfrastructureClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'relation "infrastructure_projects_public" does not exist', code: '42P01' },
          }),
        }),
      }),
    });

    await expect(loadInfrastructureProjects()).rejects.toThrow(
      /Infrastructure registry view not found/
    );
  });

  it('throws when RLS denies access', async () => {
    mockGetInfrastructureClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'permission denied for table infrastructure_projects_public', code: '42501' },
          }),
        }),
      }),
    });

    await expect(loadInfrastructureProjects()).rejects.toThrow(
      /Infrastructure registry access denied/
    );
  });

  it('returns an empty array when no active projects are found', async () => {
    mockGetInfrastructureClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    const projects = await loadInfrastructureProjects();
    expect(projects).toEqual([]);
    expect(projects.length).toBe(0);
  });
});

describe('getInfrastructureProjectByDomain', () => {
  it('returns the lowest-priority active project for a domain', () => {
    const result = getInfrastructureProjectByDomain(mockProjects, 'posts');
    expect(result).toBeDefined();
    expect(result?.project_key).toBe('posts_1');
  });

  it('returns undefined for a domain with no active projects', () => {
    const result = getInfrastructureProjectByDomain(mockProjects, 'nonexistent');
    expect(result).toBeUndefined();
  });

  it('does not return inactive projects even if they match the domain', () => {
    const projectsWithInactive = [...mockProjects, {
      project_key: 'posts_inactive',
      domain: 'posts',
      project_url: 'https://posts-inactive.supabase.co',
      anon_key: 'posts-inactive-key',
      status: 'inactive',
      priority: 1,
      region: 'us-east',
      health_status: 'offline',
    }];
    const result = getInfrastructureProjectByDomain(projectsWithInactive, 'posts');
    expect(result?.status).toBe('active');
    expect(result?.project_key).not.toBe('posts_inactive');
  });
});
