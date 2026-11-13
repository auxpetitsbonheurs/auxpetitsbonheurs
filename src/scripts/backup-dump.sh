#!/usr/bin/env bash
# Dumps the bakery database into <out-dir> (S-020, S-231, S-232). Used by the weekly backup
# (.github/workflows/backup.yml, production) and the read-only rehearsal on staging
# (backup-rehearsal.yml), so the rehearsal proves exactly what the real backup does.
#
#   database.dump  the app's tables (schemas public and drizzle): structure and data, custom format.
#                  Restores into any clean Postgres >= 17 (README "Restore a backup").
#   auth.dump      Supabase Auth rows only (schema auth, data only): sign-in accounts. Restores into
#                  a NEW Supabase project, whose auth tables already exist.
#   counts.tsv     rows per table and photo objects per bucket at dump time, for the restore check
#                  (scripts/backup-verify.sh). Counts only: no personal data.
#
# Why not one full dump: a Supabase database holds Supabase-owned schemas (storage, vault,
# realtime, extensions…) that only restore into Supabase itself and can refuse a plain pg_dump.
# The tools come from the postgres:17 image (pg_dump must be >= the Supabase server version).
# The database URL is read from SUPABASE_DB_URL and never printed. Every statement is read-only.
#
# Usage: SUPABASE_DB_URL=... scripts/backup-dump.sh <out-dir>
set -euo pipefail

out=${1:?usage: backup-dump.sh <out-dir>}
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is not set}"
mkdir -p "$out"
out=$(cd "$out" && pwd)

# Runs as the runner's user so the files land in the runner-owned folder (S-020 fix).
docker run --rm --user "$(id -u):$(id -g)" -e SUPABASE_DB_URL \
  -v "$out:/backup" -v "$(cd "$(dirname "$0")" && pwd)/backup-counts.sql:/counts.sql:ro" postgres:17 sh -c '
    set -e
    pg_dump --format=custom --no-owner --no-privileges --schema=public --schema=drizzle --file=/backup/database.dump "$SUPABASE_DB_URL"
    pg_dump --format=custom --no-owner --no-privileges --data-only --schema=auth --file=/backup/auth.dump "$SUPABASE_DB_URL"
    psql -X -q -v ON_ERROR_STOP=1 -At -F "	" -f /counts.sql "$SUPABASE_DB_URL" > /backup/counts.tsv
  '
echo "Dumped: database.dump $(du -h "$out/database.dump" | cut -f1), auth.dump $(du -h "$out/auth.dump" | cut -f1), $(wc -l < "$out/counts.tsv") count lines"
