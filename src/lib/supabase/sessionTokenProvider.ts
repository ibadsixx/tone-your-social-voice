// Tone frontend — shared central Auth token provider.
//
// Domain Supabase clients must send the signed-in user's central Auth JWT on
// every request so RLS can authorize it. This module intentionally holds only
// the current access token in memory; the persistent session itself is owned by
// centralAuth.ts and the Supabase Auth storage. No legacy token key is used.

let currentAccessToken: string | null = null;

export function setCurrentAccessToken(token: string | null): void {
  currentAccessToken = typeof token === 'string' && token.length > 0 ? token : null;
}

export function getCurrentAccessToken(): Promise<string | null> {
  return Promise.resolve(currentAccessToken);
}

/** Synchronous read of the in-memory token for long-lived transport setup. */
export function getCachedAccessToken(): string | null {
  return currentAccessToken;
}

export function clearCurrentAccessToken(): void {
  currentAccessToken = null;
}
