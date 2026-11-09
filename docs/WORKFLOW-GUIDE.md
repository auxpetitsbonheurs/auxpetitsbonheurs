# Workflow Guide

## The five stages

### 1. Discovery — *what, for whom, why*
| Step | Skill | Output |
|---|---|---|
| Explore the idea | `/brainstorm` | `docs/product/brief.md` |
| Know the market | `/market-research`, `/competitor-audit` | `docs/product/research/` |
| Know the users | `/personas` | `docs/product/personas/` |
| Write requirements | `/write-prd` | `docs/product/prd.md` |
| Sanity-check size | `/scope-check`, `/estimate` | scope notes |
| De-risk tech | `/tech-spike` | spike report |
| **Gate** | `/gate-check discovery` | |

### 2. Design — *how it looks, flows and is built*
| Step | Skill | Output |
|---|---|---|
| Pick the stack | `/setup-stack` | `project.yaml`, scaffold in `src/` |
| Brand | `/brand-identity` | `docs/design/brand-guide.md` |
| Design system | `/design-system`, `/design-tokens` | `docs/design/design-system.md`, `tokens.json` |
| Information architecture | `/sitemap`, `/content-strategy` | `docs/content/` |
| Flows & screens | `/ux-flow`, `/wireframe`, `/ux-review` | `docs/design/ux/` |
| Client demo | `/client-demo` (`pitch` early, `review` once brand + flows exist, `feedback` after the client looks) | `docs/design/demo/<slug>/` |
| **Early prototype** | `/working-prototype` → `/test-session` → `/working-prototype iterate` (repeat until the journeys feel right) | `prototypes/<slug>/`, `production/test-sessions/` |
| Feature specs | `/feature-spec` (+ `/api-contract`, `/data-model`): written from what testing taught | `docs/specs/features/` |
| Architecture | `/create-architecture`, `/architecture-decision`, `/architecture-review` | `docs/architecture/` |
| **Gate** | `/gate-check design` | |

### 3. Build — *test-first delivery*
| Step | Skill |
|---|---|
| Break down | `/create-epics`, `/create-stories`, `/story-readiness` |
| Plan | `/sprint-plan`, `/sprint-status` |
| Implement | `/dev-story` (runs `/tdd` inside), `/team-feature` for full-stack slices |
| Test by hand | `/test-session` on the vertical slice and at every milestone build |
| Integrations | `/add-auth`, `/add-payments`, `/add-cms`, `/add-ai-feature`, `/add-realtime`, `/add-i18n`, `/db-migration` |
| Review & close | `/review-code`, `/story-done` |
| Keep healthy | `/tech-debt`, `/refactor`, `/regression-suite`, `/consistency-check` |
| **Gate** | `/gate-check build` |

### 4. Launch — *production-ready and live*
| Step | Skill |
|---|---|
| Pipeline | `/ci-setup`, `/deploy-setup` |
| Audits | `/perf-audit`, `/a11y-audit`, `/security-audit`, `/seo-audit`, `/privacy-audit`, `/dependency-audit` |
| Acceptance | `/test-session run staging` (UAT) |
| Ship | `/launch-checklist`, `/release-checklist`, `/smoke-check`, `/release-notes` |
| Orchestrated | `/team-launch` |
| **Gate** | `/gate-check launch` |

### The manual testing loop (runs through every stage)

Automated tests prove the code matches the spec; manual sessions prove the
spec is right. Start early and keep going:

```
Design   /client-demo (look) ─► /working-prototype (works, fake data) ─► /test-session ─► iterate
Build    /vertical-slice ─► /test-session ─► each milestone build ─► /test-session
Launch   staging ─► /test-session (UAT) ─► /launch-checklist
Grow     live product ─► /test-session with real users ─► /experiment
```

Findings are routed, never lost: bugs → `/bug-report`, flow or copy →
UX/copy updates, spec or scope → `/propagate-design-change`.

### 5. Grow — *measure, learn, improve*
| Area | Skill |
|---|---|
| Measure | `/analytics-plan`, `/observability-setup`, `/funnel-review` |
| Improve | `/experiment`, `/cro-review`, `/email-flows`, `/content-calendar` |
| Operate | `/incident`, `/hotfix`, `/postmortem` |
| Reflect | `/retrospective`, `/milestone-review` |

## Existing website?

`/adopt` detects the stack, writes `project.yaml`, and `/reverse-document`
produces the PRD, specs and architecture docs from the code, so the rest of
the workflow has something to build on.

## Lost?

`/help` reads `project.yaml` and what is on disk and names the next step.
