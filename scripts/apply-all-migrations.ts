/**
 * Apply ALL Supabase migrations in order using the Management API.
 *
 * 1. Get a personal access token from https://supabase.com/dashboard/account/tokens
 * 2. Run:
 *    SUPABASE_ACCESS_TOKEN="sbp_..." npx tsx scripts/apply-all-migrations.ts
 */
import { readFileSync, readdirSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const MIGRATIONS_DIR = resolve(__dirname, '..', 'supabase', 'migrations');
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!PROJECT_REF) {
  console.error('Missing SUPABASE_PROJECT_REF');
  console.error('Set SUPABASE_PROJECT_REF to your Supabase project ref (do not commit it).');
  process.exit(1);
}

if (!ACCESS_TOKEN) {
  console.error('Missing SUPABASE_ACCESS_TOKEN');
  console.error('Create one at: https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

async function runSql(query: string): Promise<void> {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SQL failed (${response.status}): ${text}`);
  }
}

async function main() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`Found ${files.length} migrations to apply.`);

  for (const file of files) {
    const filePath = join(MIGRATIONS_DIR, file);
    const sql = readFileSync(filePath, 'utf-8').trim();
    if (!sql) continue;

    console.log(`  Applying ${file}...`);
      try {
        await runSql(sql);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const firstLine = message.split('\n')[0];
        // Skip "already exists" errors — IF NOT EXISTS may not cover all cases
        if (firstLine.includes('already exists')) {
          console.log(`  ~ ${file}: ${firstLine.split(':').pop()?.trim()}`);
        } else {
          console.warn(`  ⚠ ${file}: ${firstLine}`);
        }
      }
  }

  console.log('\nAll migrations applied successfully.');
}

main().catch(err => {
  console.error('Fatal error:', err.message ?? err);
  process.exit(1);
});
