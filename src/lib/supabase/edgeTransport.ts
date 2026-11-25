// Tone frontend — Edge Function transport base.
//
// Long-lived realtime/live transports need a stable URL. It is derived from the
// Infrastructure Supabase project discovered through configuration, never from
// the abandoned API Gateway. All calls authenticate with the central Auth JWT.

import { readInfraEnv } from './infrastructureClient';

export function getEdgeBaseUrl(): string {
  const { url } = readInfraEnv();
  return url ? url.replace(/\/$/, '') : '';
}

export function getEdgeFunctionUrl(functionName: string): string {
  const base = getEdgeBaseUrl();
  return base ? `${base}/functions/v1/${functionName}` : '';
}
