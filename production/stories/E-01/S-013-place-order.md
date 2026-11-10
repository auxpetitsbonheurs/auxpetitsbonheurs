# S-013: Place an order as a guest
Status: ready
Epic: E-01-walking-skeleton
Spec: docs/specs/features/checkout-and-tracking.md#placeorder-pipeline-server-order-is-normative
Estimate: 5 pts
Owner: remix-specialist, api-engineer, postgres-specialist, ui-engineer

## Story
As a guest customer, I want to enter my details, pick a date and time window and send my order, so that the bakery receives it and I get an order number.

## Acceptance Criteria
- [ ] AC1 (FR-021): Given phone `5712 3456`, `+230 5712 3456` or `00 33 6 12 34 56 78`, then the stored phone is `+23057123456`, `+23057123456` and `+33612345678`; given `12345`, then `VALIDATION_FAILED` with `fields.contact.phone` and no order.
- [ ] AC2 (FR-021, FR-022): Given an empty name, an invalid email, delivery with an address under 5 characters, no date, a window id not in the list for the chosen fulfilment, or the policy box unticked, when I press "Place order", then `VALIDATION_FAILED` names each field, no order is created, and focus goes to an error summary with links to the fields.
- [ ] AC3 (FR-020, FR-023): Given a valid form, then the date must be today (Mauritius) or later, and the time windows offered are the Settings windows for the chosen fulfilment (Morning, Afternoon, Evening at launch).
- [ ] AC4 (FR-024): Given a valid submit, then one order exists with status `pending_approval`, source `website`, `locale` equal to the page locale (EN or FR), `policies_accepted_at` set, items with copied prices, `delivery_fee_rs` equal to the Settings fee at placement (Rs 200) for delivery and 0 for pickup, and `total_rs` = items + fee.
- [ ] AC5 (FR-024): Given the order, then its number is `APB-0001` (prefix + 4 digits, from the `counter` row inside the same transaction) and its `tracking_token` is 43 base64url characters from 32 random bytes and cannot be derived from the number.
- [ ] AC6 (FR-045): Given the order is created, then an `order_event` of type `created` (actor customer) and an `email_outbox` row `order_received` (status pending, dedupe key `order:<id>:received`, order locale) are written in the same transaction; nothing is sent in this story.
- [ ] AC7 (NFR-013): Given the insert of an order item fails inside the transaction, then no order, event, outbox row exists and no number is consumed.
- [ ] AC8 (FR-015): Given `displayedTotalRs` differs from the server total, or a forged price field is posted, then the stored total equals the server calculation or the request is refused with `PRICE_CHANGED` and the repriced lines, `totalRs` and `deliveryFeeRs`; no order is created.
- [ ] AC9 (FR-013): Given a line whose product became sold out or hidden, then `PRODUCT_UNAVAILABLE` lists the `lineId` and no order is created; given an empty basket, then `VALIDATION_FAILED`.
- [ ] AC10 (FR-024): Given a guest email that matches an existing customer, then the order attaches to that customer; given a new email, a new customer row is created; the existing row's `email` and `auth_user_id` are never changed, and a phone alone never matches.
- [ ] AC11 (FR-024): Given success, then the basket cookie is cleared and I am redirected to `/order/:token/confirmed` (or `/fr/order/:token/confirmed` from an FR page).
- [ ] AC12 (NFR-002): Given the checkout form at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px, and the sticky "Place order" bar hides when the keyboard is open.
- [ ] AC13 (NFR-002): Given the fields name, phone (`tel`), email, note, date and window, then each has a visible label, a correct `autocomplete` value and a phone/email keyboard type; errors are linked to fields; light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.
- [ ] AC14 (FR-022): Given the policy checkbox, then its label opens the policies text from Settings in an expandable section (cancellation and storage text), and the summary shows items, fee line, total and the Juice number (placeholder) or cash note.

## Tests
- AC1 → src/app/domain/phone.test.ts
- AC2 → src/app/server/services/place-order.server.test.ts and src/tests/e2e/checkout.spec.ts
- AC3 → src/app/server/services/place-order.server.test.ts (fixed clock)
- AC4 → src/app/server/services/place-order.server.test.ts (Postgres container)
- AC5 → src/app/server/services/place-order.server.test.ts and src/app/domain/order-number.test.ts
- AC6 → src/app/server/services/place-order.server.test.ts
- AC7 → src/app/server/services/place-order.server.test.ts
- AC8 → src/app/server/services/place-order.server.test.ts
- AC9 → src/app/server/services/place-order.server.test.ts
- AC10 → src/app/server/repos/customers.server.test.ts
- AC11 → src/tests/e2e/checkout.spec.ts
- AC12 → src/tests/e2e/checkout.spec.ts
- AC13 → src/tests/e2e/checkout.spec.ts
- AC14 → src/tests/e2e/checkout.spec.ts

## Notes
- Depends on: S-004, S-006, S-008, S-012.
- Contract: `site/basket` `placeOrder` (contracts.md). Pipeline steps 1, 4, 6, 7, 9 are built here. Deliberately left to later epics (E-05): Turnstile and RL-order (step 3), full `assertOrderable` notice/closed/blocked/seasonal rules (step 5), promotions, option pricing. Spec gap/decision: until E-05 the date rule is "today or later" only, so staging must not be opened to the public before E-05.
- Idempotency (step 2) is S-014; keep the `idempotencyKey` field in the form from this story so S-014 only adds behaviour.
- Email/push after commit (step 8) is a stub: rows only; sending is E-10.
- Customer matching rule: contracts.md "Customer matching" and threat-model G-02.
- Policy text "sheet" simplified to an expandable section in the skeleton (decision); the full sheet comes with E-05.
