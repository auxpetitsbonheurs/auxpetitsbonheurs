---
name: security-audit
description: "Full-project security audit led by security-lead: OWASP Top 10 code review, an authorisation inventory of every route and action, headers and CSP, secrets scanning, dependency risk and threat-model coverage. Use before launch, after auth/payments/upload changes, or periodically. For reviewing only the current diff, use the built-in /security-review instead."
argument-hint: "[area | 'full']"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(gitleaks*), Bash(curl -sI *), Bash(git log*)
model: opus
---

# Security Audit

Audits the whole project, not just the latest diff, and writes
`production/audits/security-YYYY-MM-DD.md`. It reports secret **locations**
only, never their values; it never runs active attacks against systems the
user has not authorised; and it fixes nothing without approval.

## Inputs

- `docs/architecture/architecture.md`, ADRs, `docs/architecture/api/` contract
- Threat models (`docs/architecture/threat-model*.md` or feature specs' security sections)
- `project.yaml`: `stack.*`, `privacy.regions`
- Argument: an area (`auth`, `payments`, `uploads`, `api`, `ai`) or `full`

## Phases

### Phase 1: Map the attack surface

Inventory, with file paths: every route handler, server action, API endpoint,
webhook, cron/job entry point, file upload, admin page, and third-party
callback. Use `.claude/docs/stack-matrix.md` for where each stack keeps them
(e.g. `app/**/route.ts`, `server/api/**`, `routes/*.php`, `config/routes.rb`).

### Phase 2: Authorisation inventory

Spawn `security-lead` (with `auth-specialist` for the auth model) to fill a table:
route/action → authn required? → authz check (role/ownership/tenant) → file:line
of the check → verdict. Any mutation or private read without a server-side
authz check is **Critical**. Hidden UI is not authorisation.

### Phase 3: OWASP Top 10 review

Spawn in parallel, each with the surface map:
- `security-lead`: broken access control, injection (string-built SQL, `$queryRawUnsafe`, NoSQL operator injection, shell exec), XSS (`dangerouslySetInnerHTML`, `v-html`, `{@html}`, `html_safe`, `|safe`), SSRF (user-supplied URLs fetched server-side), insecure deserialisation, open redirects, CSRF on cookie-auth mutations, rate limits on auth endpoints.
- `api-engineer` or the backend stack specialist: validation at every boundary, error leakage (stack traces), mass assignment.
- `payments-specialist` (if `stack.payments`): webhook signatures, idempotency, client-trusted prices.
- `ai-features-engineer` (if `stack.ai`): prompt injection via retrieved content, keys in the client bundle, tools with side effects.

### Phase 4: Configuration, headers, secrets

- Headers on the running app or a preview URL: `curl -sI <url>` → HSTS, CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, frame protection; cookie flags (`HttpOnly`, `Secure`, `SameSite`).
- CORS: no `*` with credentials; allowlist matches real origins.
- Secrets: `gitleaks detect --no-banner --redact` if installed (also over git history); otherwise Grep for key patterns (`sk_live_`, `AKIA`, `-----BEGIN`, `xox`, `ghp_`). Check that `.env*` is gitignored and `.env.example` holds placeholders only. Report path and line, never the value.
- Client bundle: no server secrets behind `NEXT_PUBLIC_`/`VITE_`/`PUBLIC_` prefixes.
- Dependencies: summarise the latest `/dependency-audit`, or run it if none exists from the last 30 days.

### Phase 5: Threat-model coverage

Every feature touching auth, money, files, personal data or third parties
should have a threat model (template `threat-model`). List features without one
as **Medium** findings and offer to draft them.

### Phase 6: Report

Use the `security-review` template: scope, method, authz inventory table,
findings ranked **Critical / High / Medium / Low** with evidence (file:line),
exploit scenario in one sentence, fix, and owner agent. Accepted risks are
recorded only when the user explicitly accepts them. Ask before writing.

### Phase 7: Follow-up

Offer bugs for Critical/High findings (`/bug-report`) and say plainly that a
Critical finding blocks `/gate-check launch` (`SEC-LAUNCH`).

## Output

`production/audits/security-YYYY-MM-DD.md` (template: `.claude/docs/templates/security-review.md`).

## Rigor

- `minimal`: authz inventory + secrets scan + headers.
- `standard`: adds the OWASP review.
- `full`: adds threat-model coverage, git-history secret scan and a sign-off from `security-lead` (`SEC-REVIEW`).

## Next step

`/bug-triage` for the findings, then `/gate-check launch`.
