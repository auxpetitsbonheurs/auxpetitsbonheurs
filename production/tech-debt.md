
## From review of S-001/S-003/S-004/S-010 (2026-11-10)
- [x] DONE 2026-11-10 (reset password + confirm email via Auth Admin API before reuse; tests in seed-owner.server.test.ts). TD: seed-owner reuses any existing auth.users row with the owner email without resetting password / checking email_confirmed_at (src/app/server/services/seed-owner.server.ts:80-83). Fix before running seed on production. Medium.
- TD: db.server.ts closes the client when the Response returns; streamed loader promises would query after close. Add a guard/test before any streaming loader. Medium.
- TD: threat-model G-19 — add gitleaks + client-bundle secret-name check to CI. Medium.
- Low: `.catch` on waitUntil(close()); refuse APP_ENV=development on production Worker; CI cancel-in-progress also cancels main runs.

## From review of S-005..S-008 (2026-11-10)
- TD: root.tsx ErrorBoundary/Layout fall back to lang="en" + empty messages when root loader fails; /fr error page can show raw keys. Medium.
- TD: wrangler.jsonc top-level env is APP_ENV=development; a bare `wrangler deploy` without --env runs lax. Guard in S-002. Medium.
- TD: add `Vary: Cookie, Accept-Language` on locale redirects before any cache/CDN. Low.
