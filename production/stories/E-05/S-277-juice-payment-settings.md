# S-277: Owner sets the Juice payment details
Status: review
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/juice-payment.md
Estimate: 2 pts
Owner: remix-specialist, api-engineer

## Story
As the Owner, I want to enter the Juice account name, Juice number and the WhatsApp number for payment proof in Settings, so that customers are told exactly how to pay, without these details ever being public.

## Acceptance Criteria
- [ ] AC1: Given the Owner on Settings, when the Payment section renders, then it has Juice account name (≤ 60), Juice number and WhatsApp for payment proof (phones, ≤ 20), with the hint "Shown only to customers who have placed an order".
- [ ] AC2: Given an invalid Juice number or WhatsApp (not a phone) or a name over 60 characters, when saved, then VALIDATION_FAILED names the field and nothing is saved.
- [ ] AC3: Given an Admin (not Owner), when they open or post Settings, then 403 (unchanged owner-only rule).
- [ ] AC4: Given any payment detail is set, when `/api/menu`, the basket, the menu or any other public page renders, then neither the Juice name, the Juice number nor the payment WhatsApp appears (`checkout.payment` removed).
- [ ] AC5: Given the Juice name or number is missing, when an admin opens Orders, then a warning says customers get "We'll send payment details on WhatsApp"; the Owner gets a link to Settings → Payment, an Admin is told to ask an Owner.

## Tests
- AC1, AC2 → src/app/routes/admin/settings.test.ts, src/app/server/services/save-settings.server.test.ts
- AC3 → src/app/routes/admin/settings.test.ts (existing)
- AC4 → src/app/routes/hooks/menu.test.ts
- AC5 → src/app/routes/admin/orders.test.ts, src/tests/e2e/juice-payment.spec.ts
