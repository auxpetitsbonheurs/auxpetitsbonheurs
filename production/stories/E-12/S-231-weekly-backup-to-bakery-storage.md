# S-231: Weekly automatic backups of all data and photos to bakery-owned storage
Status: in-progress
Epic: E-12-polish-test-launch
Spec: docs/product/prd.md#6-non-functional-requirements
Estimate: 3 pts
Owner: hosting-platform-specialist, postgres-specialist

## Story
As the Owner, I want automatic backups kept in my own storage, so that an outage or mistake never loses my orders or photos.

## Acceptance Criteria
- [ ] AC1 (NFR-005): Given the schedule, then a backup of the database and of all photos runs weekly without manual action and writes to storage under the bakery's own account.
- [x] AC2 (NFR-005): Given a run, then the output is dated, its size and object count are logged, and old backups are pruned by a stated retention (e.g. keep the last 8).
- [ ] AC3 (NFR-005): Given a backup fails, then the Owner and builder get an alert (email) and the failure is recorded in Sentry; the next run is not skipped.
- [ ] AC4 (NFR-005, NFR-009): Given the free-plan limits, then backup size stays within the storage quota and no paid item is introduced; the projected size is documented.
- [x] AC5 (NFR-005, NFR-004): Given backup storage access, then credentials live only in the bakery's accounts, the bucket is private, and backups hold personal data under the same retention note.
- [ ] AC6 (NFR-005): Given an empty database (day one), then the backup still runs and produces a valid empty set.
- [ ] AC7 (NFR-005): Given the keep-alive check, then the free-plan database does not pause for inactivity (checked over 7 days).

## Tests
- AC1 → production/audits/backup-2026.md
- AC2 → src/app/jobs/backup.test.ts
- AC3 → src/app/jobs/backup.test.ts
- AC4 → production/audits/backup-2026.md
- AC5 → production/audits/backup-2026.md
- AC6 → src/app/jobs/backup.test.ts
- AC7 → production/audits/backup-2026.md

## Notes
- Extends the E-01 backup job skeleton. Mechanism (platform backup vs scheduled export) is a technical-director/ADR choice, not fixed here. Running against bakery accounts needs the Owner's credentials, set by the Owner.
- Dependencies (R9): E-01 (backup skeleton, keepAlive). Not yet done; expected.

## Launchprep notes (2026-11-14)
- backup.yml now dumps with scripts/backup-dump.sh (app tables, Auth rows, counts; a full Supabase dump does not restore into plain Postgres) and records sizes and photo counts. First real run needs the Owner's secrets (steps in production/audits/backup-restore-2026.md). AC3 Sentry part not built (no Sentry reporting yet).
