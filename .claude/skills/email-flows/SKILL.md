---
name: email-flows
description: "Maps and designs the product's transactional and lifecycle email: the flow map, triggers, templates (React Email or MJML), copy, and the deliverability checklist (SPF, DKIM, DMARC, unsubscribe). Use when adding email to the product, planning onboarding or re-engagement sequences, or fixing deliverability. Never sends email."
argument-hint: "[transactional | lifecycle | deliverability | all]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: sonnet
---

# Email Flows

Produces `docs/content/email-flows.md` (template
`.claude/docs/templates/email-flow.md`) and, on approval, implementation
stories. It never sends to real recipients: previews and tests go to an
inbox capture (Mailpit, the provider's sandbox or test mode).

## Inputs

- `docs/product/prd.md`, `docs/specs/features/*.md` (events that trigger email)
- `production/analytics/tracking-plan.md` (behavioural triggers for lifecycle email)
- `docs/design/brand-guide.md` (voice, colours, logo)
- `project.yaml`: `stack.email`, `stack.auth`, `stack.payments`, `privacy.regions`, `i18n.locales`

## Phases

### Phase 1: Provider

If `stack.email` is unset, ask: `Resend (Recommended for TS stacks)`, `Postmark (best transactional deliverability)`,
`SendGrid`, `Amazon SES (cheapest at volume)`. Recording it in `project.yaml` needs a yes.

### Phase 2: Flow map

Spawn `email-specialist` to draft the map; in parallel `growth-lead` for
lifecycle goals. Two streams, kept separate (different sending subdomains or
message streams):

| Stream | Typical emails | Trigger |
|---|---|---|
| Transactional | verify email, magic link/OTP, password reset, receipt/invoice, payment failed, plan changed, security alert, export ready | system event, sent from a queue with retries |
| Lifecycle | welcome, activation nudge (no activation event after 24 h), feature education, trial ending, win-back | behaviour from the tracking plan, with frequency caps |

For each email: trigger, audience, delay, subject + preview text, goal, CTA,
suppression rules (e.g. stop the nudge once activated).

### Phase 3: Templates and copy

`copywriter` drafts subject lines and body copy in the brand voice. Templates
use React Email (TS stacks) or MJML: shared layout component, plain-text
alternative, dark-mode-safe colours, 600 px max width, alt text on images,
localised strings when `i18n.locales` has more than one.

### Phase 4: Deliverability and compliance checklist

- SPF, DKIM and DMARC (`p=none` → `quarantine` once reports are clean) on a dedicated sending subdomain
- Bounce and complaint webhooks handled (suppress hard bounces)
- One-click `List-Unsubscribe` + `List-Unsubscribe-Post` on lifecycle/marketing mail
- Consent recorded for marketing email under `privacy.regions`; physical address where required (CAN-SPAM)
- Absolute links; UTM tags on lifecycle links only
- Rate limits on user-triggered emails (reset, magic link)

Spawn `privacy-compliance-specialist` to check the consent column.

### Phase 5: Write

Show the map and checklist; ask "May I write this to `docs/content/email-flows.md`?"
Then offer implementation stories (provider setup, layout, one story per
email group, webhook handling, inbox-capture setup for dev) under `production/stories/`.

## Output

`docs/content/email-flows.md`; optional stories.

## Next step

`/dev-story` for the email stories; DNS records are added by the user at their DNS provider.
