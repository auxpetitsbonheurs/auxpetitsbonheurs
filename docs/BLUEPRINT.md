# Claude Code Web Studios — Blueprint

The master plan for this framework. Every agent, skill, hook, rule and template
the studio ships is listed here, with the phase that builds it. When a later
phase adds or renames something, this file changes in the same commit.

Inspired by [Claude Code Game Studios](https://github.com/Donchitos/Claude-Code-Game-Studios),
re-designed for **website and web-app development (frontend + backend)**.

---

## 1. Decisions (from the kickoff Q&A)

| Topic | Decision |
|---|---|
| Name | **Claude Code Web Studios** |
| Primary user | Solo dev / indie builder (one human + an AI team) |
| Project types | SaaS / web apps, marketing / landing sites, e-commerce, APIs / backend-only |
| Roster size | Full parity: ~50 agents |
| Frontend specialists | Next.js/React, Remix/React Router 7, Vue/Nuxt, SvelteKit, Astro, Angular, SolidJS/SolidStart, Qwik |
| Backend specialists | Node (Express/Fastify/NestJS/Hono), Python (FastAPI/Django), Go, Laravel, Rails, Supabase/Firebase |
| Data | PostgreSQL + Prisma/Drizzle, MongoDB, Redis/queues, search & vector DBs |
| Styling default | Tailwind CSS + shadcn/ui (overridable in `/setup-stack`) |
| Hosting | Vercel / Netlify / Cloudflare, Docker + Fly/Railway/Render, AWS / GCP / Azure (IaC) |
| Integrations | Auth, payments, headless CMS, AI features (LLM/RAG) |
| Rigor | Configurable (`minimal` / `standard` / `full`) chosen in `/start` |
| Hooks | Commit/push validation, a11y + perf budgets, security scanning, session state + audit log, **TDD guard** |
| Planning docs | PRD → per-feature specs (with API contract + UX spec) → ADRs |
| Lifecycle | **Discovery → Design → Build → Launch → Grow**, with gate checks between stages |
| Visual design | Full design department; reuses best-in-class public skills as dependencies |
| Autonomy | Agents propose, the user decides (Question → Options → Decision → Draft → Approval) |
| Grow | SEO + content, analytics + experiments, observability + incidents, CRO + email |
| Cross-cutting | i18n, privacy/compliance, mobile/PWA (+ React Native/Expo), realtime |
| Brownfield | Yes: `/adopt` + `/reverse-document` for existing sites |
| Self-tests | Yes: `studio-tests/` + CI lint of agents, skills, hooks |
| Distribution | Template repo **and** Claude Code plugin |
| Starter app | None: `/setup-stack` scaffolds `src/` once the stack is chosen |
| Config | `project.yaml` single source of truth + status line |
| License | MIT |

---

## 2. Studio hierarchy (55 agents)

```
Tier 1 — Directors (4)
  product-director     technical-director    design-director     producer

Tier 2 — Leads (10)
  product-manager      lead-frontend         lead-backend        ux-lead
  qa-lead              devops-lead           security-lead       growth-lead
  content-lead         release-manager

Tier 3 — Core specialists (22)
  Engineering   ui-engineer  api-engineer  data-engineer  test-engineer
                performance-engineer  accessibility-specialist
                realtime-engineer  prototyper
  Integrations  auth-specialist  payments-specialist  cms-specialist
                ai-features-engineer  email-specialist
  Design        ui-designer (incl. motion)  ux-researcher  copywriter
  Growth & ops  seo-specialist  analytics-engineer  observability-engineer
                i18n-specialist  privacy-compliance-specialist
                mobile-specialist (PWA + React Native/Expo)

Tier 3 — Stack specialists (19, only the chosen ones are used)
  Frontend  nextjs-specialist  remix-specialist  nuxt-vue-specialist
            sveltekit-specialist  astro-specialist  angular-specialist
            solid-qwik-specialist  tailwind-shadcn-specialist
  Backend   node-backend-specialist  python-backend-specialist
            go-backend-specialist  laravel-specialist  rails-specialist
            baas-specialist (Supabase/Firebase)
  Data      postgres-specialist (Prisma/Drizzle)  mongodb-specialist
            redis-queue-specialist (cache, rate limits, BullMQ/Celery jobs)
  Platform  hosting-platform-specialist (Vercel/Netlify/Cloudflare/Fly/Railway/Render)
            cloud-infra-specialist (AWS/GCP/Azure + Terraform/CDK)
```

4 + 10 + 22 + 19 = **55**. `.claude/docs/agent-roster.md` (Phase 2) is the
canonical list; `studio-tests` checks it against `.claude/agents/`.

### Escalation
- Product/scope conflicts → `product-director`
- Technical conflicts → `technical-director`
- Visual/brand/UX conflicts → `design-director`
- Schedule, scope-vs-time, cross-department propagation → `producer`

---

## 3. Lifecycle

| Stage | Goal | Key outputs | Gate to next |
|---|---|---|---|
| **Discovery** | What are we building, for whom, why | `docs/product/brief.md`, personas, competitor scan, PRD | `/gate-check discovery` |
| **Design** | How it looks, flows and is built | brand + design system, sitemap/IA, UX flows, client demo, **working prototype + manual test sessions**, feature specs, API contracts, data model, ADRs, architecture | `/gate-check design` |
| **Build** | Ship features, test-first | epics, stories, code, tests, reviews, manual test session per milestone | `/gate-check build` |
| **Launch** | Production-ready and live | UAT test session, launch checklist, SEO, perf, a11y, security, privacy audits, deploy, smoke check | `/gate-check launch` |
| **Grow** | Learn and improve | analytics, experiments, CRO, content, incidents, retros | (continuous) |

`project.stage` in `project.yaml` records the current stage.

---

## 4. Skills (slash commands), by stage

**Onboarding & meta (12)**
`/start` `/help` `/onboard` `/adopt` `/setup-stack` `/settings` `/project-stage-detect`
`/reverse-document` `/skill-improve` `/skill-test` `/gate-check` `/install-deps`

**Discovery (8)**
`/brainstorm` `/market-research` `/competitor-audit` `/personas` `/write-prd`
`/scope-check` `/estimate` `/tech-spike`

**Design (18)**
`/brand-identity` `/design-system` `/design-tokens` `/sitemap` `/ux-flow` `/wireframe`
`/ux-review` `/feature-spec` `/api-contract` `/data-model` `/architecture-decision`
`/create-architecture` `/architecture-review` `/content-strategy` `/design-review`
`/propagate-design-change` `/client-demo` `/working-prototype`

**Build (27)**
`/create-epics` `/create-stories` `/story-readiness` `/dev-story` `/story-done` `/tdd`
`/prototype` `/vertical-slice` `/review-code` `/refactor` `/tech-debt` `/db-migration`
`/add-auth` `/add-payments` `/add-cms` `/add-ai-feature` `/add-realtime` `/add-i18n`
`/sprint-plan` `/sprint-status` `/test-setup` `/regression-suite` `/test-flakiness`
`/e2e` `/consistency-check` `/team-feature` `/test-session`

**Quality audits (6)**
`/perf-audit` `/a11y-audit` `/security-audit` `/dependency-audit` `/seo-audit` `/privacy-audit`

**Launch (9)**
`/ci-setup` `/deploy-setup` `/launch-checklist` `/release-checklist` `/smoke-check`
`/load-test` `/changelog` `/release-notes` `/milestone-review`

**Grow (11)**
`/analytics-plan` `/experiment` `/funnel-review` `/cro-review` `/email-flows`
`/observability-setup` `/incident` `/hotfix` `/postmortem` `/retrospective` `/content-calendar`

**Bugs (2)**
`/bug-report` `/bug-triage`

**Team orchestrations (7)**
`/team-frontend` `/team-backend` `/team-design` `/team-qa` `/team-launch` `/team-growth` `/team-polish`

Total: **100** skills.

---

## 5. Hooks

| Hook | Event | Purpose |
|---|---|---|
| `session-start.sh` | SessionStart | Print stage, stack, active story, recover `active.md` |
| `detect-gaps.sh` | SessionStart | Flag missing PRD/specs/tests relative to stage |
| `validate-commit.sh` | PreToolUse(Bash) | Conventional commit, lint + typecheck on staged files, block secrets & `.env` |
| `validate-push.sh` | PreToolUse(Bash) | Tests must pass before push; warn on push to `main` |
| `validate-write.sh` | PreToolUse(Write/Edit) | Block writing secrets, keys, `.env` contents |
| `validate-read.sh` | PreToolUse(Read) | Section-read guard for large docs |
| `tdd-guard.sh` | PostToolUse(Write/Edit) | Warn when source changes without a matching test (strict mode: block) |
| `check-a11y.sh` | PostToolUse(Write/Edit) | Static a11y lint on UI files (alt text, labels, roles) |
| `check-perf-budget.sh` | PostToolUse(Write/Edit) | Flag heavy imports, unoptimised images, bundle-budget breaches |
| `scan-security.sh` | PostToolUse(Write/Edit) | OWASP patterns: raw SQL concat, `dangerouslySetInnerHTML`, eval, open CORS |
| `dependency-audit.sh` | PostToolUse(Write/Edit) | Run `npm audit`/`pip-audit` when a manifest changes |
| `validate-skill-change.sh` | PostToolUse(Write/Edit) | Remind to run `/skill-test` after editing a skill |
| `log-agent.sh` / `log-agent-stop.sh` | SubagentStart/Stop | Agent audit trail |

Shared helpers live in `hooks/lib.sh`. Behaviour is covered by `studio-tests/hooks.sh`.
| `pre-compact.sh` | PreCompact | Flush state to `active.md` |
| `session-stop.sh` | Stop | Session log + summary |
| `notify.sh` | Notification | Desktop notification |

All hooks honour `modes.rigor`: `minimal` = advisory, `standard` = block on
secrets/commit errors only, `full` = block on every failed check.

---

## 6. Path-scoped rules

| Rule | Paths |
|---|---|
| `frontend-components.md` | `src/**/components/**`, `**/*.{tsx,jsx,vue,svelte,astro}` |
| `styling.md` | `**/*.css`, `tailwind.config.*`, `components/ui/**` |
| `api-routes.md` | `src/**/api/**`, `app/**/route.ts`, `server/**`, `routes/**` |
| `server-actions.md` | `**/actions/**`, `**/*.server.{ts,js}` |
| `database.md` | `prisma/**`, `drizzle/**`, `migrations/**`, `**/schema.*` |
| `auth-code.md` | `**/auth/**`, `middleware.*` |
| `payments-code.md` | `**/billing/**`, `**/payments/**`, `**/webhooks/**` |
| `ai-code.md` | `**/ai/**`, `**/llm/**`, `**/rag/**` |
| `realtime-code.md` | `**/realtime/**`, `**/ws/**`, `**/sockets/**` |
| `i18n.md` | `**/locales/**`, `**/messages/**`, `**/i18n/**` |
| `seo-metadata.md` | `**/layout.*`, `**/head.*`, `**/sitemap.*`, `**/robots.*` |
| `env-config.md` | `**/env.*`, `**/config/**`, `.env.example` |
| `infra.md` | `infra/**`, `terraform/**`, `**/Dockerfile`, `.github/workflows/**` |
| `test-standards.md` | `tests/**`, `**/*.{test,spec}.*`, `e2e/**` |
| `prototype-code.md` | `prototypes/**` |
| `specs.md` | `docs/**` |
| `agent-memory.md` | `.claude/agent-memory/**` |
| `skill-authoring.md` | `.claude/skills/**` |

---

## 7. Templates (`.claude/docs/templates/`)

Product: `project-brief`, `persona`, `competitor-analysis`, `market-research`, `prd`
Design: `brand-guide`, `design-system`, `design-tokens.json`, `sitemap`, `ux-flow`, `wireframe-brief`, `ux-spec`, `content-strategy`
Architecture: `feature-spec`, `api-contract` (OpenAPI 3.1), `data-model`, `adr`, `architecture`, `threat-model`
Production: `epic`, `story`, `sprint-plan`, `milestone-review`, `retrospective`, `tech-debt-register`, `estimate`
Quality: `test-plan`, `test-session`, `a11y-report`, `perf-report`, `security-review`, `seo-audit`, `privacy-dpia`, `bug-report`
Launch: `launch-checklist`, `release-checklist`, `release-notes`, `runbook`, `changelog`
Grow: `analytics-tracking-plan`, `experiment-brief`, `funnel-review`, `email-flow`, `incident-report`, `postmortem`, `content-calendar`

Total: **46** templates (+ `README.md` index).

---

## 8. External skill dependencies (reused, not vendored)

Installed on demand by `/install-deps` (or manually). The studio's own agents
**call** these where they fit instead of duplicating them.

| Source | Skill | Used by |
|---|---|---|
| `anthropics/skills` | `frontend-design` | `design-director`, `ui-designer`, `/brand-identity`, `/design-system`, `/wireframe` |
| `anthropics/skills` | `webapp-testing` | `test-engineer`, `/e2e`, `/smoke-check` |
| `anthropics/skills` | `theme-factory` | `/design-tokens` |
| `anthropics/skills` | `web-artifacts-builder` | `/prototype`, `/wireframe` (clickable mockups) |
| `anthropics/skills` | `mcp-builder` | `ai-features-engineer` |
| `anthropics/skills` | `claude-api` | `ai-features-engineer`, `/add-ai-feature` |
| `vercel-labs/agent-skills` | `web-design-guidelines` | `ux-lead`, `/ux-review`, `/a11y-audit` |
| `vercel-labs/agent-skills` | `react-best-practices` | React-family specialists, `/review-code` |
| `vercel-labs/agent-skills` | `composition-patterns` | `lead-frontend`, `ui-engineer` |
| `vercel-labs/agent-skills` | `react-native-skills` | `mobile-specialist` |
| `vercel-labs/agent-skills` | `deploy-to-vercel` | `hosting-platform-specialist` |
| MCP: Playwright | browser automation | `test-engineer`, `/e2e`, `/a11y-audit`, `/perf-audit` |

Every studio skill that names a dependency also works without it: it falls back
to its own checklist and says the dependency was not found.

---

## 9. Build phases

| Phase | Contents | Status |
|---|---|---|
| 1 | Foundation: blueprint, `CLAUDE.md`, README, LICENSE, `project.yaml`, core docs, settings, status line, `session-start` hook, `/start`, `/help`, plugin manifest | ✅ |
| 2 | All 55 agents + `agent-roster.md` | ✅ |
| 3 | Skills: onboarding, discovery, design | ✅ |
| 4 | Skills: build, audits, launch, grow, teams | ✅ |
| 5 | Hooks + helper scripts | ✅ |
| 6 | Rules + templates | ✅ |
| 7 | `studio-tests/`, CI workflow, plugin packaging, polish | ✅ |
