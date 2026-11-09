# Agent Roster

55 agents. Canonical list: `studio-tests` checks it against
`.claude/agents/`. Stack specialists are used only when `project.yaml →
stack` selects their technology (`/setup-stack` records them in `specialists:`).

## Tier 1 — Directors (4)

| Agent | Model | Owns | Reports to |
|---|---|---|---|
| `product-director` | opus | Product vision, scope, priorities, PRD sign-off | the user (founder) |
| `technical-director` | opus | Architecture, stack choice, ADRs, technical risk | the user (founder) |
| `design-director` | opus | Brand, visual language, design system, UX direction | the user (founder) |
| `producer` | opus | Schedule, milestones, sprint health, cross-team coordination | the user (founder) |

## Tier 2 — Leads (10)

| Agent | Model | Owns | Reports to |
|---|---|---|---|
| `product-manager` | sonnet | PRD, backlog, epics, stories, acceptance criteria | `product-director` |
| `lead-frontend` | sonnet | Frontend architecture, components, client state, frontend reviews | `technical-director` |
| `lead-backend` | sonnet | API design, services, data model, backend reviews | `technical-director` |
| `ux-lead` | sonnet | Information architecture, user flows, wireframes, usability | `design-director` |
| `qa-lead` | sonnet | Test strategy, test plans, quality gates, bug triage | `producer` |
| `devops-lead` | sonnet | CI/CD, environments, hosting, deploys, IaC | `technical-director` |
| `security-lead` | opus | Threat models, security review, OWASP, secrets, dependencies | `technical-director` |
| `growth-lead` | sonnet | Acquisition, activation, retention, experiments, CRO | `product-director` |
| `content-lead` | sonnet | Voice and tone, content strategy, messaging, editorial | `design-director` |
| `release-manager` | sonnet | Releases, versioning, changelog, launch and rollback | `producer` |

## Tier 3 — Core engineering (8)

| Agent | Model | Owns | Reports to |
|---|---|---|---|
| `ui-engineer` | sonnet | Components, screens, forms, client interactions | `lead-frontend` |
| `api-engineer` | sonnet | Endpoints, server actions, business logic, validation | `lead-backend` |
| `data-engineer` | sonnet | Schema, migrations, queries, indexes, data integrity | `lead-backend` |
| `test-engineer` | sonnet | Test infrastructure, unit/integration/e2e tests, TDD | `qa-lead` |
| `performance-engineer` | sonnet | Web Vitals, bundle size, caching, load testing | `technical-director` |
| `accessibility-specialist` | sonnet | WCAG 2.2 AA, assistive tech, a11y audits | `ux-lead` |
| `realtime-engineer` | sonnet | WebSockets, SSE, presence, live updates, collaboration | `lead-backend` |
| `prototyper` | sonnet | Throwaway prototypes and spikes | `technical-director` |

## Tier 3 — Integrations (5)

| Agent | Model | Owns | Reports to |
|---|---|---|---|
| `auth-specialist` | sonnet | Authentication, sessions, RBAC, SSO, MFA | `lead-backend` |
| `payments-specialist` | sonnet | Checkout, subscriptions, webhooks, invoicing, tax | `lead-backend` |
| `cms-specialist` | sonnet | Headless CMS, content models, previews, publishing | `lead-backend` |
| `ai-features-engineer` | sonnet | LLM features, RAG, embeddings, AI safety and evals | `lead-backend` |
| `email-specialist` | sonnet | Transactional and lifecycle email, deliverability | `growth-lead` |

## Tier 3 — Design (3)

| Agent | Model | Owns | Reports to |
|---|---|---|---|
| `ui-designer` | sonnet | Visual design, components, layout, motion | `design-director` |
| `ux-researcher` | sonnet | Personas, interviews, usability tests, competitor research | `ux-lead` |
| `copywriter` | sonnet | Page copy, microcopy, CTAs, release and email copy | `content-lead` |

## Tier 3 — Growth & operations (6)

