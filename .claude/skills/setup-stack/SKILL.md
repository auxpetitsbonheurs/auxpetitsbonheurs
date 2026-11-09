---
name: setup-stack
description: "Chooses the project's technology stack with the technical director, records it in project.yaml and ADR-0001, selects the stack specialist agents, and (after a yes) runs the scaffolders. Use when the stack is not yet chosen, at the start of the Design stage, or when the user wants to change a core technology."
argument-hint: "[--change <key>]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(pnpm create *), Bash(pnpm dlx *), Bash(npm create *), Bash(npx create-*), Bash(uv init *), Bash(uv add *), Bash(composer create-project *), Bash(rails new *), Bash(go mod init *), Bash(git status*)
model: opus
---

# Set up the stack

Decides frontend, backend, data, hosting and integrations, writes them to
`project.yaml` with the matching `specialists:` and `paths.code_root`, records
the decision as `docs/architecture/adr/0001-stack.md`, and prints the scaffold
commands. It runs a scaffolder only after the user says yes, and never
deploys, creates cloud resources or signs up for services.

## Inputs

- `project.yaml` (`project.type`, any `stack.*` already set)
- `docs/product/prd.md`: non-functional requirements, integrations, scale, regions (by section)
- `.claude/docs/stack-matrix.md`: values, specialists, scaffold commands, defaults by project type
- `bash .claude/scripts/detect-stack.sh`: if code already exists, adopt rather than replace
- Argument `--change <key>`: revisit one key (e.g. `stack.database`); requires a new ADR that supersedes the relevant part of ADR-0001

## Phases

### Phase 1: Read the situation

If `detect-stack.sh` finds an existing app, stop and suggest `/adopt`: this
skill does not scaffold over existing code. Without a PRD, warn that the choice
will rest on the project type alone and continue only if the user agrees.

### Phase 2: Constraints (ask, one round)

Ask up to four questions with the question tool:
1. **Language comfort**: TypeScript (Recommended for full-stack web) / Python / PHP / Ruby / Go.
2. **Hosting budget**: free tier / up to ~$25/mo / up to ~$100/mo / cloud account available.
3. **Integrations needed** (multi-select): auth, payments, CMS, AI features, realtime, email, search.
4. **Data residency or compliance** needs (EU only, HIPAA, none).

Skip a question the PRD already answers, and say which answer you took from it.

### Phase 3: Recommend

Spawn `technical-director` with the PRD sections, the answers and
`stack-matrix.md`. Brief: "Recommend one stack and one alternative for this
project, with a cost estimate at launch traffic and the main trade-off. Prefer
the matrix default for the project type unless a constraint rules it out."

Typical outcomes (from the matrix):
- **SaaS** → Next.js + native backend + Postgres/Drizzle + Better Auth or Clerk + Stripe + Vercel
- **Marketing** → Astro + Sanity/Payload + Cloudflare or Netlify
- **E-commerce** → Next.js + Postgres + Stripe + Sanity + Vercel
- **API** → Hono (TS) or FastAPI (Python) + Postgres + Fly/Railway

Present the recommendation as a table (layer, choice, why, alternative) with
the monthly cost estimate, and ask the user to accept or change rows.

### Phase 4: Record

Draft, show, and ask "May I write these?":
1. `project.yaml` → every `stack.*` key, `paths.code_root` (e.g. `src` or `.`,
   or `apps/web` in a monorepo), and `specialists: [..]` from the matrix.
2. `docs/architecture/adr/0001-stack.md` from `.claude/docs/templates/adr.md`:
   context (PRD constraints), options considered, decision, consequences
   (costs, lock-in, what changing later would take).

Write `project.yaml` with `config-set.sh` (one key per call; `specialists` as an
inline list). If `project.stage` is `discovery`, offer `set-stage.sh design`.

### Phase 5: Scaffold (optional, local only)

Print the scaffold commands from the matrix for the chosen stack, in order
(framework, then styling/shadcn init, then ORM init, then Playwright), with
the target directory. Confirm the flags against `--help` if unsure. Ask: "Run
these now in `<dir>`?" Run them only on yes, one at a time, reporting each
result. The scaffolders install packages locally; nothing is deployed.

After scaffolding: make sure `.env.example` exists (placeholder values only)
and that the framework's own `.gitignore` entries are merged rather than
overwriting the studio `.gitignore` (show the diff and ask).

If the scaffolder wrote agent instructions (current `create-next-app` writes
`AGENTS.md` pointing at version-matched docs in `node_modules/next/dist/docs/`),
keep the file and ask to add `@AGENTS.md` to `CLAUDE.md` so every session loads
it. Never delete or rewrite it: the framework re-creates it.

If `npm install` fails with `ERESOLVE` (peer-dependency conflict), show the
conflicting packages and offer the fix the stack matrix lists; do not pass
`--force` or `--legacy-peer-deps` silently, because skipped peers (e.g. `vite`
for Vitest) break the tool later.

## Output

`project.yaml` stack keys, `specialists`, `paths.code_root`;
`docs/architecture/adr/0001-stack.md`; an optional scaffold in the code root.

## Rigor

- `minimal`: the ADR may be a short paragraph; the alternative may be omitted.
- `full`: the ADR must include a cost table and an exit plan for each vendor.

## Next step

`/test-setup` if the code is scaffolded, else `/brand-identity` (or
`/create-architecture` for an `api` project).
