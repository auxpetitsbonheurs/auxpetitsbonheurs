# S-020: Weekly backup skeleton, keep-alive and health check
Status: ready
Epic: E-01-walking-skeleton
Spec: docs/architecture/architecture.md#backups--restore-nfr-005
Estimate: 5 pts
Owner: devops-lead, hosting-platform-specialist, postgres-specialist, observability-engineer

## Story
As the bakery owner, I want the free database kept awake and a weekly backup running to storage I own, so that an order is never lost and the site never pauses by itself.

## Acceptance Criteria
- [ ] AC1 (NFR-005): Given the database and Auth are reachable, when `GET /healthz`, then `200 { ok: true, db: "ok", auth: "ok" }` with `Cache-Control: no-store`.
- [ ] AC2 (NFR-005): Given the database is down or Auth does not answer within 5 s, when `GET /healthz`, then `503` with the failing part named (`db` or `auth` = "fail"); the body never includes secrets, versions or error text.
- [ ] AC3 (NFR-005): Given the hourly scheduled event, when `dispatch(now, env, ctx)` runs, then `keepAlive` runs `select 1` and `GET {SUPABASE_URL}/auth/v1/health` with a 5 s timeout and returns `{ job: "keepAlive", ran: true, processed: 1 }`.
- [ ] AC4 (NFR-005): Given one job throws, when the dispatcher runs, then the other jobs still run, the failure is returned as `{ ran: false, error }` and logged as a structured line; the dispatcher never throws.
- [ ] AC5 (NFR-005): Given `.github/workflows/backup.yml`, then it runs weekly on Sunday 02:00 Mauritius time (cron `0 22 * * 6` UTC) and by manual dispatch, and its steps are: `pg_dump --format=custom`, copy both Storage buckets with `rclone`, encrypt with `age`, upload to the bakery's Google Drive, keep the latest 8.
- [ ] AC6 (NFR-005): Given a required secret is missing, when the workflow runs, then it fails at once naming the secret (never a silent success), and a failure step notifies the bakery address; secrets are referenced by name only and every name is listed in the README "Backups" section.
- [ ] AC7 (NFR-012): Given the README "Backups" section, then it explains the weekly schedule, the accounts involved, that restore is tested in E-12 (`docs/runbooks/restore.md` is written then), and the one-week worst-case loss accepted for v1.

## Tests
- AC1 → src/app/routes/hooks/healthz.test.ts
- AC2 → src/app/routes/hooks/healthz.test.ts
- AC3 → src/app/jobs/keep-alive.test.ts
- AC4 → src/app/jobs/dispatch.test.ts
- AC5 → src/app/lib/backup-workflow.test.ts (parses the workflow text: cron, steps, retention)
- AC6 → src/app/lib/backup-workflow.test.ts and src/app/lib/readme.test.ts (secret names match)
- AC7 → src/app/lib/readme.test.ts

## Notes
- Depends on: S-002, S-003, S-004.
- Contract: `/healthz` webhook/resource row and the `keepAlive` job row (contracts.md). Other jobs (retryEmails, expireQuotes...) are added by later epics to the same dispatcher.
- Running the workflow needs the bakery's Google and Supabase credentials, so those steps are documented only; the first real run is the user's action. Sentry Cron Monitor for `keepAlive` is wired in E-12.
- Scheduled handler is `workers/app.ts` `scheduled` -> `app/jobs/dispatch.ts` (architecture "Scheduled jobs").
