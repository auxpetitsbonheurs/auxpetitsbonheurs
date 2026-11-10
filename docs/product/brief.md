# Project Brief: Aux petits bonheurs ordering website and admin app

Updated: 2026-11-10 · Owner: Sabera Shaik Joomun (bakery Owner)
Derived only from the client documents below. `[ASSUMPTION]` marks anything inferred.

Detailed references:
- Client build brief (source of truth, Business rules win): `docs/product/build-brief.md`
- Client feature plan: `docs/product/feature-plan.md`
- Requirements (FR/NFR IDs): `docs/product/prd.md`

## Problem
Aux petits bonheurs, a home bakery in Mauritius, takes orders by hand over Instagram DMs (plus calls and walk-ins). Dates, prices, options, allergens and cake messages are retyped and can be misread. There is no single view of what to bake each day, and the work can't be shared with helpers. No baseline numbers exist (orders per week, DM handling time, error rate).

## Target users
- **Customer (guest or account):** orders from a phone, mostly arriving from Instagram, in English or French.
- **Owner (Sabera):** runs everything from her phone; controls settings, availability and team.
- **Admin (helper):** invited by the Owner; runs orders, calendar, menu, promotions; no Settings, Availability or Team.

## Solution
A bilingual (EN/FR), phone-first public ordering site and a private installable admin app (PWA with push). Customers browse cakes, cupcake boxes, desserts and seasonal specials, pick options with a live price, choose an available date, and send an order that stays Pending approval until the Owner approves it. Custom cakes go through a quote-first flow. Website, custom and manual orders share one list, calendar and prep list. Payment stays as today (Juice or cash on delivery or pickup); the app records paid/unpaid only.

## Why now
The client commissioned the build on 2026-11-09. The briefs give no other trigger; `[ASSUMPTION]` the pain grows as Instagram-driven order volume grows.

## Differentiation
Not a market play. The value is fit to this bakery: owner approval gate on every order, any-channel orders in one place, per-product notice and blocked dates (no daily cap), bilingual by default, and no running cost beyond the domain.

## Riskiest assumptions
1. Customers will order on the site instead of DMing, and the owner will move manual DM orders into it (north star: >= 90% of orders recorded in the system, PRD proposal, to confirm).
2. Free plans (about 100 emails/day, 1 GB photos, no paid messaging) are enough, and push works on both iPhone and Android installed apps.
3. Owner approval turnaround is fast enough that customers don't abandon (PRD proposes median <= 4 hours).
4. Open owner inputs still unconfirmed: delivery fee, pickup address, Juice number, domain name.
5. Owner confirmed on 2026-11-10 (overriding the build brief defaults): 3-day notice, Sunday closed, time windows kept, 5-day quote validity, cancellation free until 48h before; all editable in Settings.

## Constraints
- Currency Rs, whole rupees ("Rs 1,250"); time zone Indian/Mauritius (UTC+4) for all dates, deadlines and reminders.
- No online payment; no paid messaging (emails only, WhatsApp as a pre-filled link).
- Free plans that allow commercial use; only the domain name is paid.
- Bakery owns every account and all code (created with the bakery's email); standard, documented tools; handover list and 3-month aftercare.
- Quality: 375 px phone first, home/menu under 3 s on mid-range 4G, EN/FR everywhere, accessible, server-side role checks, weekly backups to bakery-owned storage.
- Out of scope in v1: online payment, automatic WhatsApp/SMS, daily cap, promo codes, gift cards, loyalty, reviews, area-based delivery fees, extra admin roles.
- Delivery follows seven build phases (Foundations to Launch and handover); stack is chosen in ADR-0001.

## Success measures
Proposed in the PRD (section 3), pending owner confirmation:
- >= 90% of orders recorded in the system within 60 days of launch.
- >= 80% of website orders placed without a follow-up question.
- Checkout completion >= 40% (baseline to confirm).
- Zero orders lost or with a wrong price or date caused by the system.
- Monthly running cost Rs 0 excluding domain.
- Owner can change products, prices, photos, dates and settings with no developer.
- Launch gate: owner places a real test order as a customer and approves it as admin on her own phone.
