# Coding Standards

Stack-specific rules live in `.claude/rules/` and load by path. These apply
everywhere.

## General
- TypeScript `strict` (or the stack's strictest typing: mypy/pyright strict,
  PHPStan level 8+, Sorbet/RBS where used). No `any` without a comment saying why.
- Validate every input at the boundary (zod / valibot / pydantic / form
  requests). Never trust the client.
- No secrets in code. Read config from typed env (`env.ts`, `settings.py`)
  validated at startup; document every variable in `.env.example`.
- Functions ≤ 40 lines, cyclomatic complexity ≤ 10, one responsibility each.
- Name for the domain (`invoice`, `seat`), not the mechanism (`data`, `handler2`).
- Errors are typed and handled at a boundary; never swallowed. User-facing
  errors are friendly; logged errors carry context, never PII or tokens.

## Frontend
- Server-render by default; ship client JS only where interaction needs it.
- Semantic HTML first; ARIA only when no native element fits. WCAG 2.2 AA.
- All user-facing strings go through i18n once `i18n.locales` has more than one.
- Images: modern formats, explicit dimensions, lazy below the fold.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.

## Backend
- Parameterised queries / ORM only. No string-built SQL.
- Authorisation checked on the server for every mutation and every read of
  private data (never rely on hidden UI).
- Idempotent webhooks (store and check event IDs); verify signatures.
- Migrations are forward-only, reviewed, and reversible by a follow-up.
- Rate-limit auth, signup, password reset and any expensive endpoint.

## Testing (TDD)
- Write the failing test first, then the code, then refactor (`/tdd`).
- Unit tests for logic, integration tests for API + DB, Playwright for the
  critical user journeys named in the PRD.
- Each story's acceptance criteria map to at least one test.
- Tests are deterministic: no real network, fixed clocks, seeded data.

## Git
- Conventional commits: `feat(scope): …`, `fix: …`, `chore: …`.
- Small PRs; one story per branch where practical.
