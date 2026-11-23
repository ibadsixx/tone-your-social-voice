// Tone frontend — Dynamic Supabase client factory.
//
// Resolves Supabase project configuration by domain from the infrastructure
// registry, creates and caches Supabase clients per project, and reuses them
// across requests. Never hardcodes project URLs or anon keys.

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  loadInfrastructureProjects,
  getInfrastructureProjectByDomain,
  isInfrastructureConfigured,
  clearRegistryCache,
} from './registry';
import { getInfrastructureInitError } from './infrastructureClient';

export {
  isInfrastructureConfigured,
  loadInfrastructureProjects,
  getInfrastructureProjectByDomain,
  clearRegistryCache,
};
export { getInfrastructureInitError } from './infrastructureClient';
import type { DomainProjectConfig, InfrastructureConfigError } from './types';

// Cache of Supabase clients keyed by project_url:anon_key.
const clientCache = new Map<string, SupabaseClient>();

function cacheKey(url: string, anonKey: string): string {
  return `${url}:${anonKey}`;
}

export function getCachedClient(url: string, anonKey: string): SupabaseClient | undefined {
  return clientCache.get(cacheKey(url, anonKey));
}

export function createClientForProject(
  projectUrl: string,
  projectAnonKey: string
): SupabaseClient {
  const key = cacheKey(projectUrl, projectAnonKey);
  const existing = clientCache.get(key);
  if (existing) return existing;

  const client = createClient(projectUrl, projectAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  clientCache.set(key, client);
  return client;
}

export async function getDomainProjectConfig(
  domain: string
): Promise<DomainProjectConfig> {
  if (!isInfrastructureConfigured()) {
    throw new Error(
      'Infrastructure Supabase is not configured. Set VITE_INFRA_SUPABASE_URL and VITE_INFRA_SUPABASE_ANON_KEY.'
    );
  }

  const projects = await loadInfrastructureProjects();
  const project = getInfrastructureProjectByDomain(projects, domain);

  if (!project) {
    const error: InfrastructureConfigError = {
      code: 'DOMAIN_NOT_FOUND',
      message: `No active infrastructure project registered for domain: ${domain}`,
    };
    throw error;
  }

  if (!project.project_url || !project.anon_key) {
    const error: InfrastructureConfigError = {
      code: 'INVALID_CONFIG',
      message: `Infrastructure project for domain ${domain} is missing project_url or anon_key`,
      details: { project_key: project.project_key },
    };
    throw error;
  }

  const client = createClientForProject(project.project_url, project.anon_key);

  return {
    project,
    supabaseUrl: project.project_url,
    supabaseAnonKey: project.anon_key,
  };
}

export async function getDomainSupabaseClient(domain: string): Promise<{
  client: SupabaseClient;
  project: InfrastructureProject;
}> {
  const config = await getDomainProjectConfig(domain);
  const client = createClientForProject(
    config.project.project_url,
    config.project.anon_key
  );
  return { client, project: config.project };
}

export function clearClientCache(): void {
  clientCache.clear();
  clearRegistryCache();
}

export function getCachedClientCount(): number {
  return clientCache.size;
}
