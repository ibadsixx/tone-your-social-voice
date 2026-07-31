import type { Database } from './types';

// All data access goes through src/lib/gateway.ts — this type re-export
// exists for backward compatibility with generated Supabase types.
export type { Database };
