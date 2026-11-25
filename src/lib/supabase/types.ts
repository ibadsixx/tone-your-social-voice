// Tone frontend — Supabase project configuration types.
//
// These types describe the subset of infrastructure_projects fields that the
// frontend is allowed to read. Privileged fields (service_key, jwt_secret, etc.)
// are never included here and must never be requested from the registry.

export type OperationType = 'read' | 'write' | 'sync' | 'auth';

export interface InfrastructureProject {
  project_key: string;
  domain: string;
  project_url: string;
  anon_key: string;
  status: string;
  priority: number;
  region: string | null;
  health_status: string | null;
  // Optional routing metadata. Older registry deployments expose only the
  // fields above; the resolver treats these as absent until migration
  // 20261124000000 is applied to the Infrastructure project.
  responsibility?: string | null;
  operation_types?: string[] | null;
  read_destination?: string | null;
  write_destination?: string | null;
  partition_key?: string | null;
}

export interface InfrastructureConfigError {
  code:
    | 'INIT_ERROR'
    | 'LOAD_ERROR'
    | 'NO_PROJECTS'
    | 'DOMAIN_NOT_FOUND'
    | 'PROJECT_NOT_FOUND'
    | 'AMBIGUOUS_ROUTE'
    | 'INVALID_CONFIG';
  message: string;
  details?: unknown;
}

export interface InfrastructureState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: InfrastructureConfigError | null;
  projects: InfrastructureProject[];
  loadedAt: number | null;
}

export interface DomainProjectConfig {
  project: InfrastructureProject;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

/** Explicit, deterministic route selection request. */
export interface ProjectRouteRequest {
  domain: string;
  operation: OperationType;
  projectKey?: string;
  responsibility?: string;
  partitionKey?: string;
}

export interface ResolvedProjectRoute {
  project: InfrastructureProject;
  domain: string;
  operation: OperationType;
  projectKey: string;
}
