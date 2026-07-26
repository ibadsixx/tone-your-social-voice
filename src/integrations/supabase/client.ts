import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Gateway client is not used directly — all data access goes through src/lib/gateway.ts.
// This module exists for type compatibility only.
const GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL || '';
const GATEWAY_ANON_KEY = import.meta.env.VITE_API_GATEWAY_URL || '';

export const supabase = GATEWAY_URL
  ? createClient<Database>(GATEWAY_URL, GATEWAY_ANON_KEY, {
      auth: {
        storage: localStorage,
        persistSession: false,
        autoRefreshToken: false,
      }
    })
  : null as unknown as ReturnType<typeof createClient<Database>>;
