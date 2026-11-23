// Infrastructure client initialization tests.
// Verifies client creation, caching, and reset behavior.
// The Supabase JS SDK is mocked; no real connection is made.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getInfrastructureClient,
  getInfrastructureInitError,
  resetInfrastructureClient,
} from '@/lib/supabase/infrastructureClient';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ __mock_client: true })),
}));

beforeEach(() => {
  resetInfrastructureClient();
});

afterEach(() => {
  resetInfrastructureClient();
});

describe('infrastructure client initialization', () => {
  it('creates a client when env vars are present', () => {
    const client = getInfrastructureClient();
    expect(client).toBeDefined();
    expect(getInfrastructureInitError()).toBeNull();
  });

  it('caches and reuses the same client instance', () => {
    const client1 = getInfrastructureClient();
    const client2 = getInfrastructureClient();
    expect(client1).toBe(client2);
  });

  it('resetInfrastructureClient clears the cached client', () => {
    const client1 = getInfrastructureClient();
    resetInfrastructureClient();
    const client2 = getInfrastructureClient();
    expect(client2).not.toBe(client1);
    expect(getInfrastructureInitError()).toBeNull();
  });

  it('getInfrastructureInitError returns null when configured', () => {
    expect(getInfrastructureInitError()).toBeNull();
  });
});
