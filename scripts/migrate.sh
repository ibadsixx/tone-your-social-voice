#!/usr/bin/env bash
# Run this script to apply the E2EE migration to your Supabase project.
#
# 1. Go to your project's SQL Editor: https://supabase.com/dashboard/project/YOUR_PROJECT_REF/sql/new
# 2. Open supabase/migrations/20260528000000_add_e2ee_columns.sql
# 3. Copy the entire file contents
# 4. Paste into the SQL Editor
# 5. Click "Run"
#
# Alternatively, run this script with your service role key:
#   SUPABASE_SERVICE_ROLE_KEY="your-key-here" bash scripts/migrate.sh

set -e

MIGRATION_FILE="supabase/migrations/20260528000000_add_e2ee_columns.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "Migration file not found: $MIGRATION_FILE"
  exit 1
fi

if [ -n "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "Applying migration via Supabase REST API..."
  SQL=$(cat "$MIGRATION_FILE")
  RESPONSE=$(curl -s -X POST "${VITE_SUPABASE_URL:?Set VITE_SUPABASE_URL to your Supabase project URL}/rest/v1/rpc/" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"sql\": $(echo "$SQL" | jq -Rs .)}")
  echo "Response: $RESPONSE"
else
  echo "=== Migration SQL (paste into Supabase SQL Editor) ==="
  echo ""
  cat "$MIGRATION_FILE"
  echo ""
  echo "=== End of SQL ==="
  echo ""
  echo "SUPABASE_SERVICE_ROLE_KEY not set."
  echo "Open https://supabase.com/dashboard/project/YOUR_PROJECT_REF/sql/new"
  echo "and paste the SQL above."
fi
