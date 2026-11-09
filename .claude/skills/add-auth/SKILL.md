---
name: add-auth
description: "Adds authentication and authorisation (sessions, OAuth, magic links, passkeys, MFA, roles, organisations) using the provider in project.yaml stack.auth (Clerk, Auth.js, Better Auth, Supabase Auth, Firebase Auth or custom sessions). Use when the product needs login, signup, protected routes, roles or teams."
argument-hint: "[provider]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Add Auth

Integration playbook for authentication **and** authorisation. Prefers a
maintained provider over hand-rolled auth. Uses test/development instances
only; never touches production auth settings.

## Inputs

- `project.yaml → stack.auth`, `stack.frontend`, `stack.backend`, `privacy.regions`
- PRD and specs: who signs up, roles, teams/orgs, SSO needs, account deletion
- `.claude/docs/stack-matrix.md` for the specialist pairing

## Phases

### Phase 1: Provider

If `stack.auth` is null, ask: "Which auth approach?" with options fitted to the
stack, e.g. `Clerk (hosted, orgs built in)`, `Auth.js / Better Auth (self-hosted, in your DB)`,
`Supabase Auth` / `Firebase Auth` (when on that BaaS), `Framework-native`
(Laravel Fortify/Sanctum, Django auth, Rails authentication generator). Give cost,
lock-in and data-residency trade-offs. On a choice: draft an ADR
(`/architecture-decision` format, template `adr`), and after approval run
`bash .claude/scripts/config-set.sh stack.auth=<value>`.

### Phase 2: Requirements

Confirm: sign-in methods (email+password, magic link, OAuth providers, passkeys),
MFA, roles and permissions, organisations/teams, invitations, account deletion,
session length. Spawn `security-lead` for a short threat model (template
`threat-model`): enumeration, brute force, session fixation, CSRF, OAuth redirect
abuse, privilege escalation, tenant isolation. Spawn
`privacy-compliance-specialist` if `privacy.regions` is set.

### Phase 3: Plan the work

`auth-specialist` with the stack specialists proposes:
- provider setup and env vars (placeholders added to `.env.example`, never real values)
- route protection (middleware) **plus** a server-side `requireUser()` / policy helper
  used by every handler
- the authorisation model: a single `can(user, action, resource)` layer, tenant scoping
- user record sync / webhooks (verified signatures)
- UI: sign-in, sign-up, reset, account settings, org switcher (design-system components)
- tests: per-role integration tests, Playwright sign-up/sign-in journey

Ask: "Create stories for this (recommended), or implement directly now?"

### Phase 4: Do it

- Stories → `/create-stories` format with ACs for each method, role and failure case.
- Direct → run `/dev-story` style TDD with `auth-specialist`, asking before every write.

## Never

Store passwords or tokens in logs or `localStorage`; roll custom crypto; rely on
hidden UI for authorisation; use production keys.

## Next step

`/security-audit auth` once implemented.
