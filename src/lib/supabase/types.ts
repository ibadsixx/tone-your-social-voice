// Tone frontend — Supabase project configuration types.
//
// These types describe the subset of infrastructure_projects fields that the
// frontend is allowed to read. Privileged fields (service_key, jwt_secret, etc.)
// are never included here and must never be requested from the registry.

export interface InfrastructureProject {
  project_key: string;
  domain: string;
  project_url: string;
  anon_key: string;
  status: string;
  priority: number;
  region: string | null;
  health_status: string | null;
}

export interface InfrastructureConfigError {
  code: 'INIT_ERROR' | 'LOAD_ERROR' | 'NO_PROJECTS' | 'DOMAIN_NOT_FOUND' | 'INVALID_CONFIG';
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
