// Tone frontend — Central Supabase Auth client.
//
// Provides authentication against the central Auth Supabase project
// (ojdhztcetykgvrcwlwen / domain "users") using the official Supabase JS SDK.
// The auth project's URL and anon key are discovered dynamically from the
// infrastructure registry — they are never hardcoded here.
//
// This client preserves existing account credentials and authentication
// behavior. It does not create a second user identity system, does not migrate
// or reset user accounts, and does not assume central JWTs are automatically
// accepted by other Supabase projects.
//
// JWTs issued by the central Auth project are verified by Supabase itself
// (via the project's JWKS endpoint). The frontend never handles the JWT
// signing secret and never exposes service-role credentials.

import { createClient, SupabaseClient, type AuthSession, type AuthUser } from '@supabase/supabase-js';
import {
  getProjectClient,
  isInfrastructureConfigured,
} from './clientFactory';
import {
  clearCurrentAccessToken,
  setCurrentAccessToken,
} from './sessionTokenProvider';
import type { InfrastructureProject } from './types';

const AUTH_DOMAIN = 'users';
const AUTH_STORAGE_KEY = 'tone-central-auth';

type AuthAttributes = NonNullable<Parameters<SupabaseClient['auth']['updateUser']>[0]>;

/** Callers may pass auth attributes directly or wrapped in `attributes`. */
export type UpdateUserOptions = Omit<AuthAttributes, 'attributes'> & {
  attributes?: Record<string, unknown>;
};

export interface CentralMfaFactor {
  id: string;
  status: string;
  factor_type?: string;
  friendly_name?: string;
  created_at?: string;
  updated_at?: string;
}

/** Both the legacy `factors` array and the grouped factors are published. */
export interface CentralMfaFactorsData {
  factors: CentralMfaFactor[];
  all: CentralMfaFactor[];
  totp: CentralMfaFactor[];
  phone: CentralMfaFactor[];
  webauthn: CentralMfaFactor[];
  recovery_code: CentralMfaFactor[];
}

export interface CentralMfaEnrollData {
  id: string;
  totp: { uri: string; secret: string };
}

let centralAuthClient: SupabaseClient | null = null;
let centralAuthProject: InfrastructureProject | null = null;
let initError: string | null = null;

async function resolveCentralAuthProject(): Promise<InfrastructureProject> {
  if (!isInfrastructureConfigured()) {
    throw new Error(
      'Infrastructure Supabase is not configured. Set VITE_INFRA_SUPABASE_URL and VITE_INFRA_SUPABASE_ANON_KEY.'
    );
  }

  const { route } = await getProjectClient({ domain: AUTH_DOMAIN, operation: 'auth' });
  const project = route.project;

  if (!project.project_url || !project.anon_key) {
    throw new Error(
      `Central Auth project for domain ${AUTH_DOMAIN} is missing project_url or anon_key`
    );
  }

  // Auth sessions must survive reloads, so Auth uses a dedicated persistent
  // client. Domain clients receive the resulting JWT through the shared token
  // provider below.
  centralAuthClient = createClient(project.project_url, project.anon_key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: AUTH_STORAGE_KEY,
    },
  });
  centralAuthProject = project;

  const sessionResult = await centralAuthClient.auth.getSession();
  setCurrentAccessToken(sessionResult?.data?.session?.access_token ?? null);
  return project;
}

export function getCentralAuthClient(): SupabaseClient | null {
  return centralAuthClient;
}

export function getCentralAuthProject(): InfrastructureProject | null {
  return centralAuthProject;
}

export function getCentralAuthInitError(): string | null {
  return initError;
}

/** Current signed-in user's access token, read from the persistent session. */
export async function getAccessToken(): Promise<string | null> {
  if (!centralAuthClient) await resolveCentralAuthProject();
  const client = centralAuthClient;
  if (!client) return null;
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token ?? null;
  setCurrentAccessToken(token);
  return token;
}

export function resetCentralAuthClient(): void {
  centralAuthClient = null;
  centralAuthProject = null;
  initError = null;
  clearCurrentAccessToken();
}

/**
 * Initialize the central Auth client by resolving the "users" domain project
 * from the infrastructure registry. Must be called before any auth operation.
 */
export async function initializeCentralAuth(): Promise<void> {
  try {
    await resolveCentralAuthProject();
    initError = null;
  } catch (err) {
    initError =
      err instanceof Error
        ? err.message
        : 'Failed to initialize central Auth client';
    centralAuthClient = null;
    centralAuthProject = null;
    throw new Error(initError);
  }
}

/**
 * Sign in with email and password through the central Auth project.
 * Preserves existing account credentials and authentication behavior.
 */
