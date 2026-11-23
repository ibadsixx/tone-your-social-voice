// Tone frontend — Central project configuration registry.
//
// Loads approved project records from the infrastructure_projects_public view
// using the Infrastructure Supabase client (anon key only). The view exposes
// only fields safe for frontend consumption; service_key, jwt_secret and any
// other privileged columns are never included.

import {
  getInfrastructureClient,
  getInfrastructureInitError,
  readInfraEnv,
} from './infrastructureClient';
import type { InfrastructureProject } from './types';

// Fields safe to expose to the frontend. service_key, jwt_secret and any other
// privileged columns are deliberately excluded.
const SAFE_FIELDS =
  'project_key, domain, project_url, anon_key, status, priority, region, health_status';

// Table name — the frontend reads directly from infrastructure_projects_public,
// selecting only frontend-safe columns.
const INFRA_PROJECTS_TABLE = 'infrastructure_projects_public';

let registryCache: { projects: InfrastructureProject[]; loadedAt: number } | null = null;
const REGISTRY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function isInfrastructureConfigured(): boolean {
  const { url, anonKey } = readInfraEnv();
  return Boolean(url && anonKey);
}

export async function loadInfrastructureProjects(): Promise<InfrastructureProject[]> {
  const initError = getInfrastructureInitError();
  if (initError) {
    throw new Error(initError);
  }

  const now = Date.now();
  if (registryCache && now - registryCache.loadedAt < REGISTRY_CACHE_TTL_MS) {
    return [...registryCache.projects];
  }

  const client = getInfrastructureClient();

  const { data, error } = await client
    .from(INFRA_PROJECTS_TABLE)
    .select(SAFE_FIELDS)
    .order('priority', { ascending: true });

  // Distinguish between different error types so callers can handle them
  // appropriately:
  //   - 404/PGRST006: table or view does not exist
  //   - 403: RLS or permissions prevent access
  //   - Other: unexpected errors
  if (error) {
    const message = error.message || 'unknown error';
    const code = error.code || '';
    if (code === '42P01' || message.includes('does not exist')) {
      throw new Error(
        `Infrastructure registry view not found: migrations/008_infrastructure_projects_public_view.sql must be applied to the Infrastructure project`
      );
    }
    if (code === '42501' || message.includes('permission denied')) {
      throw new Error(
        'Infrastructure registry access denied: RLS policy does not permit anon read of infrastructure_projects_public'
      );
    }
    throw new Error(
      `Failed to load infrastructure project registry: ${message}`
    );
  }

  if (!data || data.length === 0) {
    return [];
  }

  const projects = data as InfrastructureProject[];
  registryCache = { projects, loadedAt: now };
  return [...projects];
}

export function getInfrastructureProjectByDomain(
  projects: InfrastructureProject[],
  domain: string
): InfrastructureProject | undefined {
  // Filter to active projects for the domain, then pick the lowest priority.
  const domainProjects = projects.filter(
    (p) => p.domain === domain && p.status === 'active'
  );

  if (domainProjects.length === 0) return undefined;

  return domainProjects.reduce((best, current) =>
    current.priority < best.priority ? current : best
  );
}

export function clearRegistryCache(): void {
  registryCache = null;
}
