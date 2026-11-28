// Private Supabase Storage helpers.
//
// Private buckets must never be read through /object/public URLs. Values
// persisted in database URL columns for private evidence are stable object
// paths; this module resolves them to short-lived signed URLs with the current
// authenticated session. Storage RLS still authorizes the signing request.

import { dataClient } from '@/lib/supabase/dataClient';

export type PrivateBucket = 'message_audios' | 'report-evidence';

/** Build the stable path stored in the database for a private object. */
export function privateObjectPath(bucket: PrivateBucket, path: string): string {
  return path.startsWith(`${bucket}/`) ? path : `${bucket}/${path}`;
}

/**
 * Recover a private object path from a stored path or from a legacy Supabase
 * public/signed URL. External CDN URLs are rejected so they cannot bypass the
 private-bucket authorization requirement.
 */
export function privateStoragePath(value: string | null | undefined, bucket: PrivateBucket): string | null {
  if (!value) return null;
  if (value.startsWith(`${bucket}/`)) return value;

  try {
    const parsed = new URL(value, 'http://private-storage.invalid');
    // Only a Supabase Storage object URL is a private object reference. A CDN
    // URL that happens to contain the bucket name must not be treated as one.
    if (!/(^|\.)supabase\.co$/.test(parsed.hostname)) return null;
    const prefixes = [
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/sign/${bucket}/`,
    ];
    const prefix = prefixes.find((candidate) => parsed.pathname.startsWith(candidate));
    if (!prefix) return null;
    return decodeURIComponent(parsed.pathname.slice(prefix.length));
  } catch {
    // Fall through to fail-closed below.
  }
  return null;
}

/** Resolve a stored private object reference to a fresh authenticated URL. */
export async function resolvePrivateStorageUrl(
  value: string | null | undefined,
  bucket: PrivateBucket,
  expiresIn = 10 * 60
): Promise<string | null> {
  const path = privateStoragePath(value, bucket);
  if (!path) return null;

  const { data, error } = await dataClient.storage
    .from(bucket)
    .createSignedUrlAsync(path, { expiresIn });
  if (error || !data) {
    throw new Error(error?.message ?? `Signed URL unavailable for private bucket ${bucket}`);
  }
  return data.signedUrl;
}