export async function signInWithPassword({
  email,
  password,
}: {
  email: string;
  password: string;
}): Promise<{
  data: {
    session: AuthSession | null;
    user: AuthUser | null;
    mfaRequired: boolean;
    factorId?: string;
  } | null;
  error: { message: string } | null;
}> {
  if (!centralAuthClient) {
    await initializeCentralAuth();
  }
  if (!centralAuthClient) {
    return {
      data: null,
      error: { message: initError || 'Auth client not initialized' },
    };
  }

  const { data, error } = await centralAuthClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  setCurrentAccessToken(data.session?.access_token ?? null);

  const authData = data as typeof data & {
    mfaRequired?: boolean;
    mfa_required?: boolean;
    factorId?: string;
    factor_id?: string;
  };

  return {
    data: {
      session: data.session ?? null,
      user: data.user ?? null,
      mfaRequired: authData.mfaRequired ?? authData.mfa_required ?? false,
      factorId: authData.factorId ?? authData.factor_id ?? undefined,
    },
    error: null,
  };
}

/**
 * Sign up with email and password through the central Auth project.
 * Accounts are created per the central project's configuration.
 */
export async function signUp({
  email,
  password,
  options,
}: {
  email: string;
  password: string;
  options?: { data?: Record<string, unknown>; emailRedirectTo?: string };
}): Promise<{
  data: { user: unknown; session: unknown } | null;
  error: { message: string } | null;
}> {
  if (!centralAuthClient) {
    await initializeCentralAuth();
  }
  if (!centralAuthClient) {
    return {
      data: null,
      error: { message: initError || 'Auth client not initialized' },
    };
  }

  const { data, error } = await centralAuthClient.auth.signUp({
    email,
    password,
    options,
  });

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  const signUpData = data as typeof data & { session?: { access_token?: string } };
  setCurrentAccessToken(signUpData.session?.access_token ?? null);

  return {
    data: {
      user: data.user ?? null,
      session: signUpData.session ?? null,
    },
    error: null,
  };
}

/**
 * Sign out through the central Auth project.
 */
export async function signOut(): Promise<{
  error: { message: string } | null;
}> {
  if (!centralAuthClient) {
    await initializeCentralAuth();
  }
  if (!centralAuthClient) {
    return { error: { message: initError || 'Auth client not initialized' } };
  }

  const { error } = await centralAuthClient.auth.signOut();

  if (error) {
    return { error: { message: error.message } };
  }

  clearCurrentAccessToken();
  return { error: null };
}

/**
 * Retrieve the current session through the central Auth project.
 */
export async function getSession(): Promise<{
  data: { session: any } | null;
  error: { message: string } | null;
}> {
  if (!centralAuthClient) {
    await initializeCentralAuth();
  }
  if (!centralAuthClient) {
    return {
      data: null,
      error: { message: initError || 'Auth client not initialized' },
    };
  }

  const { data, error } = await centralAuthClient.auth.getSession();

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  setCurrentAccessToken(data.session?.access_token ?? null);
  return {
    data: { session: data.session ?? null },
    error: null,
  };
}

/**
 * Retrieve the current user through the central Auth project.
 */
export async function getUser(): Promise<{
  data: { user: any } | null;
  error: { message: string } | null;
}> {
  if (!centralAuthClient) {
    await initializeCentralAuth();
  }
  if (!centralAuthClient) {
    return {
      data: null,
      error: { message: initError || 'Auth client not initialized' },
    };
  }

  const { data, error } = await centralAuthClient.auth.getUser();

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  return {
    data: { user: data.user ?? null },
    error: null,
  };
}

/**
 * Refresh the session through the central Auth project.
 */
export async function refreshSession(): Promise<{
  data: { session: unknown } | null;
  error: { message: string } | null;
}> {
  if (!centralAuthClient) {
    await initializeCentralAuth();
  }
  if (!centralAuthClient) {
    return {
      data: null,
      error: { message: initError || 'Auth client not initialized' },
    };
  }

  const { data, error } = await centralAuthClient.auth.refreshSession();

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  setCurrentAccessToken(data.session?.access_token ?? null);
  return {
    data: { session: data.session ?? null },
    error: null,
  };
}

/**
 * Update user metadata through the central Auth project.
 */
export async function updateUser(options: UpdateUserOptions): Promise<{
  data: { user: AuthUser | null } | null;
  error: { message: string } | null;
}> {
  if (!centralAuthClient) {
    await initializeCentralAuth();
  }
  if (!centralAuthClient) {
    return {
      data: null,
      error: { message: initError || 'Auth client not initialized' },
    };
  }

  // Accept both the legacy `{ attributes: ... }` wrapper and direct auth
  // attributes (e.g. `{ email }`) used by the settings screens.
  const { attributes, ...directAttributes } = options;
  const { data, error } = await centralAuthClient.auth.updateUser(
    (attributes ?? directAttributes) as AuthAttributes
  );

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  return {
    data: { user: data.user ?? null },
    error: null,
  };
}

