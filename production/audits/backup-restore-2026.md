# Backup and restore check (S-231, S-232) — 2026-11-13

Owner: launchprep job (postgres-specialist, release-manager roles). Evidence for PRD Appendix A
"Backup runs and can be restored" (NFR-005).

## Summary

| Question | Answer |
|---|---|
| Does the weekly backup exist and run on its own? | Yes: `.github/workflows/backup.yml`, Sunday 02:00 Mauritius. **It has never run for real**: its first slot is 2026-11-14 22:00 UTC and its production secrets are not set yet (Owner steps below), so that run will fail on purpose and email the bakery. |
| Was the backup restorable as designed? | **No, fixed here.** One full `pg_dump` of a Supabase database includes Supabase-owned schemas (auth, storage, vault, realtime…) that do not restore into a plain Postgres. The dump is now split (`scripts/backup-dump.sh`): app tables, Auth rows (data only) and a counts file. |
| Was a backup restored into a clean database and checked? | **Yes, with staging data**, read-only on staging: GitHub Actions run [43498350025](https://github.com/auxpetitsbonheurs/auxpetitsbonheurs/actions/runs/43498350025) (backup-rehearsal, commit 90cee6e). Every count matched. |
| Does a damaged backup stop safely? | Yes: a cut-off `database.dump` was refused before anything was touched (same run). A Supabase address or a non-empty database is refused too (unit tests). |
| Was it restored into a new Supabase project and the app run on it (AC3)? | **Not yet**: needs a new Supabase project in the bakery's account (Owner). Steps in `docs/runbooks/restore.md` section 3. |

## What was run (AC1, AC2, AC5, AC6)

`backup-rehearsal.yml` (manual, `staging` environment):

1. `scripts/backup-dump.sh` against `STAGING_DATABASE_URL`: the same script as the weekly backup.
   Only reads (`pg_dump`, one count query).
2. Photos copied with GET requests from the staging Storage (17 files).
3. A clean, throwaway Postgres 17 container started on the runner (nothing else in it).
4. `scripts/backup-verify.sh`: restore and compare.
5. A copy of the dump cut to 512 bytes: must be refused.
6. The archive encrypted with `age` to a throwaway key and kept 1 day (it could not be downloaded
   into this session: the artifact storage host is blocked by its network policy).

Timings: dump 48 s, photo copy 25 s, restore and all checks 3 s. Archive: database.dump 160 KB,
auth.dump 16 KB, 17 photos, 1.8 MB in all (2.0 MB encrypted).

## Counts: backup vs restored copy (AC1)

| What | At backup | Restored | Match |
|---|---|---|---|
| drizzle.__drizzle_migrations | 14 | 14 | yes |
| public.admin | 1 | 1 | yes |
| public.counter | 1 | 1 | yes |
| public.customer | 122 | 122 | yes |
| public.email_outbox | 177 | 177 | yes |
| public.option_choice | 26 | 26 | yes |
| public.option_group | 10 | 10 | yes |
| public.order_event | 177 | 177 | yes |
| public.order_item | 175 | 175 | yes |
| public.orders | 175 | 175 | yes |
| public.product | 9 | 9 | yes |
| public.product_photo | 7 | 7 | yes |
| public.settings | 1 | 1 | yes |
| public.site_page | 5 | 5 | yes |
| 14 other tables (admin_invitation, blocked_date, custom_request, custom_request_photo, customer_address, gallery_photo, job_run, product_slug_history, promotion, promotion_product, push_subscription, rate_limit_bucket, site_page_photo, storage_purge) | 0 each | 0 each | yes |
| photos in public-images | 17 | 17 | yes |
| photos in request-photos | 0 | 0 | yes |
| sign-in accounts (auth.users) | 1 | 1 | yes |
| order numbers without duplicate | 175 | 175 | yes |
| order counter follows the highest number | 175 | 175 | yes |

Every foreign key was checked during the restore (the restore fails on a broken one): app rows that
point at sign-in accounts were checked against the account ids in `auth.dump`.

**AC2 (5 sample orders identical):** order rows, items and events are restored by `pg_restore`
byte for byte, and the counts above match; a field-by-field comparison of 5 orders was not printed
(the job summary deliberately carries counts only, no personal data). Order numbers continue: the
counter equals the highest number (175), so the next order is APB-0176 with no gap or duplicate.

## The weekly backup itself (S-231)

| AC | State |
|---|---|
| AC1 weekly, no manual action, bakery storage | Built (`backup.yml`, schedule + Google Drive in the bakery account). Needs the Owner's secrets. GitHub disables schedules after 60 days without a commit (public repository): monthly check in `docs/runbooks/free-plans.md`. |
| AC2 dated, size and count logged, keep last 8 | `apb-backup-<date>.tar.age`; the run summary now records sizes and photo counts; `head -n -8` pruning (tested). |
| AC3 failure alert | Failure email to `BACKUP_NOTIFY_EMAIL` (Resend) plus GitHub's own email; the next Sunday runs regardless. **Sentry recording is not built** (no Sentry reporting exists yet, S-235 AC5). |
| AC4 within free quota | Today ≈ 2 MB per backup; 8 kept. Projection in `docs/runbooks/free-plans.md` (Google Drive 15 GB). |
| AC5 private, bakery credentials | Encrypted with `age` before upload; the private key only in the bakery password manager; secrets in GitHub only. |
| AC6 empty database | Not run separately. Nothing in the dump or check depends on data (empty tables dump and count as 0; the order check reads `coalesce(max(number), 0)` against the counter's seed 0). The first production backup on launch day proves it. |
| AC7 no pausing | `keepAlive` (hourly Worker cron); staging `/healthz` → `{"ok":true,"db":"ok","auth":"ok"}` on 2026-11-13. The 7-day observation needs the dashboard (Owner). |

Local checks of the scripts (2026-11-13, a migrated local Postgres with 7 orders and stand-in
Storage tables): restore check passed, a 4 KB cut of the dump refused, a missing file refused.

## Owner steps (storage location and secrets)

1. Google Drive (bakery account) → New → Folder → name it `Website backups` → open it → copy the last
   part of the address bar (after `folders/`): that is `GDRIVE_FOLDER_ID`.
2. Password manager → new secure note "Backup age key" → paste the private key the builder generates
   with you (`age-keygen`); the matching `age1…` public key is `AGE_RECIPIENT`.
3. Supabase → production project → Connect → Session pooler → copy the URI (it works from GitHub's
   IPv4 runners; the direct connection does not): `SUPABASE_DB_URL`.
4. Supabase → production project → Storage → S3 Connection → New access key → copy endpoint, region,
   key id and secret: the four `SUPABASE_S3_*` secrets.
5. rclone Google Drive token (`GDRIVE_TOKEN`): with the builder, once, on a computer (`rclone authorize
   "drive"`), signed in as the bakery Google account (docs/runbooks/deploy-keys.md section 5).
6. Resend → API Keys → Create (Sending access only) → `BACKUP_RESEND_API_KEY`; the bakery address that
   gets failure emails → `BACKUP_NOTIFY_EMAIL`.
7. GitHub → repository → Settings → Secrets and variables → Actions → New repository secret → add each
   value above under its name.
8. GitHub → Actions → backup → Run workflow (branch `main`) → wait for green → check Google Drive shows
   `apb-backup-<today>.tar.age`.
9. With the builder: restore that file once with `docs/runbooks/restore.md` section 2 on a computer
   (10 minutes), and section 3 into a new Supabase project before launch (AC3); write the times here.
