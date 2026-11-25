// The direct-client token bridge must be memory-only. A legacy localStorage
// token key must never be reintroduced as an auth source.

import { afterEach, describe, expect, it } from 'vitest';
import {
  clearCurrentAccessToken,
  getCachedAccessToken,
  getCurrentAccessToken,
  setCurrentAccessToken,
} from '@/lib/supabase/sessionTokenProvider';

afterEach(() => {
  clearCurrentAccessToken();
  localStorage.clear();
});

describe('central Auth token provider', () => {
  it('shares the current access token with direct domain clients', async () => {
    setCurrentAccessToken('signed-central-token');
    expect(await getCurrentAccessToken()).toBe('signed-central-token');
    expect(getCachedAccessToken()).toBe('signed-central-token');
  });

  it('clears the token on sign-out', async () => {
    setCurrentAccessToken('signed-central-token');
    clearCurrentAccessToken();
    expect(await getCurrentAccessToken()).toBeNull();
    expect(getCachedAccessToken()).toBeNull();
  });

  it('ignores empty tokens', () => {
    setCurrentAccessToken('');
    expect(getCachedAccessToken()).toBeNull();
    expect(localStorage.getItem('tone-auth-token')).toBeNull();
  });
});
