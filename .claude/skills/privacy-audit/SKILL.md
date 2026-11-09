---
name: privacy-audit
description: "Privacy and compliance audit by privacy-compliance-specialist: personal-data inventory, trackers and cookies firing before consent (via Playwright network capture), policy pages, consent UX, data-subject request flows, retention and processors, driven by project.yaml privacy.regions. Use before launch, when adding analytics, AI, email or new data collection, or when entering a new region."
argument-hint: "[url | 'local']"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(npx playwright*)
model: opus
---

# Privacy Audit

Checks what personal data the product collects, where it goes, and whether
users are told and in control, then writes
`production/audits/privacy-YYYY-MM-DD.md`. **It is not legal advice**: every
legal text it drafts is marked for the user's legal review, and it never
approves tracking or data sharing on the user's behalf.

## Inputs

- `project.yaml`: `privacy.regions` (e.g. `eu`, `uk`, `us-ca`), `stack.analytics`, `stack.email`, `stack.ai`, `stack.payments`, `stack.auth`
- `docs/architecture/data-model.md`, the PRD, feature specs
- Existing policy pages (privacy, cookies, terms) in the code or CMS
- Argument: a URL or `local`

If `privacy.regions` is empty, ask which regions the product serves before
anything else; the answer changes the requirements.

## Phases

### Phase 1: Data inventory

Spawn `privacy-compliance-specialist` with the data model and specs to list
each personal-data field: category (contact, account, payment, usage, content,
special category), purpose, lawful basis, where stored, processors that receive
it (auth, payments, email, analytics, AI provider, hosting, error tracking),
processor region, retention. Grep the code for fields the docs do not mention
(e.g. IP addresses in logs, user agents in analytics, prompts sent to an LLM).

### Phase 2: Trackers before consent

With Playwright, load the home page and one app page in a fresh context
**without** accepting anything, capture all network requests and cookies, and
list third-party hosts and non-essential cookies set before consent. Then
accept, then reject, and confirm that rejecting really stops them. In `eu`/`uk`
regions, any non-essential tracker before opt-in is **Critical**.

### Phase 3: Consent UX

Check the banner: reject as easy as accept (same layer, same prominence), no
pre-ticked boxes, granular categories, consent stored with a timestamp,
withdrawable from the footer. No dark patterns.

### Phase 4: Pages and user rights

- Privacy policy and cookie policy exist, are linked in the footer and at signup, and match the inventory (processors, purposes, retention, contact).
- Users can export their data, correct it, and delete the account; deletion removes or anonymises data and tells processors (Stripe customer, email list, analytics person).
- Marketing email has consent records and one-click unsubscribe.
- `us-ca`: "Do Not Sell or Share" handling if data is shared for advertising; Global Privacy Control respected.
- High-risk processing (AI on personal data, profiling, children, health, finance): DPIA present (template `privacy-dpia`).

### Phase 5: Report

Use the `privacy-dpia` template's audit section: inventory table, tracker
table (host, cookie, before-consent?), findings ranked **Critical / High /
Medium / Low** with evidence and fix, plus drafts of missing policy sections
flagged **DRAFT — needs legal review**. Ask before writing.

### Phase 6: Follow-up

Offer stories for consent, export and deletion flows (`/create-stories`) and a
DPIA draft if one is needed.

## Output

`production/audits/privacy-YYYY-MM-DD.md` (template: `.claude/docs/templates/privacy-dpia.md`).

## Rigor

- `minimal`: tracker capture + policy pages.
- `standard`: adds inventory, consent UX and user-rights flows.
- `full`: adds DPIA for high-risk processing and processor transfer review.

## Next step

`/launch-checklist`, or `/create-stories` for the gaps.
