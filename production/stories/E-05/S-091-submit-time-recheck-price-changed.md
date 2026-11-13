# S-091: Order submit re-checks dates, products and prices
Status: review
Epic: E-05-pricing-availability-checkout
Spec: docs/specs/features/checkout-and-tracking.md#placeorder-pipeline-server-order-is-normative
Estimate: 5 pts
Owner: api-engineer, remix-specialist, ui-engineer

## Story
As a customer, I want the bakery to check my date, items and price when I press Place order, and tell me clearly what changed, so that I am never charged a surprise.

## Acceptance Criteria
- [x] AC1 (FR-015, FR-011): Given a tampered `displayedTotalRs` or a forged price field, when `placeOrder` runs, then the stored total equals the server calculation or the request is refused with `PRICE_CHANGED`; no client price is ever read.
- [x] AC2 (FR-015): Given a promotion ended (18:00 Mauritius, fixed clock) after the form opened, when sent, then `PRICE_CHANGED` with repriced `lines`, `itemsTotalRs`, `deliveryFeeRs`, `totalRs`, no order is created, the Alert shows "The price changed from Rs {old} to Rs {new}" and the button reads "Place order at Rs {new}"; the next submit with the new total succeeds.
- [x] AC3 (FR-015): Given the delivery fee or a product price edited after render, when sent, then the same `PRICE_CHANGED` flow applies (the fee is part of the compared total).
- [x] AC4 (FR-015): Given a date blocked after the form opened, when sent, then `DATE_UNAVAILABLE` with the reason category only (no private reason), no order, other fields kept.
- [x] AC5 (FR-015, FR-013): Given a date that is closed, too soon for the largest notice in the basket, or beyond 90 days, when posted, then `DATE_UNAVAILABLE` with reason closed, too_soon or too_far.
- [x] AC6 (FR-015): Given a sold-out, hidden or out-of-season line, when sent, then `PRODUCT_UNAVAILABLE` lists its `lineId`, no order is created, the line shows an Alert and Remove, and Place order stays blocked until it is removed.
- [x] AC7 (FR-015): Given an empty basket on submit, then `VALIDATION_FAILED`; given the basket changed in another tab, then the server cookie wins and the page gets `PRICE_CHANGED` or `PRODUCT_UNAVAILABLE`.
- [x] AC8 (FR-015): Given the pipeline order (parse, idempotency, rate limit and Turnstile, products, date, price, transaction), when a refusal occurs, then nothing is written (no order, number, outbox row) and the refusal is logged with code only.
- [x] AC9 (FR-015, NFR-002, NFR-006): Given any refusal at 320 px and 375 px, 200% zoom and keyboard-only, when it appears, then a top Alert (`role=alert`) lists each problem as a link to its field, focus moves to it, per-line Alerts are tied to their line, and the old and new price are readable text.
- [x] AC10 (FR-015): Given the pipeline reuses the E-01 idempotent submit and sequential number allocation, when a refusal happens after key lookup, then the form keeps the same `idempotencyKey` (no order created yet).

## Tests
- AC1 → src/app/routes/site/basket.place-order.test.ts
- AC2 → src/app/routes/site/basket.place-order.test.ts (fixed clock)
- AC3 → src/app/routes/site/basket.place-order.test.ts
- AC4 → src/app/routes/site/basket.place-order.test.ts
- AC5 → src/app/routes/site/basket.place-order.test.ts
- AC6 → src/app/routes/site/basket.place-order.test.ts
- AC7 → src/app/routes/site/basket.place-order.test.ts
- AC8 → src/app/server/services/place-order-guard.server.test.ts, src/app/routes/site/basket.test.ts ("S-091 AC8"), src/app/server/turnstile.server.test.ts
- AC9 → src/tests/e2e/checkout-a11y.spec.ts
- AC10 → src/app/routes/site/basket.place-order.test.ts

