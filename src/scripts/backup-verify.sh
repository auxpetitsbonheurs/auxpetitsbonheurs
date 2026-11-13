#!/usr/bin/env bash
# Restores a decrypted backup folder into a CLEAN, throwaway Postgres and checks it (S-232).
#
#   1. The archive is readable (a corrupt or missing file stops here, before anything is touched).
#   2. The target is empty and is not a Supabase database (never the live one, AC5, AC6).
#   3. database.dump is restored; rows per table must equal counts.tsv (taken at dump time).
#   4. Photo files per bucket in storage/ must equal the storage objects counted at dump time.
#   5. auth.dump holds as many sign-in accounts (auth.users rows) as counted at dump time.
#   6. Order numbers: no duplicate, and the next number (counter) follows the highest one.
# Prints a table of the comparisons; exits 1 on any mismatch. Counts only, no personal data.
#
# The Postgres 17 tools come from the postgres:17 image (docker, host network), so this runs the
# same on a laptop and on a GitHub runner.
# Usage: RESTORE_DB_URL=postgres://postgres:postgres@127.0.0.1:5433/restore scripts/backup-verify.sh <backup-dir>
set -euo pipefail

dir=${1:?usage: backup-verify.sh <backup-dir>}
: "${RESTORE_DB_URL:?RESTORE_DB_URL (the clean throwaway database) is not set}"
dir=$(cd "$dir" && pwd)
fail() { echo "::error::$*" >&2; exit 1; }

case "$RESTORE_DB_URL" in
  *supabase.co* | *supabase.com* | *pooler.supabase*) fail "RESTORE_DB_URL points at Supabase. Restore checks only run against a throwaway local database." ;;
esac
for f in database.dump auth.dump counts.tsv; do [ -s "$dir/$f" ] || fail "Backup file $f is missing or empty in $dir: nothing was restored."; done

pg() { docker run --rm -i --network host -e RESTORE_DB_URL -v "$dir:/backup:ro" postgres:17 "$@"; }
pg pg_restore --list /backup/database.dump > /dev/null 2>&1 || fail "database.dump is not a readable backup (corrupt or wrong file): nothing was restored."
pg pg_restore --list /backup/auth.dump > /dev/null 2>&1 || fail "auth.dump is not a readable backup (corrupt or wrong file): nothing was restored."

existing=$(pg psql -X -At -v ON_ERROR_STOP=1 "$RESTORE_DB_URL" -c "select count(*) from information_schema.tables where table_schema in ('public','drizzle')")
[ "$existing" = 0 ] || fail "The target database already has $existing tables. Use a new, empty database."

started=$(date +%s)
# The dump creates schema public itself; a new database already has an empty one (no CASCADE:
# this cannot remove anything).
pg psql -X -q -v ON_ERROR_STOP=1 "$RESTORE_DB_URL" -c "drop schema if exists public"
# App tables point at Supabase's auth.users (admins, customers). A plain Postgres has none, so a
# minimal auth.users(id) is made from the account ids in auth.dump: every foreign key is then
# checked against the accounts the backup really holds. (A new Supabase project has the full
# table: README "Restore a backup" restores auth.dump there first.)
auth_copy=$(pg pg_restore --data-only --schema=auth --table=users --file=- /backup/auth.dump)
auth_ids=$(printf '%s\n' "$auth_copy" | awk -F'\t' '
  /^COPY auth\.users \(/ { on = 1; gsub(/^COPY auth\.users \(|\) FROM stdin;$/, ""); n = split($0, cols, ", "); for (k = 1; k <= n; k++) if (cols[k] == "id") col = k; next }
  on && /^\\\.$/ { on = 0 } on && col { print $col }')
{ echo "create schema auth; create table auth.users (id uuid primary key); copy auth.users (id) from stdin;"; [ -z "$auth_ids" ] || printf '%s\n' "$auth_ids"; printf '\\.\n'; } \
  | pg psql -X -q -v ON_ERROR_STOP=1 "$RESTORE_DB_URL"
pg pg_restore --no-owner --no-privileges --exit-on-error --dbname "$RESTORE_DB_URL" /backup/database.dump
echo "Restored database.dump in $(( $(date +%s) - started )) s"

restored=$(pg psql -X -At -F "	" -v ON_ERROR_STOP=1 "$RESTORE_DB_URL" -c "
  select table_schema || '.' || table_name,
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
  from information_schema.tables where table_schema in ('public', 'drizzle') and table_type = 'BASE TABLE' order by 1")

bad=0
printf '| What | At backup | Restored | Match |\n|---|---|---|---|\n'
row() { local ok=yes; [ "$2" = "$3" ] || { ok=NO; bad=1; }; printf '| %s | %s | %s | %s |\n' "$1" "$2" "$3" "$ok"; }
while IFS=$'\t' read -r name count; do
  case "$name" in
    public.* | drizzle.*) row "$name" "$count" "$(printf '%s\n' "$restored" | awk -F'\t' -v n="$name" '$1 == n { print $2 }')" ;;
    storage:*)
      bucket=${name#storage:}
      files=0
      if [ -d "$dir/storage/$bucket" ]; then files=$(find "$dir/storage/$bucket" -type f | wc -l | tr -d ' '); fi
      row "photos in $bucket" "$count" "$files" ;;
  esac
done < "$dir/counts.tsv"
# Tables restored but absent from counts.tsv (or the reverse) are a mismatch too.
src_tables=$(awk -F'\t' '$1 ~ /^(public|drizzle)\./ { print $1 }' "$dir/counts.tsv" | sort)
dst_tables=$(printf '%s\n' "$restored" | cut -f1 | sort)
[ "$src_tables" = "$dst_tables" ] || { echo "Table lists differ:"; diff <(echo "$src_tables") <(echo "$dst_tables") || :; bad=1; }

auth_src=$(awk -F'\t' '$1 == "auth.users" { print $2 }' "$dir/counts.tsv")
auth_rows=$(printf '%s\n' "$auth_ids" | grep -c . || :)
row "sign-in accounts (auth.users)" "${auth_src:-0}" "$auth_rows"

orders=$(pg psql -X -At -F "	" -v ON_ERROR_STOP=1 "$RESTORE_DB_URL" -c "
  select count(*), count(distinct number), coalesce(max(number), 0),
         (select value from counter where name = 'order_number') from orders")
IFS=$'\t' read -r total distinct highest next <<< "$orders"
row "order numbers without duplicate" "$total" "$distinct"
row "order counter follows the highest number" "$highest" "$next"

[ "$bad" = 0 ] || fail "The restored copy does not match the backup (see the table)."
echo "Restore check passed."
