#!/usr/bin/env bash
# Apply the E2EE migration.
#
# Option A (automatic): point MIGRATION_SQL_ENDPOINT at an HTTP endpoint that
# accepts POST {"sql": "..."} with optional Bearer auth:
#   MIGRATION_SQL_ENDPOINT="https://..." MIGRATION_ACCESS_TOKEN="..." bash scripts/migrate.sh
#
# Option B (manual): prints the migration SQL to paste into your database console.

set -e

MIGRATION_FILE="supabase/migrations/20260528000000_add_e2ee_columns.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "Migration file not found: $MIGRATION_FILE"
  exit 1
fi

if [ -n "$MIGRATION_SQL_ENDPOINT" ]; then
  echo "Applying migration via the configured SQL endpoint..."
  SQL=$(cat "$MIGRATION_FILE")
  AUTH_HEADER=()
  if [ -n "$MIGRATION_ACCESS_TOKEN" ]; then
    AUTH_HEADER=(-H "Authorization: Bearer $MIGRATION_ACCESS_TOKEN")
  fi
  RESPONSE=$(curl -s -X POST "$MIGRATION_SQL_ENDPOINT" \
    "${AUTH_HEADER[@]}" \
    -H "Content-Type: application/json" \
    -d "{\"sql\": $(echo "$SQL" | jq -Rs .)}")
  echo "Response: $RESPONSE"
else
  echo "=== Migration SQL ==="
  echo ""
  cat "$MIGRATION_FILE"
  echo ""
  echo "=== End of SQL ==="
  echo ""
  echo "MIGRATION_SQL_ENDPOINT not set."
  echo "Paste the SQL above into your database's SQL console."
fi
