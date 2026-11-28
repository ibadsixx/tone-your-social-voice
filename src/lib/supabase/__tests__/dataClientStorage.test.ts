// Phase 3C Storage routing tests for the direct-Supabase client.
//
// These tests exercise the real DirectStorage wrapper with only the client
// factory mocked. They pin: verified bucket host/registry key, public URL
// behaviour, private-bucket signed URLs, and fail-closed handling of missing,
// authorization-failed, expired and unverified buckets.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KNOWN_PROJECT_REFS } from '@/lib/supabase/projects';

const { getProjectClient } = vi.hoisted(() => ({
  getProjectClient: vi.fn(),
}));

vi.mock('@/lib/supabase/clientFactory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supabase/clientFactory')>();
  return { ...actual, getProjectClient, clearClientCache: vi.fn() };
});

import { clearClientCache, dataClient } from '@/lib/supabase/dataClient';

const STORAGE_HOST_URL = `https://${KNOWN_PROJECT_REFS.centralAuth}.supabase.co`;
const UPLOAD_RESULT = { data: { path: 'file.bin' }, error: null };

function mockClient(signedResult?: { data?: { signedUrl: string }; error?: unknown }) {
  const createSignedUrl = vi.fn(async () =>
    signedResult ?? { data: { signedUrl: `${STORAGE_HOST_URL}/storage/v1/object/sign/message_audios/file.bin?token=abc` }, error: null }
  );
  return {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async () => UPLOAD_RESULT),
        list: vi.fn(async () => ({ data: [], error: null })),
        remove: vi.fn(async () => ({ data: [], error: null })),
        createSignedUrl,
      })),
    },
    createSignedUrl,
  };
}

function route(overrides: Record<string, unknown> = {}) {
  return {
    client: mockClient(),
    route: {
      project: {
        project_key: 'users-1',
        domain: 'users',
        project_url: `${STORAGE_HOST_URL}/`,
        anon_key: 'redacted',
        status: 'active',
        priority: 1,
        region: null,
        health_status: 'online',
      },
      projectKey: 'users-1',
      domain: 'users',
      operation: 'write',
      ...overrides,
    },
  };
}

beforeEach(() => {
  clearClientCache();
  getProjectClient.mockReset();
  getProjectClient.mockResolvedValue(route());
});

describe('verified Storage bucket routing', () => {
  it.each([
    'editor_videos',
    'chat_media',
    'group_covers',
    'stories',
    'avatars',
    'covers',
    'stickers',
    'message_audios',
    'report-evidence',
  ])('routes bucket %s to the verified central Auth host', async (bucket) => {
    await dataClient.storage.from(bucket).upload('file.bin', new Blob(['x']));

    expect(getProjectClient).toHaveBeenCalledWith({
      domain: 'users',
      operation: 'write',
      projectKey: 'users-1',
      expectedProjectRef: KNOWN_PROJECT_REFS.centralAuth,
    });
  });

  it.each([
    'audio_recordings',
    'audio-recordings',
    'message_attachments',
    'media_backups',
    'profile_photos',
    'reels',
  ])('fails closed for unverified bucket %s', async (bucket) => {
    await expect(
      dataClient.storage.from(bucket).upload('file.bin', new Blob(['x']))
    ).rejects.toThrow(/No verified Storage owner/);
    expect(getProjectClient).not.toHaveBeenCalled();
  });

  it('uses the routed project URL for a public URL after upload', async () => {
    await dataClient.storage.from('covers').upload('avatar.png', new Blob(['x']));

    const { data } = dataClient.storage.from('covers').getPublicUrl('avatar.png');

    expect(data.publicUrl).toBe(`${STORAGE_HOST_URL}/storage/v1/object/public/covers/avatar.png`);
  });

  it('does not double the bucket prefix when the path already includes it', async () => {
    const { data } = await dataClient.storage
      .from('covers')
      .getPublicUrlAsync('covers/alice/uuid.png');

    expect(data.publicUrl).toBe(
      `${STORAGE_HOST_URL}/storage/v1/object/public/covers/alice/uuid.png`
    );
  });

  it('rejects a Registry row whose host does not match the verified project identity', async () => {
    const wrong = route();
    wrong.route.project.project_url = 'https://profiles-1.supabase.co';
    getProjectClient.mockRejectedValueOnce(
      Object.assign(new Error('Registry project does not match the verified project identity'), {
        configCode: 'INVALID_CONFIG',
      })
    );

    await expect(
      dataClient.storage.from('covers').getPublicUrlAsync('covers/alice/uuid.png')
    ).rejects.toMatchObject({ configCode: 'INVALID_CONFIG' });
  });
});

