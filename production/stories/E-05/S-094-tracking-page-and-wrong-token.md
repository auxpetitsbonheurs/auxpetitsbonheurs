# S-094: Tracking page by private link
Status: ready
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/checkout-and-tracking.md#tracking-page-content
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist, api-engineer

## Story
As a customer, I want to open my private link and see my order's details and status, so that I do not need to ask the bakery.

## Acceptance Criteria
- [ ] AC1 (FR-026): Given a valid token and no session, when `/t/:token` loads, then it shows number, status badge in customer wording, paid status, items with options, date, window, delivery/pickup (address, landmark), delivery fee, total, payment info, a language switch and a WhatsApp button prefilled with the order number.
- [ ] AC2 (FR-026): Given a wrong token and a well-formed unknown token, when requested, then both return the identical 404 "We can't find this order" page with WhatsApp (same status, body and timing class).
- [ ] AC3 (FR-026): Given a token that does not match `^[A-Za-z0-9_-]{43}$`, when requested, then 404 is returned before any database read.
- [ ] AC4 (FR-026): Given 61 requests from one IP within 10 minutes, when the 61st arrives, then `RATE_LIMITED` with `Retry-After` (RL-track 60 / 10 min).
- [ ] AC5 (FR-026): Given the page, when delivered, then `noindex`, `no-store`, `Referrer-Policy: no-referrer` are set, and `/t/:token` is redacted in logs and error reports.
- [ ] AC6 (FR-026): Given the order has an admin private note, when the tracking page renders, then the note never appears.
- [ ] AC7 (FR-026): Given another customer's order token is not supplied, when listing orders, then no route exposes orders without the token (only the token route reads an order for customers).
- [ ] AC8 (FR-026, NFR-002, NFR-006): Given the page at 320 px and 375 px, 200% zoom and keyboard-only, when used, then status is never colour-only, the WhatsApp button has an accessible name including the order number, tap targets >= 44 px, contrast AA per `docs/design/tokens.json`, no sideways scroll.

## Tests
- AC1 → src/app/routes/site/tracking.test.tsx
- AC2 → src/app/routes/site/tracking.test.ts
- AC3 → src/app/routes/site/tracking.test.ts
- AC4 → src/app/routes/site/tracking.test.ts
- AC5 → src/app/routes/site/tracking.test.ts
- AC6 → src/app/routes/site/tracking.test.ts
- AC7 → src/app/routes/site/tracking.test.ts
- AC8 → src/tests/e2e/tracking.spec.ts

## Notes
- E-01 delivers a minimal tracking slice; this story widens it with the full summary, rate limit and not-found parity. Progress bar and quote block are S-095.
- `whatsappUrl` built by `domain/whatsapp.ts` (contract note 2026-11-10).
