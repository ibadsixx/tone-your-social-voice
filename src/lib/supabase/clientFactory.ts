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
import { resolveProjectRoute, withKnownProjectKey } from './routing';
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
const cacheKeyByUrlAnon = new Map<string, string>();

function urlAnonKey(url: string, anonKey: string): string {
  return `${url}:${anonKey}`;
}

function cacheKey(url: string, anonKey: string, projectKey?: string): string {
  return projectKey ? `project:${projectKey}` : urlAnonKey(url, anonKey);
}

export function getCachedClient(url: string, anonKey: string): SupabaseClient | undefined {
  const urlKey = urlAnonKey(url, anonKey);
  const key = cacheKeyByUrlAnon.get(urlKey) ?? urlKey;
  return clientCache.get(key);
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
  // Route-created clients are keyed by project identity; keep a secondary
  // index so URL/anon-key lookups find them too.
  cacheKeyByUrlAnon.set(urlAnonKey(projectUrl, projectAnonKey), key);
  return client;
}

function clearProjectClients(): void {
  clientCache.clear();
  cacheKeyByUrlAnon.clear();
}

async function resolveWithRefresh(
  request: ProjectRouteRequest
): Promise<ResolvedProjectRoute> {
  const resolvedRequest = withKnownProjectKey(request);
  try {
    return await resolveProjectRoute(resolvedRequest);
  } catch (error) {
    const code = (error as { configCode?: string })?.configCode;
    if (code === 'DOMAIN_NOT_FOUND' || code === 'PROJECT_NOT_FOUND') {
      refreshRegistry();
      // A stale registry cache can also leave a stale client cached under the
      // same project key. Drop clients before the single retry.
      clearProjectClients();
      return resolveProjectRoute(resolvedRequest);
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
  clearProjectClients();
  clearRegistryCache();
}

export function getCachedClientCount(): number {
  return clientCache.size;
}
