// Tone frontend — Central project configuration registry.
//
// Loads approved project records from the infrastructure_projects_public view
// through the Infrastructure Supabase client (anon key only). Service-role
// credentials and management tokens are never requested.

import {
  getInfrastructureClient,
  getInfrastructureInitError,
  readInfraEnv,
} from './infrastructureClient';
import type { InfrastructureProject } from './types';

const BASE_FIELDS =
  'project_key, domain, project_url, anon_key, status, priority, region, health_status';

// Routing metadata introduced by
// supabase/migrations/20261124000000_project_routing_metadata.sql.
// The resolver works with the pre-migration view too, but cannot distinguish
// multiple active projects in one domain until this metadata exists.
const ROUTING_FIELDS =
  'responsibility, operation_types, read_destination, write_destination, partition_key';

const INFRA_PROJECTS_TABLE = 'infrastructure_projects_public';
const REGISTRY_CACHE_TTL_MS = 5 * 60 * 1000;

let registryCache: { projects: InfrastructureProject[]; loadedAt: number } | null = null;

export function isInfrastructureConfigured(): boolean {
  const { url, anonKey } = readInfraEnv();
  return Boolean(url && anonKey);
}

function classifyRegistryError(code: string, message: string): Error {
  if (code === '42P01' || message.includes('does not exist')) {
    return new Error(
      'Infrastructure registry view not found: supabase/migrations/20261124000000_project_routing_metadata.sql must be applied to the Infrastructure project'
    );
  }
  if (code === '42501' || message.includes('permission denied')) {
    return new Error(
      'Infrastructure registry access denied: RLS policy does not permit anon read of infrastructure_projects_public'
    );
  }
  return new Error(`Failed to load infrastructure project registry: ${message}`);
}

function isMissingColumnError(code: string, message: string): boolean {
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    message.includes('does not exist') ||
    message.includes('could not find')
  );
}

export async function loadInfrastructureProjects(): Promise<InfrastructureProject[]> {
  const initError = getInfrastructureInitError();
  if (initError) throw new Error(initError);

  const now = Date.now();
  if (registryCache && now - registryCache.loadedAt < REGISTRY_CACHE_TTL_MS) {
    return [...registryCache.projects];
  }

  const client = getInfrastructureClient();

  let result = await client
    .from(INFRA_PROJECTS_TABLE)
    .select(`${BASE_FIELDS},${ROUTING_FIELDS}`)
    .order('priority', { ascending: true });

  if (result.error && isMissingColumnError(result.error.code || '', result.error.message || '')) {
    // Backward compatibility: until the routing migration is applied the view
    // exposes only the original fields. Missing metadata is reported by the
    // resolver when a domain actually needs it.
    result = await client
      .from(INFRA_PROJECTS_TABLE)
      .select(BASE_FIELDS)
      .order('priority', { ascending: true }) as typeof result;
  }

  if (result.error) {
    throw classifyRegistryError(result.error.code || '', result.error.message || 'unknown error');
  }

  const projects = (result.data ?? []) as InfrastructureProject[];
  registryCache = { projects, loadedAt: now };
  return [...projects];
}

/** Force a fresh registry read on the next route resolution. */
export function refreshRegistry(): void {
  registryCache = null;
}

export function clearRegistryCache(): void {
  refreshRegistry();
}

/** All active projects registered for a domain. Multiple projects are allowed. */
export function getActiveProjectsByDomain(
  projects: InfrastructureProject[],
  domain: string
): InfrastructureProject[] {
  return projects.filter((project) => project.domain === domain && project.status === 'active');
}
