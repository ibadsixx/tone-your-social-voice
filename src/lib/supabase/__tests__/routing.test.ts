// Deterministic multi-project routing tests.
//
// A domain may contain several active projects. These tests pin the rule that
// only explicit project identity and routing metadata select a destination:
// priority is never used as a selector, and unknown routing fails loudly.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InfrastructureProject } from '@/lib/supabase/types';

const { loadInfrastructureProjects } = vi.hoisted(() => ({
  loadInfrastructureProjects: vi.fn(),
}));

vi.mock('@/lib/supabase/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supabase/registry')>();
  return { ...actual, loadInfrastructureProjects };
});

import {
  domainForRpc,
  domainForTable,
  resolveProjectRoute,
  resolveRpcRoute,
  resolveTableRoute,
} from '@/lib/supabase/routing';

function project(
  projectKey: string,
  overrides: Partial<InfrastructureProject> = {}
): InfrastructureProject {
  return {
    project_key: projectKey,
    domain: 'posts',
    project_url: `https://${projectKey}.supabase.co`,
    anon_key: `${projectKey}-anon`,
    status: 'active',
    priority: 1,
    region: null,
    health_status: null,
    ...overrides,
  };
}

function configCode(error: unknown): string | undefined {
  return (error as { configCode?: string })?.configCode;
}

beforeEach(() => {
  loadInfrastructureProjects.mockReset();
  loadInfrastructureProjects.mockResolvedValue([]);
});

describe('table and RPC ownership', () => {
  it('maps tables and RPCs to their owning domain instead of guessing', () => {
    expect(domainForTable('user_blocks')).toBe('blocking');
    expect(domainForTable('friend_requests')).toBe('friends');
    expect(domainForTable('live_sessions')).toBe('live_streams');
    expect(domainForTable('unknown_table')).toBe('unknown_table');
    expect(domainForRpc('get_unread_conversation_ids')).toBe('message_reads');
    expect(domainForRpc('block_user')).toBe('blocking');
    expect(domainForRpc('get_channel_stats')).toBe('conversations');
  });

  it('resolves a table and an RPC through the same resolver', async () => {
    loadInfrastructureProjects.mockResolvedValue([
      project('blocking-1', { domain: 'blocking' }),
      project('message-reads-1', { domain: 'message_reads' }),
    ]);

    await expect(resolveTableRoute('user_blocks', 'read')).resolves.toMatchObject({
      projectKey: 'blocking-1',
      domain: 'blocking',
      operation: 'read',
    });
    await expect(resolveRpcRoute('get_unread_conversation_ids')).resolves.toMatchObject({
      projectKey: 'message-reads-1',
      domain: 'message_reads',
      operation: 'write',
    });
  });
});

describe('explicit project identity', () => {
  it('selects the named project without considering priority', async () => {
    loadInfrastructureProjects.mockResolvedValue([
      project('low-priority', { priority: 1 }),
      project('owner', { priority: 99 }),
    ]);

    const route = await resolveProjectRoute({
      domain: 'posts',
      operation: 'read',
      projectKey: 'owner',
    });

    expect(route.projectKey).toBe('owner');
    expect(route.project.project_url).toBe('https://owner.supabase.co');
  });

  it('rejects a project key that is inactive or outside the domain', async () => {
    loadInfrastructureProjects.mockResolvedValue([
      project('active-1'),
      project('inactive-1', { status: 'inactive' }),
      project('other-domain', { domain: 'profiles' }),
    ]);

    await expect(
      resolveProjectRoute({ domain: 'posts', operation: 'read', projectKey: 'inactive-1' })
    ).rejects.toMatchObject({ configCode: 'PROJECT_NOT_FOUND' });
    await expect(
      resolveProjectRoute({ domain: 'posts', operation: 'read', projectKey: 'other-domain' })
    ).rejects.toMatchObject({ configCode: 'PROJECT_NOT_FOUND' });
  });
});

