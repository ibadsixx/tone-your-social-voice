// Shared Edge Function helpers for genuine cross-project work.
//
// Service-role credentials are read only from Function secrets. The browser's
// central Auth JWT is verified against the central Auth project on every call;
// no client-supplied user ID is ever trusted as identity.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

// Every response from a verified caller is private. These headers are applied
// in one place so an error path cannot accidentally become cacheable. The
// pure feed core owns the same canonical values for regression tests.
export const privateResponseHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  Vary: 'Authorization',
} as const;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      ...privateResponseHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

export function requireMethod(req: Request, ...methods: string[]): Response | null {
  if (methods.includes(req.method)) return null;
  return errorResponse('Method not allowed', 405);
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > 64_000) throw new Error('Request body too large');
  const text = await req.text();
  if (!text) return {};
  if (text.length > 64_000) throw new Error('Request body too large');
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Request body must be a JSON object');
  }
  return value as Record<string, unknown>;
}

/** Verify the central Auth JWT and return the authoritative user ID. */
export async function verifyCaller(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Authentication required');
  const token = authHeader.slice(7).trim();
  if (!token) throw new Error('Authentication required');

  const url = Deno.env.get('CENTRAL_AUTH_URL');
  const anonKey = Deno.env.get('CENTRAL_AUTH_ANON_KEY');
  if (!url || !anonKey) throw new Error('Central Auth is not configured');

  const auth = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) throw new Error('Invalid or expired session');
  return data.user.id;
}

export function serviceClient(urlVar: string, keyVar: string): SupabaseClient {
  const url = Deno.env.get(urlVar);
  const key = Deno.env.get(keyVar);
  if (!url || !key) throw new Error(`Missing Function secret: ${urlVar} / ${keyVar}`);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function boundedString(value: unknown, name: string, max = 200): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    throw new Error(`Invalid ${name}`);
  }
  return value.trim();
}

export function optionalString(value: unknown, name: string, max = 200): string | null {
  if (value == null || value === '') return null;
  return boundedString(value, name, max);
}

export function intInRange(value: unknown, name: string, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function stringArray(value: unknown, name: string, max = 100): string[] {
  if (!Array.isArray(value) || value.length > max || value.some((item) => !isUuid(item))) {
    throw new Error(`Invalid ${name}`);
  }
  return value as string[];
}

/**
 * Stable operation ID for retry-safe logging and deterministic writes. No
 * temporary database cache is created; callers rely on unique natural keys or
 * idempotent deletes/upserts to avoid duplicate permanent rows.
 */
export async function operationId(userId: string, operation: string, input: unknown): Promise<string> {
  const canonical = JSON.stringify({ userId, operation, input });
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function handleError(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  const status = /auth|session|invalid|required/i.test(message) ? 400 : 500;
  return errorResponse(status === 400 ? message : 'Cross-project operation failed', status);
}