describe('public versus private bucket URLs', () => {
  it('refuses a public URL for message_audios', async () => {
    expect(() => dataClient.storage.from('message_audios').getPublicUrl('audio.webm')).toThrow(
      /is private/
    );
    await expect(
      dataClient.storage.from('message_audios').getPublicUrlAsync('audio.webm')
    ).rejects.toThrow(/is private/);
    expect(getProjectClient).not.toHaveBeenCalled();
  });

  it('refuses a public URL for report-evidence', () => {
    expect(() => dataClient.storage.from('report-evidence').getPublicUrl('e.png')).toThrow(
      /is private/
    );
  });
});

describe('private signed URLs', () => {
  it('creates a signed URL with the authenticated routed client', async () => {
    const { data, error } = await dataClient.storage
      .from('message_audios')
      .createSignedUrlAsync('message_audios/conv-1/audio.webm', { expiresIn: 600 });

    expect(error).toBeNull();
    expect(data?.signedUrl).toContain('/object/sign/');
    expect(data?.expiresIn).toBe(600);
    expect(Number.isNaN(Date.parse(data!.expiresAt))).toBe(false);
    expect(getProjectClient).toHaveBeenCalledWith({
      domain: 'users',
      operation: 'read',
      projectKey: 'users-1',
      expectedProjectRef: KNOWN_PROJECT_REFS.centralAuth,
    });
  });

  it('reuses a fresh cached signed URL', async () => {
    const cached = {
      signedUrl: `${STORAGE_HOST_URL}/storage/v1/object/sign/message_audios/a.webm?token=fresh`,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      expiresIn: 600,
    };

    const { data } = await dataClient.storage
      .from('message_audios')
      .createSignedUrlAsync('a.webm', { cached });

    expect(data).toEqual(cached);
    expect(getProjectClient).not.toHaveBeenCalled();
  });

  it('refreshes an expired signed URL instead of reusing it', async () => {
    const expired = {
      signedUrl: `${STORAGE_HOST_URL}/storage/v1/object/sign/message_audios/a.webm?token=old`,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      expiresIn: 600,
    };

    const { data } = await dataClient.storage
      .from('message_audios')
      .createSignedUrlAsync('a.webm', { cached: expired });

    expect(data?.signedUrl).not.toBe(expired.signedUrl);
    expect(getProjectClient).toHaveBeenCalled();
  });

  it('refuses a stale public URL presented as a cached signed URL', async () => {
    const publicUrl = {
      signedUrl: `${STORAGE_HOST_URL}/storage/v1/object/public/message_audios/a.webm`,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      expiresIn: 600,
    };

    const { data } = await dataClient.storage
      .from('message_audios')
      .createSignedUrlAsync('a.webm', { cached: publicUrl });

    expect(data?.signedUrl).toContain('/object/sign/');
  });

  it('returns authorization and missing-file errors without a public fallback', async () => {
    getProjectClient.mockResolvedValueOnce({
      ...route(),
      client: mockClient({
        error: { message: 'Object not found', code: '404' },
      }),
    });

    const result = await dataClient.storage
      .from('message_audios')
      .createSignedUrlAsync('missing.webm');

    expect(result.data).toBeNull();
    expect(result.error?.message).toMatch(/Signed URL unavailable for private bucket message_audios/);
    expect(result.error?.code).toBe('404');
  });

  it('rejects an invalid signed URL expiry', async () => {
    const result = await dataClient.storage
      .from('message_audios')
      .createSignedUrlAsync('a.webm', { expiresIn: 0 });

    expect(result.data).toBeNull();
    expect(result.error?.message).toMatch(/Signed URL expiry/);
    expect(getProjectClient).not.toHaveBeenCalled();
  });

  it('refuses to sign a public bucket', async () => {
    const result = await dataClient.storage.from('covers').createSignedUrlAsync('a.png');

    expect(result.data).toBeNull();
    expect(result.error?.message).toMatch(/bucket covers is public/);
    expect(getProjectClient).not.toHaveBeenCalled();
  });
});
