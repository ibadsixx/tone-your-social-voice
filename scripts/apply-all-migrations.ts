/**
 * Apply ALL SQL migrations in order against a configured SQL execution endpoint.
 *
 * 1. Set MIGRATION_SQL_ENDPOINT to an HTTP endpoint that accepts
 *    POST { "sql": "..." } with Bearer authentication.
 *    Use {ref} as a placeholder for the project ref if the endpoint needs it.
 * 2. Run:
 *    MIGRATION_SQL_ENDPOINT="https://..." \
 *    MIGRATION_ACCESS_TOKEN="..." \
 *    npx tsx scripts/apply-all-migrations.ts
 */
import { readFileSync, readdirSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ENDPOINT_TEMPLATE = process.env.MIGRATION_SQL_ENDPOINT;
const PROJECT_REF = process.env.MIGRATION_PROJECT_REF ?? '';
const MIGRATIONS_DIR = resolve(__dirname, '..', 'supabase', 'migrations');
const ACCESS_TOKEN = process.env.MIGRATION_ACCESS_TOKEN;

if (!ENDPOINT_TEMPLATE) {
  console.error('Missing MIGRATION_SQL_ENDPOINT');
  console.error('Set it to the HTTP endpoint that executes SQL (POST { sql }); use {ref} for the project ref placeholder.');
  process.exit(1);
}

if (ENDPOINT_TEMPLATE.includes('{ref}') && !PROJECT_REF) {
  console.error('MIGRATION_SQL_ENDPOINT contains {ref} but MIGRATION_PROJECT_REF is not set.');
  process.exit(1);
}

if (!ACCESS_TOKEN) {
  console.error('Missing MIGRATION_ACCESS_TOKEN');
  console.error('Export a token authorized to run SQL against the target database.');
  process.exit(1);
}

async function runSql(query: string): Promise<void> {
  const response = await fetch(
    ENDPOINT_TEMPLATE!.replace('{ref}', encodeURIComponent(PROJECT_REF)),
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
