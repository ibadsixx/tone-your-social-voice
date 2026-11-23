// Tone frontend — Infrastructure Supabase client.
//
// Creates a single Supabase client connected to the central Infrastructure
// project using ONLY the public anon key. This client is used exclusively to
// discover domain-project connection configurations from the infrastructure
// registry. It must NEVER use a service-role key, and it must never be used for
// authenticated user data access to domain projects.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let infrastructureClient: SupabaseClient | null = null;
let initError: string | null = null;

export function readInfraEnv(): { url: string | undefined; anonKey: string | undefined } {
  return {
    url: import.meta.env.VITE_INFRA_SUPABASE_URL,
    anonKey: import.meta.env.VITE_INFRA_SUPABASE_ANON_KEY,
  };
}

export function getInfrastructureClient(): SupabaseClient {
  if (infrastructureClient) return infrastructureClient;

  const { url, anonKey } = readInfraEnv();

  if (!url || !anonKey) {
    const missing: string[] = [];
    if (!url) missing.push('VITE_INFRA_SUPABASE_URL');
    if (!anonKey) missing.push('VITE_INFRA_SUPABASE_ANON_KEY');
    initError = `Missing Infrastructure Supabase configuration: ${missing.join(', ')}`;
    throw new Error(initError);
  }

  infrastructureClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return infrastructureClient;
}

export function getInfrastructureInitError(): string | null {
  return initError;
}

export function resetInfrastructureClient(): void {
  infrastructureClient = null;
  initError = null;
}
