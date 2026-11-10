# S-010: Seed the first Owner account
Status: review
Epic: E-01-walking-skeleton
Spec: docs/specs/features/admin-access-team.md#data-model-changes
Estimate: 2 pts
Owner: auth-specialist, postgres-specialist

## Story
As the bakery's developer, I want a safe one-off command that creates the Owner, so that Sabera can sign in on the first day without any manual database work.

## Acceptance Criteria
- [x] AC1 (FR-040): Given valid `OWNER_EMAIL`, `OWNER_NAME` and `OWNER_PASSWORD` (10 or more characters), when `npm run seed:owner` runs, then a confirmed Supabase Auth user and an `admin` row with role `owner`, `active = true` and locale `en` exist.
- [x] AC2 (FR-040): Given the Owner already exists, when the command runs again, then nothing is duplicated, no password is changed and it exits successfully with "Owner already exists".
- [x] AC3 (FR-039): Given the email already belongs to a customer account, when the command runs, then it refuses, creates no admin row and explains that an auth user is either an admin or a customer.
- [x] AC4 (NFR-003): Given a missing variable, an invalid email or a password under 10 characters, when the command runs, then it exits non-zero before any network call and names the variable, never its value.
- [x] AC5 (NFR-003): Given any outcome, then the command output and logs never contain the password or the service-role key.
- [x] AC6 (NFR-012): Given `APP_ENV=production`, when the command runs without `--confirm-production`, then it refuses; the README "Secrets" section documents running it for staging and production as the user's action.

## Tests
- AC1 → src/app/server/services/seed-owner.server.test.ts
- AC2 → src/app/server/services/seed-owner.server.test.ts
- AC3 → src/app/server/services/seed-owner.server.test.ts
- AC4 → src/app/server/services/seed-owner.server.test.ts
- AC5 → src/app/server/services/seed-owner.server.test.ts (captures log output)
- AC6 → src/app/server/services/seed-owner.server.test.ts + src/app/lib/readme.test.ts (Secrets runbook)

## Notes
- Depends on: S-003, S-004.
- Core logic is a function `seedOwner(deps)` so tests inject a fake Auth Admin API and a Postgres container; the script `src/scripts/seed-owner.ts` is a thin wrapper.
- The Owner's real email and password are supplied by the user at run time; never committed.
- Decision: tests use in-process PGlite with migrations applied (stub `auth.users`) and a fake Auth Admin API that writes into it; no Supabase or network call. `runSeedOwner` takes a `connect` factory called only after validation, which proves "before any network call".
- Decision: the auth user is looked up by email in `auth.users` through the DB (the Admin API has no get-by-email); `authUsers` declares `email` for this (not managed by drizzle-kit; `generate` reports no changes).
- Decision (revised 2026-11-10, review follow-up): an auth user with no admin row and no customer link (an interrupted run) is reused only after the Auth Admin API resets its password to OWNER_PASSWORD and confirms its email (`updateUserById`), so a prior holder of the old password cannot become Owner; if the reset fails, no admin row is written; an email that is already an Admin (not Owner) is refused with "promote in Team".
- Decision: a guest `customer` row with the same email also counts as a customer account (refused).
- Decision: every log line is redacted of OWNER_PASSWORD, the service-role key and DATABASE_URL, even if an upstream error echoes them.
- Decision: the CLI runs with `tsx` (now an explicit pinned devDependency; was already in the lockfile via drizzle-kit) because the schema uses extensionless imports Node's type stripping cannot resolve.
- Not run against any real project: seeding staging/production is the user's action (README "Secrets").
