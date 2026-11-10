# S-015: Order confirmation page
Status: review
Epic: E-01-walking-skeleton
Spec: docs/specs/features/checkout-and-tracking.md#screens--states
Estimate: 2 pts
Owner: ui-engineer, remix-specialist

## Story
As a customer who just sent an order, I want a clear confirmation with my order number and tracking link, so that I know it was received and can come back to it.

## Acceptance Criteria
- [x] AC1 (FR-025): Given a valid token, when `/order/:token/confirmed` loads, then it shows the order number (large, with a Copy button), an info message "Not confirmed until we approve it", and the tracking link with Copy and Share.
- [x] AC2 (FR-025): Given I refresh the confirmation URL, then the same order shows and no new order is created.
- [x] AC3 (FR-026): Given a wrong or malformed token, then the not-found page "We can't find this order" shows (404), identical for wrong and unknown tokens, and the token format is checked (`^[A-Za-z0-9_-]{43}$`) before the database.
- [x] AC4 (NFR-004): Given the page, then headers include `Cache-Control: no-store`, `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer`.
- [x] AC5 (NFR-007): Given the order was placed from `/fr/basket`, then the confirmation page and its texts default to French.
- [x] AC6 (NFR-002): Given the page at 320 px and 375 px wide and at 200% zoom, when I use only the keyboard, then every control is reachable in a logical order with a visible focus indicator, nothing is clipped, no horizontal scrolling occurs and every tap target is at least 44 x 44 px.
- [x] AC7 (NFR-002): Given the page loads, then focus moves to the `h1`; the Copy buttons announce "Copied" in a live region; light and dark mode pairs meet WCAG AA contrast per docs/design/tokens.json with no serious or critical axe violations.

## Tests
- AC1 → src/app/routes/site/order-confirmed.test.ts and src/tests/e2e/checkout.spec.ts (Copy writes the clipboard)
- AC2 → src/app/routes/site/order-confirmed.test.ts
- AC3 → src/app/routes/site/order-confirmed.test.ts (a database that throws on any use proves the format check comes first) and src/tests/e2e/checkout.spec.ts
- AC4 → src/app/routes/site/order-confirmed.test.ts, src/app/server/token-page.server.test.ts and src/tests/e2e/checkout.spec.ts (real response headers, 404s included)
- AC5 → src/app/routes/site/order-confirmed.test.ts
- AC6 → src/tests/e2e/checkout.spec.ts
- AC7 → src/tests/e2e/checkout.spec.ts

## Notes
- Depends on: S-013.
- Contract: `site/order-confirmed` loader. The "Save my details" card (FR-038) is E-11 and is not shown yet (`offerSaveDetails` false).
- Tokens in URLs are never logged (see S-019 redaction).
- Decision: the headers are set by a route middleware (`server/token-page.server.ts`, shared with S-016) so pages, `.data` requests, 404s and redirects all carry them; `X-Robots-Tag` is `noindex, nofollow`.
- Decision: minimal loader slice `{ title, number, trackingUrl, offerSaveDetails: false }`; `email` arrives with the Save-my-details card (E-11) so no unused personal data sits in the page.
- Decision: the tracking link uses the order's language (`/fr/t/...` for a French order); an unprefixed token link for a French order moves to `/fr` on entry only when no language is remembered (switch and explicit choice win).
- Decision: Share is a WhatsApp link (works without JavaScript, `noopener noreferrer`) that uses the system share sheet when the browser has one; Copy buttons render only after hydration (no dead buttons without JavaScript), and both report "Order number copied" / "Link copied" in one visible `role=status` region.
