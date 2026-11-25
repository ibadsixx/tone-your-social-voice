// Tone frontend — Dynamic Supabase client factory.
//
// Clients are resolved through the explicit routing resolver and cached by
// project identity in application memory. Every domain client sends the current
// central Auth JWT so project RLS policies authorize the request.

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  clearRegistryCache,
  isInfrastructureConfigured,
  loadInfrastructureProjects,
  refreshRegistry,
} from './registry';
import { getInfrastructureInitError } from './infrastructureClient';
import { resolveProjectRoute } from './routing';
import { getCurrentAccessToken } from './sessionTokenProvider';
import type {
  DomainProjectConfig,
  OperationType,
  ProjectRouteRequest,
  ResolvedProjectRoute,
} from './types';

export {
  isInfrastructureConfigured,
  loadInfrastructureProjects,
  clearRegistryCache,
  refreshRegistry,
  getInfrastructureInitError,
};

const clientCache = new Map<string, SupabaseClient>();

function cacheKey(url: string, anonKey: string, projectKey?: string): string {
  return projectKey ? `project:${projectKey}` : `${url}:${anonKey}`;
}

export function getCachedClient(url: string, anonKey: string): SupabaseClient | undefined {
  return clientCache.get(cacheKey(url, anonKey));
}

export function createClientForProject(
  projectUrl: string,
  projectAnonKey: string,
  projectKey?: string
): SupabaseClient {
  const key = cacheKey(projectUrl, projectAnonKey, projectKey);
  const existing = clientCache.get(key);
  if (existing) return existing;

  const client = createClient(projectUrl, projectAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    accessToken: getCurrentAccessToken,
  });

  clientCache.set(key, client);
  return client;
}

async function resolveWithRefresh(
  request: ProjectRouteRequest
): Promise<ResolvedProjectRoute> {
  try {
    return await resolveProjectRoute(request);
  } catch (error) {
    const code = (error as { configCode?: string })?.configCode;
    if (code === 'DOMAIN_NOT_FOUND' || code === 'PROJECT_NOT_FOUND') {
      refreshRegistry();
      return resolveProjectRoute(request);
    }
    throw error;
  }
}

export async function getClientForRoute(
  route: ResolvedProjectRoute
): Promise<SupabaseClient> {
  return createClientForProject(
    route.project.project_url,
    route.project.anon_key,
    route.projectKey
  );
}

export async function getProjectClient(request: ProjectRouteRequest): Promise<{
  client: SupabaseClient;
  route: ResolvedProjectRoute;
}> {
  if (!isInfrastructureConfigured()) {
    throw new Error(
      'Infrastructure Supabase is not configured. Set VITE_INFRA_SUPABASE_URL and VITE_INFRA_SUPABASE_ANON_KEY.'
    );
  }

  const route = await resolveWithRefresh(request);
  const client = createClientForProject(
    route.project.project_url,
    route.project.anon_key,
    route.projectKey
  );
  return { client, route };
}

export async function getDomainProjectConfig(
  domain: string,
  operation: OperationType = 'read'
): Promise<DomainProjectConfig> {
  const { route } = await getProjectClient({ domain, operation });
  return {
    project: route.project,
    supabaseUrl: route.project.project_url,
    supabaseAnonKey: route.project.anon_key,
  };
}

export async function getDomainSupabaseClient(
  domain: string,
  operation: OperationType = 'read'
): Promise<{
  client: SupabaseClient;
  project: ResolvedProjectRoute['project'];
}> {
  const { client, route } = await getProjectClient({ domain, operation });
  return { client, project: route.project };
}

export function clearClientCache(): void {
  clientCache.clear();
  clearRegistryCache();
}

export function getCachedClientCount(): number {
  return clientCache.size;
}
