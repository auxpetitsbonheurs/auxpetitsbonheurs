-- Rows per table (schemas public, drizzle, auth) and photo objects per Storage bucket, as
-- "name<TAB>count" lines, for the backup restore check (S-232). Counts only, no personal data.
-- Run on the source by scripts/backup-dump.sh; scripts/backup-verify.sh counts the restored
-- copy itself and checks the storage lines against the photo files in the archive.
select table_schema || '.' || table_name,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
from information_schema.tables
where table_schema in ('public', 'drizzle', 'auth') and table_type = 'BASE TABLE'
union all
select 'storage:' || b.id, (select count(*) from storage.objects o where o.bucket_id = b.id)::text
from storage.buckets b
order by 1;