| Agent | Model | Owns | Reports to |
|---|---|---|---|
| `seo-specialist` | sonnet | Technical SEO, metadata, structured data, sitemaps | `growth-lead` |
| `analytics-engineer` | sonnet | Event tracking, product analytics, dashboards | `growth-lead` |
| `observability-engineer` | sonnet | Error tracking, logs, metrics, uptime, alerts, incidents | `devops-lead` |
| `i18n-specialist` | sonnet | Localisation, translations, locale routing, RTL | `lead-frontend` |
| `privacy-compliance-specialist` | sonnet | GDPR/CCPA, consent, data inventory, legal page drafts | `security-lead` |
| `mobile-specialist` | sonnet | PWA, responsive/mobile web, React Native/Expo | `lead-frontend` |

## Tier 3 — Stack specialists (19)

| Agent | Model | Owns | Reports to |
|---|---|---|---|
| `nextjs-specialist` | sonnet | Next.js App Router, RSC, caching, server actions | `lead-frontend` |
| `remix-specialist` | sonnet | Remix / React Router 7 framework mode | `lead-frontend` |
| `nuxt-vue-specialist` | sonnet | Nuxt and Vue 3 | `lead-frontend` |
| `sveltekit-specialist` | sonnet | SvelteKit and Svelte 5 | `lead-frontend` |
| `astro-specialist` | sonnet | Astro sites, islands, content collections | `lead-frontend` |
| `angular-specialist` | sonnet | Angular (standalone, signals, SSR) | `lead-frontend` |
| `solid-qwik-specialist` | sonnet | SolidJS/SolidStart and Qwik/Qwik City | `lead-frontend` |
| `tailwind-shadcn-specialist` | sonnet | Tailwind CSS, shadcn/ui, design tokens in code | `lead-frontend` |
| `node-backend-specialist` | sonnet | Node.js backends: Express, Fastify, NestJS, Hono | `lead-backend` |
| `python-backend-specialist` | sonnet | FastAPI and Django | `lead-backend` |
| `go-backend-specialist` | sonnet | Go web services | `lead-backend` |
| `laravel-specialist` | sonnet | Laravel (PHP) | `lead-backend` |
| `rails-specialist` | sonnet | Ruby on Rails | `lead-backend` |
| `baas-specialist` | sonnet | Supabase and Firebase | `lead-backend` |
| `postgres-specialist` | sonnet | PostgreSQL with Prisma or Drizzle | `lead-backend` |
| `mongodb-specialist` | sonnet | MongoDB and Mongoose | `lead-backend` |
| `redis-queue-specialist` | sonnet | Redis, caching, rate limits, background jobs, search engines | `lead-backend` |
| `hosting-platform-specialist` | sonnet | Vercel, Netlify, Cloudflare, Fly, Railway, Render | `devops-lead` |
| `cloud-infra-specialist` | sonnet | AWS, GCP, Azure and infrastructure as code | `devops-lead` |

## Role aliases

Roles you may expect in an agency that are covered by an existing agent:

| Role | Covered by |
|---|---|
| Project manager / scrum master / delivery lead | `producer` |
| Business analyst / product owner | `product-manager` (vision and final scope: `product-director`) |
| CTO / solutions architect / software architect | `technical-director` |
| Creative director / art director / brand designer | `design-director` |
| UX designer / information architect / interaction designer | `ux-lead` |
| Visual designer / motion designer | `ui-designer` |
| DBA / data architect | `data-engineer` (+ `postgres-specialist` / `mongodb-specialist`) |
| SRE / platform engineer | `devops-lead` + `observability-engineer` |
| Frontend developer | `ui-engineer` + the frontend stack specialist |
| Backend developer | `api-engineer` + the backend stack specialist |
| Full-stack developer | `/team-feature` (frontend + backend specialists on one contract) |
| QA engineer / SDET | `test-engineer` |
| Marketing / growth marketer | `growth-lead` |
| Content writer / editor / UX writer | `copywriter`, `content-lead` |
| Legal / compliance (drafts only) | `privacy-compliance-specialist` |

## Escalation

| Conflict | Goes to |
|---|---|
| Product scope, priorities, what to build | `product-director` |
| Architecture, stack, technical risk | `technical-director` |
| Brand, visual design, UX direction | `design-director` |
| Schedule, scope vs. time, cross-team changes | `producer` |
| Security or privacy risk | `security-lead`, then `technical-director` (the user decides on accepted risk) |
