// Phase 3C Realtime routing tests. Only the client factory is mocked; the real
// DirectChannel route table and fail-closed error reporting are exercised.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KNOWN_PROJECT_REFS, REGISTRY_PROJECT_KEYS } from '@/lib/supabase/projects';

const { getProjectClient } = vi.hoisted(() => ({
  getProjectClient: vi.fn(),
}));

vi.mock('@/lib/supabase/clientFactory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supabase/clientFactory')>();
  return { ...actual, getProjectClient, clearClientCache: vi.fn() };
});

import { clearClientCache, dataClient } from '@/lib/supabase/dataClient';

function flush(): Promise<void> {
  return Promise.resolve().then(() => Promise.resolve());
}

beforeEach(() => {
  clearClientCache();
  getProjectClient.mockReset();
  const realChannel = {
    on: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    send: vi.fn(async () => 'ok'),
  };
  getProjectClient.mockResolvedValue({
    client: { channel: vi.fn(() => realChannel) },
    route: {
      project: {
        project_key: 'test',
        domain: 'test',
        project_url: `https://${KNOWN_PROJECT_REFS.profiles}.supabase.co`,
        anon_key: 'redacted',
        status: 'active',
        priority: 1,
        region: null,
        health_status: 'online',
      },
      projectKey: 'test',
      domain: 'test',
      operation: 'read',
    },
  });
});

describe('verified Realtime channel routing', () => {
  it('retains the confirmed profiles project identity for profile-changes', async () => {
    const channel = dataClient.channel('profile-changes');
    await flush();

    expect(getProjectClient).toHaveBeenCalledWith({
      domain: 'profiles',
      operation: 'read',
      projectKey: REGISTRY_PROJECT_KEYS.profiles,
      expectedProjectRef: KNOWN_PROJECT_REFS.profiles,
    });
    expect(channel.lastError).toBeNull();
  });

  it('routes followed-hashtags-posts to the hashtag_links owner, not posts', async () => {
    dataClient.channel('followed-hashtags-posts');
    await flush();

    expect(getProjectClient).toHaveBeenCalledWith({
      domain: 'hashtag_links',
      operation: 'read',
    });
  });

  it('uses the exact poll-vote domain instead of a broad poll prefix', async () => {
    dataClient.channel('poll-votes-poll-1');
    await flush();

    expect(getProjectClient).toHaveBeenCalledWith({
      domain: 'message_poll_votes',
      operation: 'read',
    });
  });

  it('reports an actionable error for an uncertain channel instead of subscribing', async () => {
    getProjectClient.mockRejectedValueOnce(
      Object.assign(new Error('Routing metadata is insufficient'), {
        configCode: 'AMBIGUOUS_ROUTE',
      })
    );
    const statuses: Array<[string, unknown]> = [];
    const channel = dataClient.channel('followed-hashtags-posts');
    channel.subscribe((status, error) => statuses.push([status, error]));
    await flush();

    expect(getProjectClient).toHaveBeenCalledWith({
      domain: 'hashtag_links',
      operation: 'read',
    });
    expect(statuses).toEqual([
      ['CHANNEL_ERROR', expect.objectContaining({ configCode: 'AMBIGUOUS_ROUTE' })],
    ]);
    expect(channel.lastError?.configCode).toBe('AMBIGUOUS_ROUTE');
  });

  it.each([
    'message-created-conv-1',
    'story-updates-1',
    'poll-created-poll-1',
    'other-settings-1',
  ])('fails closed for unsupported broad prefix channel %s', async (name) => {
    const statuses: string[] = [];
    const channel = dataClient.channel(name);
    channel.subscribe((status) => statuses.push(status));
    await flush();

    expect(getProjectClient).not.toHaveBeenCalled();
    expect(statuses).toContain('CHANNEL_ERROR');
    expect(channel.lastError?.message).toMatch(/No verified Realtime route/);
  });

  it('fails closed for a channel with no verified route', async () => {
    const statuses: string[] = [];
    const channel = dataClient.channel('unknown-live-session-channel');
    channel.subscribe((status) => statuses.push(status));
    await flush();

    expect(getProjectClient).not.toHaveBeenCalled();
    expect(statuses).toContain('CHANNEL_ERROR');
    expect(channel.lastError?.message).toMatch(/No verified Realtime route/);
  });
});