## Notes
- Builds on E-01 minimal `placeOrder`; this story adds steps 4-6 of the normative pipeline plus the UI states. Depends on S-081, S-082, S-083, S-084.
- Error copy EN/FR via copywriter, no blame wording ("We need 3 days' notice for this cake. The earliest date is ...").

## Implementation notes (2026-11-13, E-05 finish)
- Built mostly in E-01 S-013/S-014 and the S-081..S-084 rules; the `place_order` procedure (now 0013, Juice payment) decides in one round trip. Tests: src/app/server/services/place-order.server.test.ts, place-order-options.server.test.ts (new: offer ending at 18:00 Mauritius between render and submit, then the resubmit at the new total succeeds), src/app/routes/site/basket.test.ts, src/tests/e2e/basket-instant.spec.ts (PRICE_CHANGED and left-out flows).
- AC2 copy: the calm note reads "Your order has not been sent yet" with "The total changed from Rs {old} to Rs {new}" next to the button, which then reads "Place order at Rs {new}" (S-090 AC6).
- AC3: the delivery fee is part of the compared total, so a fee change takes the same PRICE_CHANGED path.
- AC6 adjusted (ADR-0004, accepted 2026-11-11): sold-out, hidden and out-of-season lines no longer block the order with PRODUCT_UNAVAILABLE. They are shown dimmed, left out of the total and named in the summary. If they disappear after the page was shown, the submit answers PRICE_CHANGED naming them, and the confirmation lists them as not included. Only a basket with nothing orderable is refused (VALIDATION_FAILED on `basket`).
- AC8 partly open: parse, idempotency, products, date, price and the single transaction run in that order, a refusal writes nothing (no order, number or outbox row), and logs carry the code or kind only. **Not built yet: step 3, RL-order and Turnstile.** RL-order needs either a second database round trip per submit or a change to the shared `place_order` procedure (a new migration all parallel jobs touch). Turnstile needs real site keys and a server call, so it is an Owner setup step. Proposed as a follow-up story.
- AC10: a refusal echoes the posted `idempotencyKey` into the re-rendered form (S-014 AC4 tests in basket.test.ts).

## AC8 step 3 (2026-11-13, leftovers job)
- **No extra round trip.** `place_order` is not redefined (parallel jobs own its body). drizzle/0019 adds `place_order_limited(input, limit)`: it counts the attempt in `rate_limit_bucket` (the same atomic upsert as `consumeRateLimit`, key `site.placeOrder:<sha256>` of the IP), turns `insert` off when the count is over the limit (or the bot check failed), then calls `place_order` unchanged. Still one CALL per submit; the bucket upsert is a primary-key write in the same statement.
- **Order of steps:** the idempotency replay (step 2) still wins, so a customer whose first press placed the order gets their confirmation back even when over the limit or with an already-used token. Then RL-order, then Turnstile.
- **Limits:** RL-order 5 per 10 min per IP with a verified token (spec value). Without a token (no JavaScript, blocked script, a tap before the widget finished), with a stale token (`timeout-or-duplicate`) or when Cloudflare is unreachable, the order is **allowed** under the stricter RL-order-unverified (3 per 10 min, same count), logged as `place_order_unverified` with a reason only (no IP, no token). Only a token Cloudflare rejects as invalid is `BOT_CHECK_FAILED`. Without Turnstile keys every post counts as verified (the integration list already warns the Owner).
- **UX:** the widget is managed and invisible (`appearance: interaction-only`; Cloudflare shows a checkbox only when it must), loaded on demand after load and idle (src/app/lib/order-turnstile.ts, ~0.5 kB chunk plus Cloudflare's script), and writes a hidden `turnstileToken`, so the no-JavaScript post is unchanged. After any refusal the widget makes a fresh token. RATE_LIMITED (429 + Retry-After) and BOT_CHECK_FAILED keep the form, its values and its idempotency key, with calm copy: "Your order has not been sent yet…" in EN/FR.
- The site key reaches the page through the site layout loader (env only, no query; the layout does not revalidate).

