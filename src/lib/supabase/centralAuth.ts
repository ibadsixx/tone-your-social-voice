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

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  getDomainSupabaseClient,
  isInfrastructureConfigured,
} from './clientFactory';
import type { InfrastructureProject } from './types';

const AUTH_DOMAIN = 'users';

let centralAuthClient: SupabaseClient | null = null;
let centralAuthProject: InfrastructureProject | null = null;
let initError: string | null = null;

async function resolveCentralAuthProject(): Promise<InfrastructureProject> {
  if (!isInfrastructureConfigured()) {
    throw new Error(
      'Infrastructure Supabase is not configured. Set VITE_INFRA_SUPABASE_URL and VITE_INFRA_SUPABASE_ANON_KEY.'
    );
  }

  const { client, project } = await getDomainSupabaseClient(AUTH_DOMAIN);
  centralAuthClient = client;
  centralAuthProject = project;
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

export function resetCentralAuthClient(): void {
  centralAuthClient = null;
  centralAuthProject = null;
  initError = null;
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
  data: { session: unknown; user: unknown } | null;
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

  return {
    data: {
      session: data.session ?? null,
      user: data.user ?? null,
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
  data: { user: unknown } | null;
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

  return {
    data: { user: data.user ?? null },
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

  return { error: null };
}

/**
 * Retrieve the current session through the central Auth project.
 */
export async function getSession(): Promise<{
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

  const { data, error } = await centralAuthClient.auth.getSession();

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  return {
    data: { session: data.session ?? null },
    error: null,
  };
}

/**
 * Retrieve the current user through the central Auth project.
 */
export async function getUser(): Promise<{
  data: { user: unknown } | null;
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

  return {
    data: { session: data.session ?? null },
    error: null,
  };
}

/**
 * Update user metadata through the central Auth project.
 */
export async function updateUser({
  attributes,
}: {
  attributes: Record<string, unknown>;
}): Promise<{
  data: { user: unknown } | null;
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

  const { data, error } = await centralAuthClient.auth.updateUser(attributes);

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
  callback: (event: string, session: unknown) => void
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
    data: { factors: unknown[] } | null;
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

    return {
      data: { factors: data.factors ?? [] },
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

    const { data, error } = await centralAuthClient.auth.mfa.enroll({
      factorType,
      friendlyName,
      issuer,
    });

    if (error) {
      return { data: null, error: { message: error.message } };
    }

    return { data, error: null };
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
