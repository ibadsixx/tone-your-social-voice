// Deterministic multi-project routing tests.
//
// A domain may contain several active projects. These tests pin the rule that
// only explicit project identity and routing metadata select a destination:
// priority is never used as a selector, and unknown routing fails loudly.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KNOWN_PROJECT_REFS, REGISTRY_PROJECT_KEYS } from '@/lib/supabase/projects';
import type { InfrastructureProject, OperationType } from '@/lib/supabase/types';

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
  resolveDomainRoute,
  resolveProjectRoute,
  resolveRpcRoute,
  resolveTableRoute,
  rpcOperation,
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
    expect(domainForTable('restricted_users')).toBe('blocking');
    expect(domainForTable('friend_requests')).toBe('friends');
    expect(domainForTable('live_sessions')).toBe('live_streams');
    expect(domainForTable('unknown_table')).toBe('unknown_table');
    expect(domainForRpc('get_unread_conversation_ids')).toBe('message_reads');
    expect(domainForRpc('block_user')).toBe('blocking');
    expect(domainForRpc('get_channel_stats')).toBe('conversations');
    expect(domainForRpc('get_or_create_dm')).toBe('conversations');
    expect(domainForRpc('get_music_library_with_stats')).toBe('music_library');
  });

  it('classifies read-only RPCs by their contract, not their name alone', () => {
    expect(rpcOperation('get_music_library_with_stats')).toBe('read');
    expect(rpcOperation('get_unread_conversation_ids')).toBe('read');
    expect(rpcOperation('is_blocked')).toBe('read');
    // This function creates a conversation despite its `get_` prefix.
    expect(rpcOperation('get_or_create_dm')).toBe('write');
    expect(rpcOperation('block_user')).toBe('write');
  });

  it('resolves a table and an RPC through the same resolver', async () => {
    loadInfrastructureProjects.mockResolvedValue([
      project(REGISTRY_PROJECT_KEYS.blocking, {
        domain: 'blocking',
        project_url: `https://${KNOWN_PROJECT_REFS.blocking}.supabase.co`,
        responsibility: 'blocking',
        operation_types: ['read', 'write', 'sync', 'auth'],
        read_destination: REGISTRY_PROJECT_KEYS.blocking,
        write_destination: REGISTRY_PROJECT_KEYS.blocking,
      }),
      project('message-reads-1', {
        domain: 'message_reads',
        responsibility: 'message_reads',
        operation_types: ['read', 'write', 'sync', 'auth'],
        read_destination: 'message-reads-1',
        write_destination: 'message-reads-1',
      }),
    ]);

    await expect(resolveTableRoute('user_blocks', 'read')).resolves.toMatchObject({
      projectKey: REGISTRY_PROJECT_KEYS.blocking,
      domain: 'blocking',
      operation: 'read',
    });
    await expect(resolveTableRoute('restricted_users', 'read')).resolves.toMatchObject({
      projectKey: REGISTRY_PROJECT_KEYS.blocking,
      domain: 'blocking',
      operation: 'read',
    });
    await expect(resolveRpcRoute('get_unread_conversation_ids')).resolves.toMatchObject({
      projectKey: 'message-reads-1',
      domain: 'message_reads',
      operation: 'read',
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

  it('checks an expected project reference without treating it as a registry key', async () => {
    loadInfrastructureProjects.mockResolvedValue([
      project(REGISTRY_PROJECT_KEYS.posts, {
        project_url: `https://${KNOWN_PROJECT_REFS.posts}.supabase.co`,
      }),
    ]);

    await expect(
      resolveProjectRoute({
        domain: 'posts',
        operation: 'read',
        projectKey: REGISTRY_PROJECT_KEYS.posts,
        expectedProjectRef: KNOWN_PROJECT_REFS.posts,
      })
    ).resolves.toMatchObject({ projectKey: REGISTRY_PROJECT_KEYS.posts });

    await expect(
      resolveProjectRoute({
        domain: 'posts',
        operation: 'read',
        projectKey: REGISTRY_PROJECT_KEYS.posts,
        expectedProjectRef: KNOWN_PROJECT_REFS.profiles,
      })
    ).rejects.toMatchObject({ configCode: 'INVALID_CONFIG' });
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

  it('sends a read-only RPC to the read destination', async () => {
    loadInfrastructureProjects.mockResolvedValue([
      project('music-reader', {
        domain: 'music_library',
        responsibility: 'music_library',
        operation_types: ['read'],
        read_destination: 'music-reader',
        write_destination: 'music-writer',
      }),
      project('music-writer', {
        domain: 'music_library',
        responsibility: 'music_library',
        operation_types: ['write'],
        read_destination: 'music-reader',
        write_destination: 'music-writer',
        priority: 2,
      }),
    ]);

    await expect(resolveRpcRoute('get_music_library_with_stats')).resolves.toMatchObject({
      projectKey: 'music-reader',
      domain: 'music_library',
      operation: 'read',
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
      resolveProjectRoute({ domain: 'posts', operation: 'read', projectKey: 'broken' })
    ).rejects.toMatchObject({ configCode: 'INVALID_CONFIG' });
  });

  it('fails closed for a single active project with no routing metadata', async () => {
    loadInfrastructureProjects.mockResolvedValue([project('posts-only')]);

    await expect(
      resolveProjectRoute({ domain: 'posts', operation: 'read' })
    ).rejects.toMatchObject({ configCode: 'AMBIGUOUS_ROUTE' });
  });

  it('fails closed when two projects declare different destinations', async () => {
    loadInfrastructureProjects.mockResolvedValue([
      project('posts-a', { read_destination: 'posts-a' }),
      project('posts-b', { read_destination: 'posts-b' }),
    ]);

    await expect(
      resolveProjectRoute({ domain: 'posts', operation: 'read' })
    ).rejects.toMatchObject({ configCode: 'AMBIGUOUS_ROUTE' });
  });

  it('rejects an explicit project key that contradicts its destination metadata', async () => {
    loadInfrastructureProjects.mockResolvedValue([
      project('reader', { read_destination: 'reader' }),
      project('writer', { read_destination: 'reader', write_destination: 'writer' }),
    ]);

    await expect(
      resolveProjectRoute({ domain: 'posts', operation: 'read', projectKey: 'writer' })
    ).rejects.toMatchObject({ configCode: 'INVALID_CONFIG' });
  });
});

describe('Phase 3F confirmed 13-column registry mappings', () => {
  function confirmedProjects(): InfrastructureProject[] {
    return [
      project(REGISTRY_PROJECT_KEYS.users, {
        domain: 'users',
        project_url: `https://${KNOWN_PROJECT_REFS.centralAuth}.supabase.co`,
        responsibility: 'users',
        operation_types: ['read', 'write', 'sync', 'auth'],
        read_destination: REGISTRY_PROJECT_KEYS.users,
        write_destination: REGISTRY_PROJECT_KEYS.users,
        partition_key: null,
      }),
      project(REGISTRY_PROJECT_KEYS.posts, {
        domain: 'posts',
        project_url: `https://${KNOWN_PROJECT_REFS.posts}.supabase.co`,
        responsibility: 'posts',
        operation_types: ['read', 'write', 'sync'],
        read_destination: REGISTRY_PROJECT_KEYS.posts,
        write_destination: REGISTRY_PROJECT_KEYS.posts,
        partition_key: null,
      }),
      project(REGISTRY_PROJECT_KEYS.profiles, {
        domain: 'profiles',
        project_url: `https://${KNOWN_PROJECT_REFS.profiles}.supabase.co`,
        responsibility: 'profiles',
        operation_types: ['read', 'write', 'sync'],
        read_destination: REGISTRY_PROJECT_KEYS.profiles,
        write_destination: REGISTRY_PROJECT_KEYS.profiles,
        partition_key: null,
      }),
      project(REGISTRY_PROJECT_KEYS.blocking, {
        domain: 'blocking',
        project_url: `https://${KNOWN_PROJECT_REFS.blocking}.supabase.co`,
        responsibility: 'blocking',
        operation_types: ['read', 'write', 'sync'],
        read_destination: REGISTRY_PROJECT_KEYS.blocking,
        write_destination: REGISTRY_PROJECT_KEYS.blocking,
        partition_key: null,
      }),
    ];
  }

  const confirmedCases: Array<{
    domain: string;
    key: string;
    operations: OperationType[];
  }> = [
    { domain: 'users', key: REGISTRY_PROJECT_KEYS.users, operations: ['read', 'write', 'sync', 'auth'] },
    { domain: 'posts', key: REGISTRY_PROJECT_KEYS.posts, operations: ['read', 'write', 'sync'] },
    { domain: 'profiles', key: REGISTRY_PROJECT_KEYS.profiles, operations: ['read', 'write', 'sync'] },
    { domain: 'blocking', key: REGISTRY_PROJECT_KEYS.blocking, operations: ['read', 'write', 'sync'] },
  ];

  it.each(confirmedCases)(
    'resolves $domain through $key for every approved operation',
    async ({ domain, key, operations }) => {
      for (const operation of operations) {
        loadInfrastructureProjects.mockResolvedValue(confirmedProjects());
        await expect(resolveDomainRoute(domain, operation)).resolves.toMatchObject({
          projectKey: key,
          domain,
          operation,
        });
      }
    }
  );

  it('allows auth only for users-1', async () => {
    loadInfrastructureProjects.mockResolvedValue(confirmedProjects());

    await expect(resolveDomainRoute('users', 'auth')).resolves.toMatchObject({
      projectKey: REGISTRY_PROJECT_KEYS.users,
      operation: 'auth',
    });

    for (const domain of ['posts', 'profiles', 'blocking']) {
      await expect(resolveDomainRoute(domain, 'auth')).rejects.toMatchObject({
        configCode: 'INVALID_CONFIG',
      });
    }
  });

  it('resolves confirmed domains from 8-column rows with no metadata', async () => {
    loadInfrastructureProjects.mockResolvedValue([
      project(REGISTRY_PROJECT_KEYS.users, { domain: 'users' }),
      project(REGISTRY_PROJECT_KEYS.posts, { domain: 'posts' }),
      project(REGISTRY_PROJECT_KEYS.profiles, { domain: 'profiles' }),
      project(REGISTRY_PROJECT_KEYS.blocking, { domain: 'blocking' }),
    ]);

    for (const { domain, key } of confirmedCases) {
      await expect(resolveDomainRoute(domain, 'read')).resolves.toMatchObject({
        projectKey: key,
        domain,
      });
    }
  });

  it('does not treat missing metadata as a domain-only approval', async () => {
    loadInfrastructureProjects.mockResolvedValue([
      project('music-1', { domain: 'music', priority: 0 }),
    ]);

    await expect(resolveDomainRoute('music', 'read')).rejects.toMatchObject({
      configCode: 'AMBIGUOUS_ROUTE',
    });
  });

  it('never uses priority as an ownership selector', async () => {
    loadInfrastructureProjects.mockResolvedValue([
      project('music-low', { domain: 'music', priority: 0 }),
      project('music-high', { domain: 'music', priority: 99 }),
    ]);

    await expect(resolveDomainRoute('music', 'read')).rejects.toMatchObject({
      configCode: 'AMBIGUOUS_ROUTE',
    });
  });

  it('rejects an invalid destination that points to another project', async () => {
    loadInfrastructureProjects.mockResolvedValue([
      project(REGISTRY_PROJECT_KEYS.users, {
        domain: 'users',
        responsibility: 'users',
        operation_types: ['read'],
        read_destination: REGISTRY_PROJECT_KEYS.posts,
        write_destination: REGISTRY_PROJECT_KEYS.users,
      }),
      project(REGISTRY_PROJECT_KEYS.posts, { domain: 'posts' }),
    ]);

    await expect(resolveDomainRoute('users', 'read')).rejects.toMatchObject({
      configCode: 'INVALID_CONFIG',
    });
  });

  it('fails closed when a confirmed project is inactive', async () => {
    loadInfrastructureProjects.mockResolvedValue([
      project(REGISTRY_PROJECT_KEYS.users, { domain: 'users', status: 'inactive' }),
    ]);

    await expect(resolveDomainRoute('users', 'read')).rejects.toMatchObject({
      configCode: 'DOMAIN_NOT_FOUND',
    });
  });

  it('fails closed for ambiguous metadata without a known project key', async () => {
    loadInfrastructureProjects.mockResolvedValue([
      project('music-a', {
        domain: 'music',
        responsibility: 'music',
        operation_types: ['read'],
        read_destination: 'music-a',
        write_destination: 'music-a',
      }),
      project('music-b', {
        domain: 'music',
        responsibility: 'music',
        operation_types: ['read'],
        read_destination: 'music-b',
        write_destination: 'music-b',
      }),
    ]);

    await expect(resolveDomainRoute('music', 'read')).rejects.toMatchObject({
      configCode: 'AMBIGUOUS_ROUTE',
    });
  });
});