/**
 * Listen to auth state changes through the central Auth project.
 */
export function onAuthStateChange(
  callback: (event: string, session: AuthSession | null) => void
): {
  data: { subscription: { unsubscribe: () => void } };
} {
  if (!centralAuthClient) {
    // Return a no-op subscription if not initialized yet.
    return {
      data: {
        subscription: { unsubscribe: () => {} },
      },
    };
  }

  const { data } = centralAuthClient.auth.onAuthStateChange(
    (event, session) => {
      setCurrentAccessToken(session?.access_token ?? null);
      callback(event, session ?? null);
    }
  );

  return {
    data: {
      subscription: {
        unsubscribe: () => {
          data.subscription.unsubscribe();
        },
      },
    },
  };
}

/**
 * MFA namespace for the central Auth project.
 */
export const mfa = {
  listFactors: async (): Promise<{
    data: CentralMfaFactorsData | null;
    error: { message: string } | null;
  }> => {
    if (!centralAuthClient) {
      await initializeCentralAuth();
    }
    if (!centralAuthClient) {
      return {
        data: null,
        error: { message: initError || 'Auth client not initialized' },
      };
    }

    const { data, error } = await centralAuthClient.auth.mfa.listFactors();

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    // Newer auth-js versions return grouped factors (`all`, `totp`, ...) while
    // older ones expose a flat `factors` array. Publish both shapes.
    const raw = data as unknown as Partial<CentralMfaFactorsData>;
    const all = raw.all ?? raw.factors ?? [];
    const byType = (type: keyof CentralMfaFactorsData): CentralMfaFactor[] =>
      raw[type] ?? all.filter((factor) => factor.factor_type === type);

    return {
      data: {
        factors: all,
        all,
        totp: byType('totp'),
        phone: byType('phone'),
        webauthn: byType('webauthn'),
        recovery_code: byType('recovery_code'),
      },
      error: null,
    };
  },

  enroll: async ({
    factorType,
    friendlyName,
    issuer,
  }: {
    factorType: string;
    friendlyName?: string;
    issuer?: string;
  }): Promise<{
    data: CentralMfaEnrollData | null;
    error: { message: string } | null;
  }> => {
    if (!centralAuthClient) {
      await initializeCentralAuth();
    }
    if (!centralAuthClient) {
      return {
        data: null,
        error: { message: initError || 'Auth client not initialized' },
      };
    }

    const enrollParams = {
      factorType,
      friendlyName,
      issuer,
    } as Parameters<SupabaseClient['auth']['mfa']['enroll']>[0];
    const { data, error } = await centralAuthClient.auth.mfa.enroll(enrollParams);

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    return { data: (data ?? null) as unknown as CentralMfaEnrollData | null, error: null };
  },

  challenge: async ({
    factorId,
  }: {
    factorId: string;
  }): Promise<{
    data: { id: string } | null;
    error: { message: string } | null;
  }> => {
    if (!centralAuthClient) {
      await initializeCentralAuth();
    }
    if (!centralAuthClient) {
      return {
        data: null,
        error: { message: initError || 'Auth client not initialized' },
      };
    }

    const { data, error } = await centralAuthClient.auth.mfa.challenge({
      factorId,
    });

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    return { data: { id: data.id ?? '' }, error: null };
  },

  verify: async ({
    factorId,
    challengeId,
    code,
  }: {
    factorId: string;
    challengeId: string;
    code: string;
  }): Promise<{
    data: unknown | null;
    error: { message: string } | null;
  }> => {
    if (!centralAuthClient) {
      await initializeCentralAuth();
    }
    if (!centralAuthClient) {
      return {
        data: null,
        error: { message: initError || 'Auth client not initialized' },
      };
    }

    const { data, error } = await centralAuthClient.auth.mfa.verify({
      factorId,
      challengeId,
      code,
    });

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    return { data, error: null };
  },

  unenroll: async ({
    factorId,
  }: {
    factorId: string;
  }): Promise<{
    error: { message: string } | null;
  }> => {
    if (!centralAuthClient) {
      await initializeCentralAuth();
    }
    if (!centralAuthClient) {
      return {
        error: { message: initError || 'Auth client not initialized' },
      };
    }

    const { error } = await centralAuthClient.auth.mfa.unenroll({
      factorId,
    });

    if (error) {
      return { error: { message: error.message } };
    }

    return { error: null };
  },
};

export default {
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
};
