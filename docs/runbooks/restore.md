# Restore a backup (S-232, NFR-005)

Two jobs, kept apart on purpose:

- **Check a backup** (safe, any time): restore it into a throwaway database on a computer and
  compare every count. Touches nothing real.
- **Restore for real** (only after an outage or a mistake, and only on the Owner's instruction):
  bring the data back into a **new** Supabase project and point the site at it. Never restore over
  the live database: if the live database is still working, it is the better copy.

You need: the bakery's Google Drive (backups), the bakery password manager (the `age` key file),
a computer with Docker and `age` installed, and this repository. Allow 1 to 2 hours for a real
restore, most of it waiting; checking a backup takes about 10 minutes.

## What a backup holds

One file a week, `apb-backup-<date>.tar.age` in the bakery's Drive backup folder (latest 8 kept),
encrypted with `age`. Inside:

| File | What |
|---|---|
| `database.dump` | Every order, customer, product, setting and log (schemas `public` and `drizzle`) |
| `auth.dump` | Sign-in accounts of admins and customers (Supabase Auth rows) |
| `counts.tsv` | Rows per table and photos per bucket when the backup was made (for the check) |
| `storage/public-images/` | Product, gallery and page photos |
| `storage/request-photos/` | Photos customers attached to custom-cake requests (private) |

## 1. Get and open a backup

1. Google Drive → the backup folder → right-click the newest `apb-backup-<date>.tar.age` → Download.
2. Password manager → "Backup age key" → save the key text as `backup-key.txt` next to the download
   (delete this file when done).
3. In a terminal, in that folder:

   ```sh
   age --decrypt --identity backup-key.txt --output backup.tar apb-backup-<date>.tar.age
   mkdir backup && tar -xf backup.tar -C backup
   ```

   A wrong key or a damaged file stops here with an `age` error: try the previous week's file.

## 2. Check a backup (recommended monthly, and before any real restore)

```sh
docker run -d --name restore-check -p 127.0.0.1:5433:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=restore postgres:17
sleep 5
RESTORE_DB_URL=postgres://postgres:postgres@127.0.0.1:5433/restore <repo>/src/scripts/backup-verify.sh backup
docker rm -f restore-check
```

It prints a table (backup count, restored count, match) for every table, the photos in each
bucket, the sign-in accounts and the order numbers, and ends with "Restore check passed." It
refuses a Supabase address, a non-empty database, and a damaged or missing file, before touching
anything. The same check runs on staging data with GitHub → Actions → **backup-rehearsal** → Run
workflow (read-only on staging; the result is the run's summary).

## 3. Restore for real (Owner's instruction only)

`<new>` is the new project's Session pooler connection string (Supabase → the new project → Connect →
Session pooler; it works over IPv4).

1. Supabase → New project → name `apb-production-restored`, region **Frankfurt (eu-central-1)**,
   a new strong database password (save it in the password manager).
2. Sign-in accounts first (the new project already has the Auth tables):

   ```sh
   docker run --rm -v "$PWD/backup:/backup:ro" postgres:17 \
     pg_restore --data-only --no-owner --no-privileges --dbname '<new>' /backup/auth.dump
   ```

   If this fails because Supabase changed its Auth tables since the backup, skip it: after step 7 the
   Owner re-creates her account (README "Secrets" step 6, make-owner), invites helpers again, and
   customers with accounts use "Forgot password". Orders are not affected.
3. Orders, menu and settings:

   ```sh
   docker run --rm -v "$PWD/backup:/backup:ro" postgres:17 \
     pg_restore --no-owner --no-privileges --dbname '<new>' /backup/database.dump
   ```

   One error, `schema "public" already exists`, is expected and harmless. Any other error: stop and
   ask the builder.
4. Photos: Supabase → the new project → Storage → New bucket `public-images` (Public bucket **on**),
   then New bucket `request-photos` (Public **off**). Storage → S3 Connection → New access key. Then:

   ```sh
   export RCLONE_CONFIG_NEW_TYPE=s3 RCLONE_CONFIG_NEW_PROVIDER=Other \
     RCLONE_CONFIG_NEW_ENDPOINT='<S3 endpoint>' RCLONE_CONFIG_NEW_REGION='<region>' \
     RCLONE_CONFIG_NEW_ACCESS_KEY_ID='<key id>' RCLONE_CONFIG_NEW_SECRET_ACCESS_KEY='<secret>'
   rclone copy backup/storage/public-images new:public-images
   rclone copy backup/storage/request-photos new:request-photos
   ```
5. Point the live Worker at the new project: Cloudflare → Workers & Pages → `auxpetitsbonheurs` →
   Settings → Variables and Secrets → edit `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` with the new project's values → Deploy.
   (docs/runbooks/deploy-keys.md section 2 says where each value is.)
6. New project → Authentication → URL Configuration and Hooks: the same values as the old project
   (README "Supabase Auth redirect allowlist", deploy-keys.md section 3), then a new hook secret into
   the Worker's `SUPABASE_AUTH_HOOK_SECRET`.
7. GitHub → Settings → Secrets and variables → Actions: update `PRODUCTION_DATABASE_URL` and the
   backup secrets (`SUPABASE_DB_URL`, `SUPABASE_S3_*`) to the new project.
8. Check: `https://<site>/healthz` shows `"ok":true`; the Owner signs in to the admin app; the newest
   order from the backup is there with its number; place a test order (it gets the next number);
   cancel it from its tracking page.
9. Write down the date, the backup used and how long it took in `production/incidents/`.
10. Delete `backup/`, `backup.tar` and `backup-key.txt` from the computer.

Data entered after the backup's date is not in it (worst case one week, accepted for v1): look for
those orders in the bakery's order emails and re-enter them as manual orders.

## Evidence

The restore check on staging data is recorded in `production/audits/backup-restore-2026.md`.
