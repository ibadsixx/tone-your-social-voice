/**
 * Apply a Supabase migration by executing raw SQL via the service_role client.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY="..." npx tsx scripts/apply-migration.ts 20260528000000_add_e2ee_columns.sql
 *
 * Get your service_role key from: Supabase Dashboard → Project Settings → API
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error('Missing VITE_SUPABASE_URL environment variable');
  console.error('Set it to your Supabase project URL (do not commit it).');
  process.exit(1);
}

if (!SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  console.error('Get it from: Supabase Dashboard → Project Settings → API');
  process.exit(1);
}

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Usage: SUPABASE_SERVICE_ROLE_KEY="..." npx tsx scripts/apply-migration.ts <migration-file.sql>');
  process.exit(1);
}

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const filePath = resolve(process.cwd(), 'supabase', 'migrations', migrationFile);
  const sql = readFileSync(filePath, 'utf-8');

  console.log(`Applying migration: ${migrationFile}`);

  const { error } = await adminClient.rpc('exec_sql', { sql });

  if (error) {
    // exec_sql doesn't exist by default — try direct SQL via REST
    console.warn('exec_sql RPC not available, trying REST endpoint...');
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });
    console.error('REST fallback also failed. Apply the SQL manually:');
    console.log('\n--- SQL to run in Supabase SQL Editor ---');
    console.log(sql);
    console.log('--- end ---');
    process.exit(1);
  }

  console.log('Migration applied successfully!');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
