---
name: ci-setup
description: "Sets up continuous integration (GitHub Actions by default): install with cache, lint, typecheck, unit and integration tests with service containers, build, Playwright on preview deploys, and dependency/secret scanning. Use when the project has code but no CI, when CI is slow or flaky, or before launch."
argument-hint: "[github | gitlab | other]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(ls *)
model: sonnet
---

# CI Setup

Designs a pipeline that matches the stack and the quality gates, shows it, and
writes `.github/workflows/ci.yml` (or the chosen CI's file) only after
approval. It never pushes, never adds secrets to the repo, and never disables
a failing check to get green.

## Inputs

- `project.yaml`: `stack.*` (language, package_manager, test_unit, test_e2e, database, cache_queue, hosting), `modes.rigor`
- `bash .claude/scripts/detect-stack.sh`: confirms the real tools and scripts
- `.claude/docs/stack-matrix.md`: lint, typecheck, test and build commands per stack
- `package.json` scripts / `Makefile` / `pyproject.toml` tasks
- Existing CI files (`.github/workflows/*`, `.gitlab-ci.yml`)

## Phases

### Phase 1: Read what exists

List existing workflows and what they do. If CI exists, the goal is to improve
it: never overwrite a workflow without showing a diff.

### Phase 2: Agree the jobs

Spawn `devops-lead` with the stack facts to draft the job graph. Default for
`standard` rigor:

1. **checks**: checkout → setup runtime (version from `.nvmrc`/`.node-version`/`.python-version`/`go.mod`) → install with cache and frozen lockfile (`pnpm install --frozen-lockfile`, `npm ci`, `uv sync --frozen`, `composer install`, `bundle install`) → lint → typecheck → format check.
2. **test**: unit + integration tests with service containers for Postgres/MySQL/MongoDB/Redis as `stack.database`/`stack.cache_queue` require; migrations applied to the CI database; coverage uploaded as an artifact.
3. **build**: production build; for frontends, fail on the bundle budget if a size check exists.
4. **e2e**: Playwright against the preview deployment URL (Vercel/Netlify/Cloudflare provide it via deployment events) or against a locally started production build; traces uploaded on failure only.
5. **security**: dependency audit (`pnpm audit --audit-level=high` or equivalent) and secret scan (gitleaks action).
6. **audits** (`full` rigor): Lighthouse CI against preview with budgets from `project.yaml`, axe in e2e.

Concurrency group per branch with `cancel-in-progress`, `permissions:` set to
least privilege (`contents: read`), pinned action versions, and a timeout per job.

Ask: "Which of these jobs do you want now?" (multi-select), and whether PRs
should be required to pass before merging (branch protection is set by the
user in GitHub settings; print the steps).

### Phase 3: Secrets and env

List every env var the jobs need (test DB URL, auth test secrets, preview URL)
and where the user sets them (repo Actions secrets / environment secrets). Use
dummy values for tests wherever possible. Never write a real value.

### Phase 4: Draft and approve

Show the full YAML. Ask "May I write this to `.github/workflows/ci.yml`?"
Optionally also `.github/workflows/lighthouse.yml` and `lighthouserc.json`.

### Phase 5: Verify

If `act` is installed, offer `act -j checks` locally. Otherwise tell the user
to push a branch and open a PR; the first run is the real test.

## Output

`.github/workflows/ci.yml` (and optional audit workflows / `lighthouserc.json`).

## Rigor

- `minimal`: checks + test.
- `standard`: + build, e2e on preview, security.
- `full`: + Lighthouse CI budgets, axe, coverage threshold, required status checks.

## Next step

`/deploy-setup` if deploys are not configured yet, otherwise `/launch-checklist`.
