import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Supabase client is not used directly — all data access goes through the gateway.
// This module exists for type compatibility only.
const SUPABASE_URL = import.meta.env.VITE_API_GATEWAY_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_API_GATEWAY_URL || '';

export const supabase = SUPABASE_URL
  ? createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: localStorage,
        persistSession: false,
        autoRefreshToken: false,
      }
    })
  : null as unknown as ReturnType<typeof createClient<Database>>;
