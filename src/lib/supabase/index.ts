// Tone frontend — Supabase infrastructure module exports.
//
// Centralized entry point for the registry-driven client factory. Domain
// projects are resolved through the Infrastructure Supabase registry, never
// hardcoded. The frontend uses only public anon keys; service-role credentials
// are never present in this module.

export {
  getDomainProjectConfig,
  getDomainSupabaseClient,
  getCachedClient,
  createClientForProject,
  clearClientCache,
  getCachedClientCount,
  isInfrastructureConfigured,
  loadInfrastructureProjects,
  getInfrastructureProjectByDomain,
  clearRegistryCache,
  getInfrastructureInitError,
} from './clientFactory';
export {
  signInWithPassword,
  signUp,
  signOut,
  getSession,
  getUser,
  refreshSession,
  updateUser,
  onAuthStateChange,
  mfa,
  getCentralAuthClient,
  getCentralAuthProject,
  getCentralAuthInitError,
  resetCentralAuthClient,
  initializeCentralAuth,
} from './centralAuth';
export {
  getMyProfile,
  getFunctionUrl,
} from './crossProject';
export type { InfrastructureProject, DomainProjectConfig, InfrastructureState } from './types';
