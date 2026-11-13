# Feature Spec — Pricing, availability and promotions (domain rules)

Status: draft · Owner: product-manager · Updated: 2026-11-10
ADRs: ADR-0001 · Epic: TBD (`/create-epics`)
Related: [catalogue-browsing](catalogue-browsing.md), [checkout-and-tracking](checkout-and-tracking.md)

## Summary
The pure business rules that decide what a customer can order, on which dates and at what price. They live in `src/app/domain` (no db, server, react, router or network imports; `now` is injected), run on the server as the authority and in the browser for the live price and date picker only. The prototype `prototypes/apb-v1/src/domain` is a reference to re-implement test-first, never imported. Unit coverage target: >= 90 % lines and 100 % of the test table below.

Out of scope: status transitions, quotes, prep list, WhatsApp (other domain modules), admin screens that edit these inputs (Availability, Promotions, Menu: FR-059..066).

## Requirements trace
| PRD ID | Requirement | Covered by |
|---|---|---|
| FR-006 | Seasonal window inclusive, Mauritius | `productProblem`, T-PRD-* |
| FR-011 | Item/order price, server authority, no taxes | `priceLine`, `priceBasket`, `reconcileTotal`, T-PR-*, T-BK-* |
| FR-012 | Prices copied to orders | `PricedLine` is the snapshot shape (checkout spec), T-BK-9 |
| FR-013 | Selectable dates: not blocked, not closed day, >= N days; N = max notice | `availability.ts`, T-AV-* |
| FR-014 | Reason category without the private reason | `DayStatus.reason`, T-AV-* |
| FR-015 | Re-check at submit | `assertOrderable`, `productProblem`, `reconcileTotal` |
| FR-016 | Promotion live window, base-price-only, strike-through data | `promotions.ts`, T-PM-* |
| FR-017 | Lowest price wins, no stacking, promo recorded | `bestPromotion`, T-PM-* |
| FR-008 | Message-on-cake limit server-side | `validateSelection`, T-PR-* |
| FR-056 (warn part) | Admin warnings for blocked / too soon | `adminDateWarnings`, T-AV-* |
| NFR-008 | Mauritius time, whole-rupee money | `time.ts`, T-TM-* |

