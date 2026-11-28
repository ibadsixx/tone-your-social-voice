// Tone frontend — Central project configuration registry.
//
// Loads approved project records from the infrastructure_projects_public view
// through the Infrastructure Supabase client (anon key only). Service-role
// credentials and management tokens are never requested.
//
// Rows are validated before they reach the resolver. The loader detects the
// eight-column view once per cache generation and does not repeat a failed
// extended-column query on every cache miss.

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
// The resolver can use these fields when the extended view is deployed; the
// base path remains supported for the existing eight-column view.
const ROUTING_FIELDS =
  'responsibility, operation_types, read_destination, write_destination, partition_key';

const INFRA_PROJECTS_TABLE = 'infrastructure_projects_public';
const REGISTRY_CACHE_TTL_MS = 5 * 60 * 1000;

type RegistrySchemaMode = 'unknown' | 'base' | 'extended';
type RegistryRow = Record<string, unknown>;

let registryCache: { projects: InfrastructureProject[]; loadedAt: number } | null = null;
let schemaMode: RegistrySchemaMode = 'unknown';
let pendingLoad: Promise<InfrastructureProject[]> | null = null;
let registryGeneration = 0;

export function isInfrastructureConfigured(): boolean {
  const { url, anonKey } = readInfraEnv();
  return Boolean(url && anonKey);
}

function classifyRegistryError(code: string, message: string): Error {
  if (code === '42P01' || /relation\s+["']?infrastructure_projects_public/i.test(message)) {
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
  // A missing view is not a missing column. Do not let it trigger a second,
  // doomed base-column query.
  if (code === '42P01') return false;
  if (code === '42703' || code === 'PGRST204') return true;
  return /column\s+[^\s]+\s+does not exist|could not find the\s+[^\s]*\s*column/i.test(message);
}

function requireString(row: RegistryRow, field: string, projectKey: string): string {
  const value = row[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `Infrastructure registry entry ${projectKey || '<missing project_key>'} has an invalid ${field}; routing refused`
    );
  }
  return value;
}

function optionalString(row: RegistryRow, field: string, projectKey: string): string | null | undefined {
  const value = row[field];
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `Infrastructure registry entry ${projectKey || '<missing project_key>'} has an invalid ${field}; routing refused`
    );
  }
  return value;
}

function optionalOperationTypes(
  row: RegistryRow,
  projectKey: string
): string[] | null | undefined {
  const value = row.operation_types;
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    throw new Error(
      `Infrastructure registry entry ${projectKey || '<missing project_key>'} has invalid operation_types; routing refused`
    );
  }
  return value as string[];
}

function validateProjects(rows: unknown[]): InfrastructureProject[] {
  return rows.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('Infrastructure registry returned an invalid project row; routing refused');
    }
    const row = raw as RegistryRow;

    const projectKey = typeof row.project_key === 'string' && row.project_key.trim() !== ''
      ? row.project_key
      : '';
    if (!projectKey) {
      throw new Error('Infrastructure registry entry has no project_key; routing refused');
    }

    const projectUrl = requireString(row, 'project_url', projectKey);
    try {
      const parsed = new URL(projectUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('bad protocol');
    } catch {
      // Do not include the value in the error message; it may be a credential-bearing URL.
      throw new Error(
        `Infrastructure registry entry ${projectKey} has an invalid project_url; routing refused`
      );
    }

    const priority = row.priority;
    if (typeof priority !== 'number' || !Number.isFinite(priority)) {
      throw new Error(
        `Infrastructure registry entry ${projectKey} has an invalid priority; routing refused`
      );
    }

    const region = optionalString(row, 'region', projectKey) ?? null;
    const healthStatus = optionalString(row, 'health_status', projectKey) ?? null;

    return {
      project_key: projectKey,
      domain: requireString(row, 'domain', projectKey),
      project_url: projectUrl,
      // Do not print or echo the value; only its presence is validated.
      anon_key: requireString(row, 'anon_key', projectKey),
      status: requireString(row, 'status', projectKey),
      priority,
      region,
      health_status: healthStatus,
      responsibility: optionalString(row, 'responsibility', projectKey),
      operation_types: optionalOperationTypes(row, projectKey),
      read_destination: optionalString(row, 'read_destination', projectKey),
      write_destination: optionalString(row, 'write_destination', projectKey),
      partition_key: optionalString(row, 'partition_key', projectKey),
    } satisfies InfrastructureProject;
  });
}

async function loadProjects(): Promise<InfrastructureProject[]> {
  const client = getInfrastructureClient();
  const generation = registryGeneration;

  const selectFields = schemaMode === 'base' ? BASE_FIELDS : `${BASE_FIELDS},${ROUTING_FIELDS}`;
  let result = await client
    .from(INFRA_PROJECTS_TABLE)
    .select(selectFields)
    .order('priority', { ascending: true });

  if (
    result.error &&
    schemaMode !== 'base' &&
    isMissingColumnError(result.error.code || '', result.error.message || '')
  ) {
    // One compatibility fallback per cache generation. The base-only mode is
    // remembered so later cache misses do not repeat the failed query.
    schemaMode = 'base';
    result = await client
      .from(INFRA_PROJECTS_TABLE)
      .select(BASE_FIELDS)
      .order('priority', { ascending: true }) as typeof result;
  }

  if (result.error) {
    throw classifyRegistryError(result.error.code || '', result.error.message || 'unknown error');
  }

  if (schemaMode !== 'base') schemaMode = 'extended';

  const projects = validateProjects(result.data ?? []);
  if (generation === registryGeneration) {
    registryCache = { projects, loadedAt: Date.now() };
  }
  return projects;
}

export async function loadInfrastructureProjects(): Promise<InfrastructureProject[]> {
  const initError = getInfrastructureInitError();
  if (initError) throw new Error(initError);

  const now = Date.now();
  if (registryCache && now - registryCache.loadedAt < REGISTRY_CACHE_TTL_MS) {
    return [...registryCache.projects];
  }

  if (pendingLoad) return [...await pendingLoad];

  pendingLoad = loadProjects();
  try {
    return [...await pendingLoad];
  } finally {
    pendingLoad = null;
  }
}

/** Force a fresh registry read and schema re-detection on the next resolution. */
export function refreshRegistry(): void {
  registryGeneration += 1;
  registryCache = null;
  schemaMode = 'unknown';
  pendingLoad = null;
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
