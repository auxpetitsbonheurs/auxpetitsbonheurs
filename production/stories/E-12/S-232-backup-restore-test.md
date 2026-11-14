# S-232: A backup is restored on a clean environment and verified
Status: in-progress
Epic: E-12-polish-test-launch
Spec: docs/product/prd.md#appendix-a-launch-test-checklist-traceability
Estimate: 3 pts
Owner: postgres-specialist, release-manager

## Story
As the Owner, I want proof that a backup can actually be restored, so that I can trust it when something goes wrong.

## Acceptance Criteria
- [x] AC1 (NFR-005): Given a real backup from S-231, when restored into a clean non-production database and storage, then all tables, row counts and photo objects match the source (counts compared and recorded).
- [ ] AC2 (NFR-005): Given the restored data, then a sample of 5 orders shows identical numbers, totals, statuses and event logs, and sequential order numbers continue without a gap or duplicate.
- [ ] AC3 (NFR-005): Given the restored app on staging, then an order can be placed and an admin can sign in.
- [x] AC4 (NFR-005, NFR-012): Given the steps, then they are written in the README "Restore a backup" section step by step and a second person (or the Owner) can follow them; time taken is recorded.
- [x] AC5 (NFR-005): Given a corrupt or missing backup file, then the restore stops with a clear error and does not touch production.
- [x] AC6 (NFR-005): Given the restore, then it never runs against the live production database without the Owner's explicit instruction.

## Tests
- AC1 → production/audits/backup-restore-2026.md
- AC2 → production/audits/backup-restore-2026.md
- AC3 → production/audits/backup-restore-2026.md
- AC4 → production/audits/backup-restore-2026.md
- AC5 → production/audits/backup-restore-2026.md
- AC6 → production/audits/backup-restore-2026.md

## Notes
- Appendix A row "Backup runs and can be restored" (NFR-005). Manual runbook execution; the report is the evidence.
- Dependencies (R9): S-231. Not yet done; expected.

## Launchprep notes (2026-11-14)
- backup-rehearsal.yml (read-only on staging) restored a staging backup into a clean Postgres 17 on the runner: every table, photo, account and the order counter matched (run 43498350025); a cut-off dump was refused. Runbook: docs/runbooks/restore.md. AC2 counts and continuity checked, field-by-field sample not printed (no PII in logs). AC3 needs a new Supabase project (Owner).
