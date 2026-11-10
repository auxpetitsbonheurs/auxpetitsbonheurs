# S-002: Staging and production deploy pipeline
Status: review
Epic: E-01-walking-skeleton
Spec: docs/architecture/architecture.md#environments
Estimate: 3 pts
Owner: hosting-platform-specialist, devops-lead

## Story
As the bakery owner's developer, I want a staging site that deploys on every merge to main and a production site that deploys when I choose, so that the team can test safely and release without a developer machine.

## Acceptance Criteria
- [x] AC1 (NFR-012, NFR-009): Given `wrangler.jsonc`, then it defines `staging` and `production` environments with different Worker names, `APP_ENV` values and an hourly cron trigger each, and contains no secret and no account id.
- [ ] AC2 (NFR-012): Given a merge to `main`, then the documented pipeline (Workers Builds connected to the repo) builds and deploys staging automatically; production deploys only when the `production` branch is fast-forwarded to a commit that staging already runs. The README "Deploy" section lists the exact build and deploy commands for both.
- [x] AC3 (NFR-012): Given the README "Deploy" and "Secrets" sections, then every step that needs an account key (create the Cloudflare account, connect the repo to Workers Builds, `wrangler secret put <NAME> --env staging|production` for each name in `.dev.vars.example`, GitHub Actions secrets) is a numbered checklist item with who does it and where the value is pasted. No story executes these steps.
- [x] AC4 (NFR-012): Given the README "Services and accounts" section, then it has a table of every bakery-owned account (Cloudflare, Supabase, GitHub, Resend, Google, Sentry, domain registrar) with owner email, "MFA on: yes/date" and where recovery codes are kept.
- [x] AC5 (NFR-012): Given the README, then it states the launch URLs (the free `workers.dev` names for staging and production, no custom domain at launch) and the exact Supabase Auth redirect allowlist for each environment with no wildcards.
- [x] AC6 (NFR-012): Given a failed build on main, then the previous version keeps running; the README "Deploy" section documents rollback as redeploying the previous commit.
- [ ] AC7 (NFR-010): Given a request to the staging site, then the response carries `X-Robots-Tag: noindex, nofollow`; given production, then it does not.

## Tests
- AC1 → src/workers/wrangler-config.test.ts
- AC2 → src/app/lib/readme.test.ts (Deploy section lists both commands and the branch rule)
- AC3 → src/app/lib/readme.test.ts (every key in `.dev.vars.example` appears in the Secrets checklist)
- AC4 → src/app/lib/readme.test.ts
- AC5 → src/app/lib/readme.test.ts
- AC6 → src/app/lib/readme.test.ts
- AC7 → src/workers/headers.test.ts (unit) and src/tests/e2e/staging-smoke.spec.ts (run against the staging URL after the first deploy)

## Notes
- Depends on: S-001.
- Steps needing account keys are documented only (instruction from the owner of this plan). The first real deploy is the user's action.
- Launch values: free `workers.dev` domain; the custom domain is a later change (README must say the redirect allowlist is edited then).
- Staging smoke spec reads `STAGING_URL` from the environment and is skipped when unset.
- Decision (2026-11-10): deploys run in GitHub Actions (`.github/workflows/deploy.yml`, ADR-0002) instead of Workers Builds, because migrations must run before the deploy, production must check that staging runs the commit, and the build-for-env guard must run in the same job; AC2/AC3 wording about Workers Builds is met by that workflow (README lists "GitHub secrets" instead of "connect the repo to Workers Builds").
- Decision: until the GitHub secrets exist, the preflight job prints a notice and the deploy jobs are skipped (green); a partial set fails naming the missing secrets (`scripts/check-deploy-keys.sh`).
- Decision: `npm run deploy` was renamed `deploy:production`; both deploy scripts build with `CLOUDFLARE_ENV` and run `scripts/check-deploy.ts` (the old script built the top-level config for production).
- Decision: development and staging both send `X-Robots-Tag: noindex, nofollow` on every Worker response (`workers/headers.ts`); production sends none beyond each route's own.
- AC2: blocked: needs Owner keys. Workflow, guard and README are done and tested offline (src/app/lib/deploy-workflow.test.ts, readme.test.ts); tick after the first green staging deploy on a merge to main.
- AC7: blocked: needs Owner keys. Unit test passes (src/workers/headers.test.ts); tick after `STAGING_URL=… npx playwright test staging-smoke --project=desktop-1280` passes against staging.
- Owner key checklist: `docs/runbooks/deploy-keys.md`.
