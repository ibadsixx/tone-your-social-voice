// Tone frontend — Cross-project authenticated operations.
//
// Calls Edge Functions hosted on the Infrastructure Supabase project to
// perform authenticated operations in domain projects. The central Auth JWT is
// forwarded to the Edge Function, which verifies it against the central Auth
// project and enforces authorization server-side.
//
// The frontend never sends a raw user ID as proof of identity, never exposes
// service-role credentials, and never assumes central JWTs are accepted
// directly by domain projects.

import {
  getCentralAuthClient,
  getCentralAuthInitError,
} from './centralAuth';
import { readInfraEnv } from './infrastructureClient';

const FUNCTION_NAME = 'getProfile';

function getFunctionUrl(functionName: string): string {
  const { url } = readInfraEnv();
  if (!url) {
    throw new Error(
      'Infrastructure Supabase URL not configured. Set VITE_INFRA_SUPABASE_URL.'
    );
  }
  return `${url.replace(/\/$/, '')}/functions/v1/${functionName}`;
}

/**
 * Call an Edge Function with the current central Auth JWT.
 * The function verifies the JWT server-side and enforces authorization.
 */
async function callEdgeFunction<TRequest, TResponse>(
  functionName: string,
  body?: TRequest
): Promise<{
  data: TResponse | null;
  error: { message: string } | null;
}> {
  const authError = getCentralAuthInitError();
  if (authError) {
    return {
      data: null,
      error: { message: authError },
    };
  }

  const authClient = getCentralAuthClient();
  if (!authClient) {
    return {
      data: null,
      error: { message: 'Central Auth client not initialized' },
    };
  }

  const { data: { session } } = await authClient.auth.getSession();
  const token = session?.access_token ?? null;

  if (!token) {
    return {
      data: null,
      error: { message: 'No active session' },
    };
  }

  const url = getFunctionUrl(functionName);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      return {
        data: null,
        error: {
          message:
            typeof errBody?.error === 'string'
              ? errBody.error
              : `Request failed with status ${response.status}`,
        },
      };
    }

    const json = await response.json();
    return {
      data: json?.data ?? null,
      error: json?.error ? { message: json.error } : null,
    };
  } catch (err) {
    return {
      data: null,
      error: {
        message: err instanceof Error ? err.message : 'Request failed',
      },
    };
  }
}

/**
 * Get the current user's profile from the profiles domain project via the
 * getProfile Edge Function. The Edge Function verifies the central Auth JWT
 * and reads the profile using a service-role client, enforcing authorization
 * by matching the verified user ID against the profile row.
 */
export async function getMyProfile(): Promise<{
  data: {
    id: string;
    email?: string;
    username?: string;
    display_name?: string;
    profile_pic?: string | null;
    [key: string]: unknown;
  } | null;
  error: { message: string } | null;
}> {
  return callEdgeFunction<{ profileId?: string }, unknown>('getProfile', {}).then(
    (result) => {
      if (result.error) {
        return { data: null, error: result.error };
      }
      return {
        data: result.data as
          | {
              id: string;
              email?: string;
              username?: string;
              display_name?: string;
              profile_pic?: string | null;
              [key: string]: unknown;
            }
          | null,
        error: null,
      };
    }
  );
}

export { getFunctionUrl };
