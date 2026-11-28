// Private Storage helper tests. The helper is the boundary that turns stable
// object references into authenticated signed URLs; it must never call a public
// URL builder or accept an external CDN URL as a private object.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createSignedUrlAsync } = vi.hoisted(() => ({
  createSignedUrlAsync: vi.fn(),
}));

vi.mock('@/lib/supabase/dataClient', () => ({
  dataClient: {
    storage: {
      from: vi.fn(() => ({ createSignedUrlAsync })),
    },
  },
}));

import {
  privateObjectPath,
  privateStoragePath,
  resolvePrivateStorageUrl,
} from '@/lib/privateStorage';

const SIGNED = 'https://ojdhztcetykgvrcwlwen.supabase.co/storage/v1/object/sign/report-evidence/e.png?token=x';

beforeEach(() => {
  createSignedUrlAsync.mockReset();
  createSignedUrlAsync.mockResolvedValue({
    data: {
      signedUrl: SIGNED,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      expiresIn: 600,
    },
    error: null,
  });
});

describe('private object references', () => {
  it('persists a bucket-qualified path without doubling the prefix', () => {
    expect(privateObjectPath('report-evidence', 'report-evidence/a/b.png')).toBe(
      'report-evidence/a/b.png'
    );
    expect(privateObjectPath('report-evidence', 'a/b.png')).toBe('report-evidence/a/b.png');
  });

  it('recovers a private path from a legacy Supabase public URL', () => {
    const legacy =
      'https://ojdhztcetykgvrcwlwen.supabase.co/storage/v1/object/public/message_audios/conv/a.webm';
    expect(privateStoragePath(legacy, 'message_audios')).toBe('conv/a.webm');
  });

  it('recovers a private path from an old signed URL', () => {
    const oldSigned =
      'https://ojdhztcetykgvrcwlwen.supabase.co/storage/v1/object/sign/report-evidence/a/b.png?token=old';
    expect(privateStoragePath(oldSigned, 'report-evidence')).toBe('a/b.png');
  });

  it('rejects an external CDN URL instead of bypassing Storage RLS', () => {
    expect(
      privateStoragePath(
        'https://res.cloudinary.com/demo/video/upload/v1/tone/message_audios/a.webm',
        'message_audios'
      )
    ).toBeNull();
  });
});

describe('resolvePrivateStorageUrl', () => {
  it('returns a signed URL from the authenticated Storage client', async () => {
    await expect(resolvePrivateStorageUrl('report-evidence/a.png', 'report-evidence')).resolves.toBe(
      SIGNED
    );

    expect(createSignedUrlAsync).toHaveBeenCalledWith('report-evidence/a.png', { expiresIn: 600 });
  });

  it('propagates authorization and missing-file failures', async () => {
    createSignedUrlAsync.mockResolvedValueOnce({
      data: null,
      error: { message: 'Signed URL unavailable for private bucket report-evidence: RLS denied' },
    });

    await expect(
      resolvePrivateStorageUrl('report-evidence/missing.png', 'report-evidence')
    ).rejects.toThrow(/RLS denied/);
  });

  it('returns null when no private object reference is stored', async () => {
    await expect(resolvePrivateStorageUrl(null, 'message_audios')).resolves.toBeNull();
    expect(createSignedUrlAsync).not.toHaveBeenCalled();
  });
});
