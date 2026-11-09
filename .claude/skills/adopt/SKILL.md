---
name: adopt
description: "Brings an existing website or codebase into the studio: detects the stack, proposes project.yaml values, maps existing docs and code, and proposes the stage. Use when the user has an existing site, repo or partial project and wants to use the studio on it (brownfield)."
argument-hint: "[path to code root, default: repo root]"
user-invocable: true
allowed-tools: Read, Glob, Grep, AskUserQuestion, Bash(bash .claude/scripts/detect-stack.sh*), Bash(bash .claude/scripts/project-state.sh*), Bash(bash .claude/scripts/config-set.sh *), Bash(bash .claude/scripts/set-stage.sh *), Bash(git log*), Bash(git remote*)
model: sonnet
---

# Adopt an existing project

Maps what already exists so the rest of the studio has something to build on.
It writes only `project.yaml` values (through `config-set.sh`, after an
explicit yes) and the stage. It never changes application code, never
installs anything, and never generates docs; `/reverse-document` does that.

## Inputs

- `bash .claude/scripts/detect-stack.sh` (frontend, backend, database, orm, hosting, test tools, package manager)
- `bash .claude/scripts/project-state.sh`
- Manifests: `package.json` (deps + scripts), `pyproject.toml`, `go.mod`, `composer.json`, `Gemfile`, lockfiles
- Framework config (`next.config.*`, `nuxt.config.*`, `astro.config.*`, `svelte.config.*`, `angular.json`), `compose.yaml`, `Dockerfile`, `.github/workflows/`, host config (`vercel.json`, `netlify.toml`, `wrangler.toml`, `fly.toml`, `render.yaml`)
- `.claude/docs/stack-matrix.md` for value names and specialists
- `git log --oneline -20` for activity
- Optional argument: code root (monorepo app path such as `apps/web`)

## Phases

### Phase 1: Detect

Run both helpers. Then confirm the important guesses by reading the manifest
and config files yourself: a helper guess is an observation, not a fact. For a
monorepo (`pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `apps/*`), list the
apps and ask which one the studio should treat as the code root.

### Phase 2: Map what exists

Build a short inventory:

| Area | Look for |
|---|---|
| Routes / pages | `app/`, `pages/`, `src/routes/`, `routes/` (count, list top-level sections) |
| API | route handlers, `server/api`, controllers, OpenAPI files |
| Data | `prisma/schema.prisma`, `drizzle/`, `migrations/`, models |
| Auth / payments / CMS / AI / email | SDK imports and env var names in `.env.example` (never open `.env`) |
| Tests | runner config, test file count, e2e folder |
| CI / deploy | workflow files, host config |
| Docs | README, `docs/`, ADRs, any PRD-like text |
| Agent instructions | existing `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`: keep them; propose merging their rules into `CLAUDE.md` or importing them (`@AGENTS.md`), never overwrite |

### Phase 3: Propose project.yaml

Show a table of proposed values: `project.name`, `project.type`, every
`stack.*` key detected, `paths.code_root`, and `specialists:` (from
`stack-matrix.md`). Mark each **detected** or **guessed**. Ask the user to
correct anything wrong, then: "May I save these to `project.yaml`?"

On yes, run `config-set.sh` per key. `specialists` is a list: write it with
`config-set.sh specialists=[a, b, c]` (inline list).

### Phase 4: Propose the stage

| Evidence | Proposed stage |
|---|---|
| Little code, no PRD | `discovery` |
| Working code, users not yet live | `build` |
| Deployed to a production domain with users | `grow` (or `launch` if a release is imminent) |

Ask the user to confirm, then run `set-stage.sh <stage>`. Ask about rigor and
automation only if `modes.rigor` / `modes.automation` are unset (same options
as `/start` Phases 4–5).

### Phase 5: Report gaps

List the studio artifacts missing for the chosen stage (see
`.claude/docs/gates.md`), most important first, and the template-remote
warning if `origin_url` still points at the studio template.

## Output

`project.yaml` values and `project.stage` only.

## Next step

`/reverse-document` to generate the PRD, specs, architecture and data model
from the code. Then `/help`.
