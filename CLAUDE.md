# Claude Code Web Studios — Web Studio Agent Architecture

Website and web-app development (frontend + backend) managed through 55
coordinated Claude Code subagents. Each agent owns a domain; directors guard
the vision, leads own departments, specialists do the hands-on work.

## Technology Stack

`project.yaml` is the single source of truth. Until `/setup-stack` runs, every
stack key is `null`:

- **Project type**: [CHOOSE: saas / marketing / ecommerce / api / mixed]
- **Frontend**: [CHOOSE: Next.js / Remix-React Router / Nuxt / SvelteKit / Astro / Angular / SolidStart / Qwik / none]
- **Backend**: [CHOOSE: framework-native / Node (Express, Fastify, NestJS, Hono) / FastAPI / Django / Go / Laravel / Rails / Supabase / Firebase]
- **Database**: [CHOOSE: PostgreSQL (+ Prisma / Drizzle) / MongoDB / BaaS]
- **Styling**: Tailwind CSS + shadcn/ui (default)
- **Hosting**: [CHOOSE: Vercel / Netlify / Cloudflare / Fly / Railway / Render / AWS / GCP / Azure]
- **Version control**: Git, trunk-based, conventional commits

Only the stack specialists matching `project.yaml → stack` are used; the rest
stay dormant. See `.claude/docs/agent-roster.md`.

## Project Structure

@.claude/docs/directory-structure.md

## Lifecycle

**Discovery → Design → Build → Launch → Grow.** `project.stage` records where
the project is; `/gate-check <stage>` decides whether it may move on. See
`docs/WORKFLOW-GUIDE.md`.

## Coordination Rules

@.claude/docs/coordination-rules.md

## Collaboration Protocol

**User-driven collaboration, not autonomous execution.**
Every task follows: **Question → Options → Decision → Draft → Approval**

- Agents MUST ask "May I write this to [filepath]?" before using Write/Edit
  (exempt: `production/session-state/active.md`, agent memory, and a
  subagent's new file at the path its orchestrating skill named)
- Agents MUST show drafts or summaries before requesting approval
- Multi-file changes need explicit approval for the full changeset
- No commits, pushes, deploys, migrations against a shared database, or
  paid-API calls without the user's instruction
- A skipped or dismissed question is not an answer: act on nothing, re-ask in
  plain text and wait
- Never read, print or write real secrets. `.env*` files are denied; use
  `.env.example` with placeholder values

See `docs/COLLABORATIVE-DESIGN-PRINCIPLE.md` for the full protocol.

> **First session?** If `project.yaml` has no stack and `docs/product/` is
> empty, run `/start`.

## Coding Standards

@.claude/docs/coding-standards.md

## Context Management

- **`production/session-state/active.md` is the session checkpoint.** The
  file is the memory, not the conversation. Read it first after a compaction,
  crash or `/clear`.
- **Helpers in `.claude/scripts/` emit observations, never verdicts.** Skills
  and agents decide; scripts report facts.
- Read large docs by section (Grep for `^#`, then Read with offset/limit).