describe('operation-specific destinations', () => {
  const projects = () => [
    project('posts-reader', {
      read_destination: 'posts-reader',
      write_destination: 'posts-writer',
      responsibility: 'posts',
      operation_types: ['read'],
    }),
    project('posts-writer', {
      priority: 2,
      read_destination: 'posts-reader',
      write_destination: 'posts-writer',
      responsibility: 'posts',
      operation_types: ['write', 'sync'],
    }),
  ];

  it('uses read_destination for reads and auth-equivalent reads', async () => {
    loadInfrastructureProjects.mockResolvedValue(projects());

    await expect(resolveProjectRoute({ domain: 'posts', operation: 'read' })).resolves.toMatchObject({
      projectKey: 'posts-reader',
    });
  });

  it('uses write_destination for writes and syncs', async () => {
    loadInfrastructureProjects.mockResolvedValue(projects());

    await expect(resolveProjectRoute({ domain: 'posts', operation: 'write' })).resolves.toMatchObject({
      projectKey: 'posts-writer',
    });
    await expect(resolveProjectRoute({ domain: 'posts', operation: 'sync' })).resolves.toMatchObject({
      projectKey: 'posts-writer',
    });
  });

  it('fails when the declared destination is not active', async () => {
    loadInfrastructureProjects.mockResolvedValue([
      project('current', { read_destination: 'retired' }),
      project('retired', { status: 'inactive' }),
    ]);

    await expect(
      resolveProjectRoute({ domain: 'posts', operation: 'read' })
    ).rejects.toMatchObject({ configCode: 'PROJECT_NOT_FOUND' });
  });

  it('rejects an operation that the destination does not support', async () => {
    loadInfrastructureProjects.mockResolvedValue([
      project('reader', { read_destination: 'reader', operation_types: ['read'] }),
    ]);

    await expect(
      resolveProjectRoute({ domain: 'posts', operation: 'write' })
    ).rejects.toMatchObject({ configCode: 'INVALID_CONFIG' });
  });
});

describe('responsibility and partition ownership', () => {
  it('selects the project that owns the requested responsibility', async () => {
    loadInfrastructureProjects.mockResolvedValue([
      project('profile-owner', { responsibility: 'profiles' }),
      project('post-owner', { responsibility: 'posts', priority: 9 }),
    ]);

    await expect(
      resolveProjectRoute({ domain: 'posts', operation: 'read', responsibility: 'profiles' })
    ).resolves.toMatchObject({ projectKey: 'profile-owner' });
  });

  it('requires a partition key when projects in the domain are partitioned', async () => {
    loadInfrastructureProjects.mockResolvedValue([
      project('posts-us', { partition_key: 'us' }),
      project('posts-eu', { partition_key: 'eu' }),
    ]);

    await expect(
      resolveProjectRoute({ domain: 'posts', operation: 'read', partitionKey: 'eu' })
    ).resolves.toMatchObject({ projectKey: 'posts-eu' });
    await expect(
      resolveProjectRoute({ domain: 'posts', operation: 'read' })
    ).rejects.toMatchObject({ configCode: 'AMBIGUOUS_ROUTE' });
    await expect(
      resolveProjectRoute({ domain: 'posts', operation: 'read', partitionKey: 'ap' })
    ).rejects.toMatchObject({ configCode: 'PROJECT_NOT_FOUND' });
  });

  it('does not use an unpartitioned project as an implicit fallback', async () => {
    loadInfrastructureProjects.mockResolvedValue([
      project('posts-us', { partition_key: 'us', priority: 1 }),
      project('posts-global', { priority: 0 }),
    ]);

    await expect(
      resolveProjectRoute({ domain: 'posts', operation: 'read', partitionKey: 'eu' })
    ).rejects.toMatchObject({ configCode: 'PROJECT_NOT_FOUND' });
    await expect(
      resolveProjectRoute({ domain: 'posts', operation: 'read', partitionKey: 'us' })
    ).resolves.toMatchObject({ projectKey: 'posts-us' });
  });
});

describe('missing and invalid registry state', () => {
  it('fails loudly for an unknown domain', async () => {
    await expect(
      resolveProjectRoute({ domain: 'not_registered', operation: 'read' })
    ).rejects.toMatchObject({ configCode: 'DOMAIN_NOT_FOUND' });
  });

  it('does not choose arbitrarily when metadata is absent', async () => {
    loadInfrastructureProjects.mockResolvedValue([
      project('posts-a', { priority: 1 }),
      project('posts-b', { priority: 2 }),
    ]);

    const error = await resolveProjectRoute({
      domain: 'posts',
      operation: 'read',
    }).catch((caught) => caught);

    expect(configCode(error)).toBe('AMBIGUOUS_ROUTE');
    expect(error.details.projectKeys).toEqual(['posts-a', 'posts-b']);
  });

  it('rejects a project with no URL or anon key', async () => {
    loadInfrastructureProjects.mockResolvedValue([
      project('broken', { project_url: '', anon_key: '' }),
    ]);

    await expect(
      resolveProjectRoute({ domain: 'posts', operation: 'read' })
    ).rejects.toMatchObject({ configCode: 'INVALID_CONFIG' });
  });
});
