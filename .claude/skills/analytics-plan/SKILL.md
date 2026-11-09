---
name: analytics-plan
description: "Turns the PRD's success metrics into an event-level tracking plan (events, properties, identity, consent gating, server-side money events) and optional implementation stories. Use when setting up product analytics, before launch, or when metrics cannot answer a product question."
argument-hint: "[no arguments | 'update']"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Analytics Plan

Produces `production/analytics/tracking-plan.md`: the few events that answer
the PRD's questions, named consistently, gated by consent, with money and
critical state changes tracked server-side. It never adds tracking code
without a story, and never sends PII to analytics.

## Inputs

- `docs/product/prd.md`: the `Goals and metrics` / success metrics section (read by heading)
- `docs/specs/features/*.md`: the key journeys each feature adds
- `project.yaml`: `stack.analytics`, `stack.payments`, `privacy.regions`, `project.type`
- An existing `production/analytics/tracking-plan.md` (argument `update`)

## Phases

### Phase 1: Questions before events

Read the PRD metrics. List each metric as a question it must answer
("What % of signups create a project within 24 h?"). If the PRD has no
metrics, stop and suggest `/write-prd` (or ask `product-director` to add them).

If `stack.analytics` is unset, ask: "Which analytics tool?" →
`PostHog (Recommended: product analytics + flags + experiments)`,
`Plausible (privacy-first page analytics)`, `GA4`, `None yet`.

### Phase 2: Draft the plan

Spawn `analytics-engineer` with the questions, the specs and the tool, and
`growth-lead` in parallel to define the North Star, the activation event and
the funnel stages. Merge their output into the template
`.claude/docs/templates/analytics-tracking-plan.md`:

| Section | Content |
|---|---|
| Metrics → events | Each PRD question mapped to the events and properties that answer it |
| Event catalogue | `object_action` snake_case names (`project_created`), trigger, properties with types, client or server, owner |
| Identity | anonymous ID → `identify` on signup/login; alias rules; no email/name as distinct ID |
| Server-side events | Payments (`subscription_started`, `payment_failed`), account deletion, plan changes; sent from webhooks/handlers, never trusted from the client |
| Consent | Which events need consent under `privacy.regions`; load the SDK only after opt-in where required; cookieless mode where available |
| Exclusions | Internal/test traffic filtered; preview deployments excluded |
| Dashboards | North Star, activation funnel, retention cohort, revenue |

Keep the catalogue small: 10–25 events for an MVP. Every event must map to a
question; drop the rest.

### Phase 3: Privacy check

Spawn `privacy-compliance-specialist` to review: no PII or free text in
properties, consent gating matches `privacy.regions`, processors listed for
the privacy policy. Apply its findings or show them to the user.

### Phase 4: Write

Show the plan summary (questions, event count, server-side events, consent
rules) and ask "May I write this to `production/analytics/tracking-plan.md`?"

### Phase 5: Implementation stories (optional)

Ask: "Create implementation stories?" → `Yes: one story per area (Recommended)`, `No`.
On yes, draft stories in the story format from the conventions (typed
`track()` helper, client events, server events, dashboards), using
`next-number.sh` for IDs, and ask before writing them under `production/stories/`.

## Output

- `production/analytics/tracking-plan.md` (template `analytics-tracking-plan`)
- Optional stories under `production/stories/E-NN/`

## Rigor

- `minimal`: page views + the activation event + signup; no stories.
- `standard`: full plan, privacy review.
- `full`: plan + privacy review + a test per server-side event in the stories.

## Next step

`/dev-story` for the tracking stories, then `/funnel-review` once data exists.
