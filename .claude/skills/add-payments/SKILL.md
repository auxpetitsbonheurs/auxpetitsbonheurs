---
name: add-payments
description: "Adds payments and billing (one-off checkout, subscriptions, trials, plan changes, usage billing, customer portal, invoices, tax) with Stripe, Paddle or Lemon Squeezy, in test mode only, with verified idempotent webhooks and entitlement checks. Use when the product charges money."
argument-hint: "[provider]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*)
model: opus
---

# Add Payments

The provider is the source of truth for billing state; the app mirrors it from
webhooks and gates features by entitlements. **Test mode keys only.** It never
creates live products, prices or charges, and never decides prices.

## Inputs

- `project.yaml → stack.payments`, `project.type`, `privacy.regions`
- PRD pricing and packaging section (plans, limits, trials); if missing, ask
  `product-director` to frame it and the user to decide
- `.claude/docs/stack-matrix.md`

## Phases

### Phase 1: Provider

If `stack.payments` is null, ask with trade-offs:
- `Stripe`: most flexible, you handle sales tax/VAT registration (Stripe Tax helps)
- `Paddle` / `Lemon Squeezy`: merchant of record; they handle global tax, higher fees
Write an ADR (template `adr`); after approval run `config-set.sh stack.payments=<value>`.

### Phase 2: Model

Confirm with the user: one-off vs subscription vs usage; plans and their limits;
trial (card upfront or not); proration on upgrade/downgrade; cancellation at period
end; dunning; refunds; currencies; tax. Record in the feature spec
(`docs/specs/features/billing.md`, template `feature-spec`).

### Phase 3: Threats and data

`security-lead`: webhook spoofing/replay, price tampering from the client, race
conditions on plan changes, IDOR on invoices. `privacy-compliance-specialist` if
regions require it. Card data never touches the app (hosted checkout/elements, PCI SAQ A).

### Phase 4: Plan

`payments-specialist` with the backend specialist proposes:
- products/prices created in **test mode** via a seed script or dashboard steps the user runs
- checkout session / overlay creation server-side, price looked up server-side
- webhook endpoint: raw-body signature verification, event ID stored for
  idempotency, out-of-order handling, retries; events handled at least:
  checkout completed, subscription created/updated/deleted, payment failed, refund, dispute
- `subscriptions` table mirroring provider state; `can(user, feature)` entitlements helper
- customer portal link; billing settings UI
- `.env.example` placeholders (`STRIPE_SECRET_KEY=sk_test_...`, webhook secret)
- tests: unit for entitlements, integration for the webhook handler with signed
  fixture payloads, the provider CLI or test clocks for lifecycles

Ask: "Create stories (recommended) or implement directly?" Then `/create-stories` or `/dev-story`.

## Never

Use live keys; trust client-sent prices, plans or quantities; change pricing
without the user; send real receipts.

## Next step

`/security-audit payments`, then `/email-flows` for receipts and dunning.