## Decisions made in this spec (flagged where they differ from the prototype)
1. **Notice N** (deviation from the brief's literal wording, kept as the safer rule and listed for the owner in README) = max over basket items of `(item.noticeDays ?? defaultDays)`; empty basket = default. A product with no explicit notice uses the default. (Prototype ignored unset items, so a basket of notice 1 + unset gave 1 day; this spec gives 3.) A product may set a notice lower than the default.
2. **Notice counting:** earliest orderable date = `todayMU + N` calendar days; today and earlier are never orderable (`N = 0` allows today unless closed/blocked).
3. **Reason priority** when several apply: `blocked` > `closed` > `too_soon` (`too_far` last). The picker shows only the category; the private block reason never leaves the server.
4. **Horizon:** the picker and server accept dates up to `todayMU + 89` (90 days, as the contract's `DayStatus[90]`). Later dates: `too_far`.
5. **Seasonal window** (owner-approved 2026-11-10, Q2) is judged on the **pickup/delivery date**, not the placement date. The checkout date picker offers only dates inside every seasonal item's window (other dates get reason `out_of_season`); basket and checkout validation re-check the chosen date against each seasonal item's window (`DATE_UNAVAILABLE`, reason `out_of_season`). Browsing still hides a product outside its window by `todayMU(now)` (it cannot be added), so `productProblem` is unchanged for display.
6. **Promotion live** = `active && startsAt <= now < endsAt` (end exclusive; prototype treated the end instant as live). A row with `endsAt <= startsAt` is never live.
7. **Percent discount rounding:** `floor((base * (100 - pct) + 50) / 100)` (half up, whole rupees). A promotion price `>= base` is not a discount and is ignored.
8. **Tie-break** for equal lowest price: earliest `startsAt`, then lowest `id` (deterministic).
9. **Option price:** `single` and `multiple` add the chosen choices' `priceDeltaRs`; `text` adds nothing; `quantity` adds `unitDelta * pick.quantity` (a quantity group has one priced unit choice; the editor enforces that). All per product unit, then multiplied by line `quantity`. Negative deltas are allowed; a negative line total is a `LINE_NEGATIVE` error.
10. **Message limit** counts grapheme clusters after NFC normalisation and trimming (emoji = 1). Over-limit input is rejected, never truncated (prototype `slice` truncated silently).
11. **Problem lines** (sold out, hidden, out of season) are returned with `problem` set and are excluded from totals; checkout is refused while any exists.
12. **As built (S-081, 2026-11-13):** checkout leaves problem lines out (ADR-0004) rather than refusing. A line whose picks are no longer valid for the product (choice or group removed, new required group, limit changed, below the minimum quantity, line below Rs 0) is a problem line `options_changed`, left out the same way. `priceBasket(lines, catalogue, { fulfilment, deliveryFeeRs, limits, today?, promotionFor? })` takes the promotion as a callback until S-082 (none applies yet). A quantity pick with no choice id counts the group's only choice; with several choices and none named it is `required`. `fromPriceRs`, `lowestOptionPrice` and the editor warning live in `domain/option-prices.ts` (re-exported by `pricing.ts`) so the menu page and product editor stay light. JS budgets: `pricing-core.ts` (types, line price, a structural check of the picks, problem lines, totals) is all the basket needs, and the basket loads it after hydration (the loader sends the lines priced on the server for the first paint); `pricing.ts` adds the full selection rules and money bounds for the server and the product page, whose ordering area is a lazy chunk; a refusal's prices load on demand (`menu-refusal.ts`). `productProblem` is defined once in `domain/season.ts`. The `place_order` procedure (migration 0010, `order_line_price`) applies the same rules in SQL; text lengths reach it as grapheme counts computed by the server.

## Module API (`src/app/domain`, all exports typed, no `any`)
```ts
// errors.ts
type DomainErrorCode = "INVALID_DATE" | "DATE_UNAVAILABLE" | "PRODUCT_UNAVAILABLE" | "SELECTION_INVALID"
                     | "LINE_NEGATIVE" | "PRICE_CHANGED" | "INVALID_MONEY";
class DomainError extends Error { code: DomainErrorCode; details?: unknown }   // services map codes to contracts.md ErrorCode

// time.ts  (only place converting instants and MU dates; MU = UTC+4, no DST)
todayMU(now: Date): MuDate;  addDays(d: MuDate, n: number): MuDate;  diffDays(a: MuDate, b: MuDate): number;
isoWeekday(d: MuDate): 1|2|3|4|5|6|7;  isValidMuDate(s: string): s is MuDate;   // strict calendar check
muDateTimeToInstant(d: MuDate, hhmm: string): Date;  instantToMuDate(i: Date): MuDate;

// availability.ts
type AvailabilityCtx = { today: MuDate; defaultNoticeDays: number; closedWeekdays: number[];            // ISO 1-7
                         blocked: { startsOn: MuDate; endsOn: MuDate }[]; horizonDays?: number /*90*/ };
noticeDaysFor(items: { noticeDays: number | null }[], defaultDays: number): number;
dayStatus(date: MuDate, ctx: AvailabilityCtx, noticeDays: number, windows?: { startsOn: MuDate; endsOn: MuDate }[]): DayStatus;      // { date, available, reason }; windows = seasonal windows of basket items, date must be inside all (else out_of_season)
dayStatuses(ctx, noticeDays, count = 90): DayStatus[];                              // starts at ctx.today
earliestDate(ctx, noticeDays): MuDate | null;                                       // null if none in horizon
assertOrderable(date: MuDate, ctx, noticeDays): void;                               // throws DomainError DATE_UNAVAILABLE {reason}
adminDateWarnings(date, ctx, noticeDays): ("blocked" | "closed" | "too_soon")[];    // manual orders never throw (FR-056)
type ProductProblem = "hidden" | "out_of_season" | "sold_out" | null;
productProblem(p: ProductAvail, today: MuDate): ProductProblem;                     // precedence hidden > out_of_season > sold_out
isVisible(p, today): boolean;  isOrderable(p, today): boolean;

// promotions.ts
type PromoStatus = "scheduled" | "live" | "ended" | "inactive";                     // inactive wins when active=false
isLive(p: PromotionRule, now: Date): boolean;  promotionStatus(p, now): PromoStatus;
salePriceRs(baseRs: number, d: Discount): number | null;                            // null = not a discount
bestPromotion(productId: string, baseRs: number, promos: PromotionRule[], now: Date): { promotionId: string; salePriceRs: number } | null;
liveBanner(promos, now): PromotionRule | null;   liveCards(promos, now): PromotionRule[];   // banner: latest startsAt; cards: startsAt desc

// pricing.ts
validateSelection(p: ProductPricing, input: LineInput, limits: { cakeMessageMax: number }): SelectionIssue[];  // all issues, never just the first
priceLine(p, input, promo: { promotionId: string; salePriceRs: number } | null, limits): PricedLine;          // throws SELECTION_INVALID / LINE_NEGATIVE
fromPriceRs(p, promo?): number;               // cheapest valid configuration, for "from Rs X"
priceBasket(lines: LineInput[], catalogue: Map<string, ProductPricing>, promos: PromotionRule[], now: Date,
            opts: { fulfilment: "delivery" | "pickup"; deliveryFeeRs: number; limits }): PricedBasket;      // { lines, itemsTotalRs, deliveryFeeRs, totalRs }
reconcileTotal(displayedTotalRs: number, basket: PricedBasket): { ok: true } | { ok: false; code: "PRICE_CHANGED"; basket: PricedBasket };
graphemeLength(s: string): number;            // NFC + Intl.Segmenter
```
`PricedLine` is the contracts.md shape plus `originalUnitPriceRs = originalBase + option deltas` and the applied `promotionId`. No function accepts a client-supplied price; `LineInput` has none (compile-time guarantee for FR-011).

## UX (how the rules surface; screens belong to other specs)
| Surface | Behaviour |
|---|---|
| Date picker | Unavailable days struck and focusable; tap shows under the calendar: too_soon "Too soon: we need {N} days' notice", closed "Closed on {weekday}s" (weekday name from Settings), blocked / too_far "Not available"; out_of_season "Not available: {item} is only available {start} to {end}"; a day before today "This day has passed" (S-087, built 2026-11-13). Never "Fully booked". Header "Earliest date: {date}". |
| Price | Sale: struck original + sale + "-20%" badge (percent promos) or "Sale" badge; visually hidden "was". Option deltas "+Rs 150". |
| Admin date picker | Any day selectable; warning Alert listing `adminDateWarnings`. |

## API Contract
No new routes. These functions back the loaders/actions in `contracts.md`: `site/menu`, `site/product` (`earliestDate`, `salePriceRs`), `site/basket` (`days`, `earliestDate`, `lines`, `placeOrder` errors `DATE_UNAVAILABLE`, `PRICE_CHANGED`, `PRODUCT_UNAVAILABLE`, `VALIDATION_FAILED`), `site/custom-cake` (`days`), admin manual order/edit.

### Open contract changes (applied 2026-11-10)
1. `DayStatus.reason`: add `"too_far"` (date beyond the 90-day horizon). `DATE_UNAVAILABLE` carries the same enum. — **Resolved in contracts.md (2026-11-10).**
2. No product-level minimum quantity exists (prototype Dessert Cups had min 6; PRD J1/exploratory charter tests it). Proposed: `product.min_quantity smallint default 1` (data-model) and `BasketLine.quantity` validated `>= min_quantity`; error via `VALIDATION_FAILED fields.quantity`. Needs owner confirmation (Open Questions). — **Resolved in contracts.md and data-model.md (2026-11-10), modified:** `product.min_quantity smallint NULL` (default NULL = no minimum, CHECK 1..50) instead of `default 1`; values per product are an owner question (README).
3. `PricedLine.problem` stays `"sold_out" | "hidden" | "out_of_season" | null`; no change. `PriceChanged` response must include the repriced `totalRs` (see checkout spec). — **No change needed (2026-11-10):** `PRICE_CHANGED` now carries `itemsTotalRs`, `deliveryFeeRs`, `totalRs`.

## Data Model Changes
None for the rules themselves. Reads: `product`, `option_group`, `option_choice`, `promotion`, `promotion_product`, `blocked_date`, `settings`. Adds `product.min_quantity` (nullable, NULL = no minimum; Open contract change 2, applied 2026-11-10).

## Permissions matrix
Pure functions: no permissions. Callers: customer actions run `assertOrderable` + `priceBasket`; admin manual orders/edits call `adminDateWarnings` and never throw (FR-056).

## Analytics Events
None (rules emit no events; refusals are logged server-side by the services with code only).

## Edge Cases
- **Midnight Mauritius:** 2026-11-09T19:59:59Z is Mon 9 Nov; 20:00:00Z is Tue 10 Nov. Never use `getDate()` or the server's local zone.
- Blocked ranges are inclusive on both ends; a single-day block has `startsOn == endsOn`; overlapping ranges are fine.
- Every weekday closed or a long block: `earliestDate` scans only the horizon and returns `null` (UI: "No dates available, contact us on WhatsApp").
- Product removed from catalogue: line gets `problem: "hidden"`.
- Promotion whose product is hidden or sold out: no effect (product rules win).
- Promotion row edited while a customer checks out: `reconcileTotal` returns `PRICE_CHANGED` with the new basket.
- Sale price 0 is allowed (DB CHECK >= 0); line total 0 is allowed; negative is not.
- Invalid strings (`2026-02-30`, `2026-2-3`, non-strings) -> `INVALID_DATE`, never silently normalised.
- Money: integers 0..1,000,000 only; fractional or NaN input -> `INVALID_MONEY`.
- Daily maximum does not exist: no function takes an order count.
- Time-zone test double: tests inject `now`; no test reads the system clock.

## Acceptance Criteria
- AC1: Given default notice 3 and Monday, when listing days, then Tuesday and Wednesday are `too_soon` and Thursday is available; Sunday is `closed` while Sunday is a closed weekday.
- AC2: Given a basket item with notice 5, then the earliest date is today + 5.
- AC3: Given a blocked date, then its status reason is `blocked` and no private reason field exists on `DayStatus`.
- AC4: Given a promotion ending 18:00, then 17:59:59.999 is live and 18:00:00.000 is not.
- AC5: Given two live promotions on a product, then the lowest price applies and the order item references that promotion.
- AC6: Given a discount, then option deltas and delivery fee are unchanged.
- AC7: Given a tampered displayed total, then `reconcileTotal` fails with the server's total.
- AC8: Given a seasonal product ending on D, then it is orderable on D and `out_of_season` on D+1 (for display, by today's date).
- AC8b (Q2): Given a basket with a seasonal item whose window ends 25 Dec, when the customer picks a pickup/delivery date of 27 Dec, then the picker shows it unavailable (`out_of_season`) and `placeOrder` refuses it with `DATE_UNAVAILABLE`; a date of 24 Dec is accepted.
- AC9: Given a 41-grapheme message with limit 40, then `validateSelection` returns `cakeMessage too_long`.
- AC10: Given any test in the table, it passes with a fixed injected clock and no network.

## Unit-test table (Vitest; one `it` per row, names = IDs)
Fixture: today = Mon 2026-11-09, default notice 3, closed [7], no blocks, horizon 90 unless stated. Product P: base 3000; groups Size (single, required: S 0, M +500, L +1000), Flavour (single: vanilla 0, choc +200), Add-ons (multiple: candles +100, topper +300), Extra cupcakes (quantity 0..12, unit +50), Inscription (text, max 20).

**Time (`time.ts`)**
| ID | Input | Expected |
|---|---|---|
| T-TM-1 | todayMU(2026-11-09T19:59:59Z) | 2026-11-09 |
| T-TM-2 | todayMU(2026-11-09T20:00:00Z) | 2026-11-10 |
| T-TM-3 | addDays(2026-11-30, 1) / (2026-12-31, 1) | 2026-12-01 / 2027-01-01 |
| T-TM-4 | addDays(2028-02-28, 1) / (2026-03-01, -1) | 2028-02-29 / 2026-02-28 |
| T-TM-5 | isoWeekday(2026-11-15) / (2026-11-09) | 7 / 1 |
| T-TM-6 | muDateTimeToInstant(2026-11-12, "18:00") | 2026-11-12T14:00:00.000Z |
| T-TM-7 | isValidMuDate: 2026-02-30, 2026-2-3, "", 2028-02-29 | false, false, false, true |
| T-TM-8 | diffDays(2026-11-09, 2026-11-12) / reversed | 3 / -3 |

**Availability (`availability.ts`)**
| ID | Case | Expected |
|---|---|---|
| T-AV-1 | Tue 10, Wed 11 (notice 3) | too_soon |
| T-AV-2 | Thu 12 | available |
| T-AV-3 | Sun 15 | closed |
| T-AV-4 | today (9) and a past date (8) | too_soon |
| T-AV-5 | notice 5: Thu 12 / Sat 14 | too_soon / available |
| T-AV-6 | notice 0: today | available; today if closed weekday = 1 -> closed |
| T-AV-7 | block 20-22 Nov: 19, 20, 22, 23 | available, blocked, blocked, available |
| T-AV-8 | single-day block on Fri 13 | 13 blocked, 12 and 14 available |
| T-AV-9 | Sun 22 both blocked and closed | blocked |
| T-AV-10 | today Fri 13, Sun 15 (closed and too soon) | closed |
| T-AV-11 | closed [6,7] | Sat and Sun closed |
| T-AV-12 | closed [] | Sunday available |
| T-AV-13 | today+89 / today+90 | available / too_far |
| T-AV-14 | earliestDate Mon 9 notice 3 | 2026-11-12 |
| T-AV-15 | earliestDate with Thu 12 blocked | 2026-11-13 |
| T-AV-16 | earliestDate today Thu 12 notice 3 (Sun closed) | Mon 2026-11-16 |
| T-AV-17 | every day blocked in horizon | null |
| T-AV-18 | dayStatuses length / first date | 90 / today |
| T-AV-19 | now 2026-11-09T19:59Z vs 20:00Z, notice 3 | earliest Thu 12 vs Fri 13 |
| T-AV-20 | assertOrderable on closed day | throws DATE_UNAVAILABLE reason closed |
| T-AV-21 | assertOrderable "2026-02-30" | throws INVALID_DATE |
| T-AV-22 | noticeDaysFor([null, 5], 3) / ([1, null], 3) / ([], 3) / ([2], 3) / ([0], 3) | 5 / 3 / 3 / 2 / 0 |
| T-AV-23 | adminDateWarnings blocked Fri 13 / Sun 15 with today Fri 13 | ["blocked"] / ["closed","too_soon"]; never throws |

**Product availability**
| ID | Case (today 2026-12-25) | Expected |
|---|---|---|
| T-PRD-1 | available, no window | null |
| T-PRD-2 | window 12-01..12-25 | null (end day orderable) |
| T-PRD-3 | same window, today 12-26 | out_of_season |
| T-PRD-4 | window 12-26..12-31, today 12-25 | out_of_season; today 12-26 -> null |
| T-PRD-5 | sold_out | sold_out; visible true, orderable false |
| T-PRD-6 | hidden + sold_out | hidden; visible false |
| T-PRD-7 | out of window + sold_out | out_of_season |
| T-PRD-8 | window closed via UTC vs MU: now 2026-12-25T20:30Z (= 26 Dec MU) | out_of_season |

**Line pricing (`validateSelection`, `priceLine`, `fromPriceRs`)**
| ID | Case | Expected |
|---|---|---|
| T-PR-1 | Size S, qty 1 | unit 3000, total 3000 |
| T-PR-2 | Size M + chocolate, qty 1 / qty 2 | unit 3700; total 3700 / 7400 |
| T-PR-3 | M + candles + topper | unit 3900 |
| T-PR-4 | M + 3 extra cupcakes | unit 3650 |
| T-PR-5 | text option adds nothing | unit unchanged |
| T-PR-6 | promo sale 2400, M | unit 2900, originalUnit 3500, promotionId set |
| T-PR-7 | negative delta -500 on base 3000 | unit 2500 |
| T-PR-8 | base 100, delta -500 | throws LINE_NEGATIVE |
| T-PR-9 | base 0, delta 0 | total 0 allowed |
| T-PR-10 | qty 0, 51, 1.5, "2" string | issue `quantity` for each |
| T-PR-11 | qty 50 | ok |
| T-PR-12 | no Size chosen | issue required (Size); all issues listed, not first only |
| T-PR-13 | two Size choices | issue too_many |
| T-PR-14 | unknown choice id; choice from another group | issue unknown_choice |
| T-PR-15 | same add-on twice | issue duplicate |
| T-PR-16 | quantity pick 13 / -1 | issue quantity_range |
| T-PR-17 | Inscription 21 chars | issue too_long |
| T-PR-18 | cakeMessage exactly 40 / 41 graphemes | ok / too_long (limit 40) |
| T-PR-19 | 40 cake emoji; family emoji; "é" composed and decomposed | each counts 1 per cluster |
| T-PR-20 | message of spaces only | treated as absent |
| T-PR-21 | required text option empty | issue required |
| T-PR-22 | fromPriceRs P | 3000 (required Size min delta 0) |
| T-PR-23 | required Size S +200: from | 3200; with sale 2400 from = 2600 |
| T-PR-24 | non-integer / > 1,000,000 base or delta | INVALID_MONEY |

**Promotions**
| ID | Case | Expected |
|---|---|---|
| T-PM-1 | window 12 Nov 09:00-18:00 MU: 08:59:59.999 / 09:00:00.000 / 17:59:59.999 / 18:00:00.000 | not live / live / live / not live |
| T-PM-2 | active=false inside window | not live; status inactive |
| T-PM-3 | status before / after / inside | scheduled / ended / live |
| T-PM-4 | endsAt <= startsAt | never live |
| T-PM-5 | 20% on 3000 | 2400 |
| T-PM-6 | rounding: 15% of 1250, 15% of 1999, 10% of 995, 33% of 100 | 1063, 1699, 896, 67 |
| T-PM-7 | fixed sale 2500 on base 3000 | 2500 |
| T-PM-8 | sale >= base (3000, 3500) | null (no discount) |
| T-PM-9 | 99% of 1 | 0 |
| T-PM-10 | live 20% (2400) and live sale 2200 | 2200, promo = the second |
| T-PM-11 | 20% and 10% | 2400, not 2160 (no stacking) |
| T-PM-12 | equal prices, different startsAt / same startsAt | earlier start / lower id |
| T-PM-13 | promo not covering product; ended promo cheaper; inactive cheaper | ignored |
| T-PM-14 | liveBanner: two banner promos / card-only / both / none live | latest start / null / included / null |
| T-PM-15 | liveCards ordering | startsAt desc then id; banner-only excluded |
| T-PM-16 | percent 0 or 100 (invalid rows) | ignored |

**Basket and totals**
| ID | Case | Expected |
|---|---|---|
| T-BK-1 | lines 3700 + 7400, pickup, fee 200 | items 11100, fee 0, total 11100 |
| T-BK-2 | same, delivery | fee 200, total 11300 |
| T-BK-3 | delivery fee 0 setting | total = items |
| T-BK-4 | empty basket | items 0, fee 0, total 0 |
| T-BK-5 | sold-out line + valid line | sold-out line `problem: sold_out`, excluded from totals |
| T-BK-6 | hidden / out-of-season line | problem hidden / out_of_season |
| T-BK-7 | reconcileTotal(displayed = server) | ok |
| T-BK-8 | reconcileTotal(displayed one rupee lower; forged 1) | PRICE_CHANGED with server basket |
| T-BK-9 | product base edited after pricing | previously returned `PricedLine` objects are plain values (immutable, unchanged) |
| T-BK-10 | promotion ends between two priceBasket calls (now 17:59 vs 18:00) | totals differ by the discount |

**Property tests (fast-check):** `total == Σ lineTotal + fee`; `salePrice <= base` whenever a discount exists; `bestPromotion` equals the minimum over all live promos for any permutation of input; `dayStatus(d)` is available iff `earliestDate <= d`, not closed, not blocked, within horizon.

## Non-functional
- Performance: each function O(n) on tiny data; `dayStatuses(90)` < 1 ms; client bundle cost of `domain/pricing.ts` + `promotions.ts` + `time.ts` <= 6 kB gz (counts toward 170 kB).
- Accessibility: reasons are exposed as data so the UI can announce them (design-system date picker rules).
- Security: server never trusts client price; money bounds prevent overflow; no private block reason in any domain return type.
- Privacy: none.

## Rollout / flags
Flag: none · Rollback: redeploy; rules are deterministic and versioned with the code. Behaviour change in code updates this spec in the same change.

## Open Questions
- Product minimum quantity (Dessert Cups, min 6 in the prototype): add `product.min_quantity`? Recommended yes. Owner: product-manager with Sabera.
- Seasonal window and fulfilment date: **Resolved (owner, 2026-11-10):** judged on the pickup/delivery date.
- Does a quantity option group ever need more than one priced choice? Decided: one.
