# S-127: Download an invoice PDF for any order, matching the client's template
Status: done
Epic: E-06-order-management
Spec: docs/architecture/api/contracts.md (`admin/invoice-data`, `admin/order-invoice`, `admin/settings` Invoice), docs/architecture/data-model.md#invoices-s-127-migration-0023
Estimate: 5 pts
Owner: fullstack-developer, ux-lead, test-engineer

## Story
As the Owner on my phone, I want one tap on an order to give me a PDF invoice in the customer's language, laid out like my paper invoice, so that I can send it by WhatsApp or email straight away.

## Acceptance Criteria
- [x] AC1: Given any order (website, manual, custom-cake quote), when an admin taps More actions → Download invoice, then "Preparing invoice…" shows at once and a PDF named `Invoice-<n>.pdf` downloads; Share (Web Share with the file) is offered where the phone supports it, with Download again and the printable page.
- [x] AC2: Given the PDF (A4 portrait), then it matches the template: business name, BRN, address and phone top left; the pink badge top right; a grey-blue band with INVOICE NO. and DATE (dd/mm/yyyy); BILL TO, EVENT DATE (ordinal, "5th November 2026") and INSTRUCTIONS (Delivery + address, or Pickup); the items table (QUANTITY, DESCRIPTION with options and message, UNIT PRICE RS, TOTAL RS, a Delivery row, empty ruled rows when short); SUBTOTAL, a promotion line when there was one, DOWNPAYMENT, TOTAL DUE; Payment Details, Payment Terms and the thank-you line.
- [x] AC3 (Owner decision 2026-11-14, full payment, no deposit): DOWNPAYMENT shows "Paid Rs X" once the order is marked paid (blank before); TOTAL DUE is the balance (Rs 0 when paid) and a PAID stamp shows beside the totals.
- [x] AC4: Given an order in French, then the labels are French (FACTURE N°, FACTURER À, DATE DE L'ÉVÉNEMENT, RESTE À PAYER…) and the date reads "5 novembre 2026" ("1er" on the first).
- [x] AC5: Given an order with no invoice yet, when its invoice is first generated, then it takes the next number from the Settings counter in one statement (never twice, also under concurrency) and stores it with the Mauritius date; regenerating keeps both.
- [x] AC6: Given the Worker's 10 ms CPU, then the PDF is built in the browser from admin-only JSON with pdf-lib in its own lazily loaded chunk; admin routes stay under the 170 kB budget.
- [x] AC7: Given the data cannot be fetched, then a calm message offers Try again and the printable page, and the order page stays as it was.
- [x] AC8: Given `/admin/orders/:id/invoice`, then a print-friendly page shows the same invoice (any admin; signed out → sign-in).
- [x] AC9: Given Admin → For Owners → Settings, then an Invoice section (Owner only) holds the legal name, BRN, invoice address and phone, bank name, account name and number (digits and spaces), payment terms and thank-you line (EN/FR) and the next invoice number (default 1108); the Juice number is the Payment section's. A next number already used is refused naming the lowest allowed; an unchanged one never turns the counter back.
- [x] AC10: Given the privacy note, then its legal name, BRN and address come from these Settings, with "[to be confirmed]" while empty.

## Tests
- AC2, AC3, AC4 → src/app/lib/invoice-pdf.test.ts (PDF text read back with pdf-lib), src/app/domain/invoice.test.ts (totals, rows, dates, formatting)
- AC5 → src/app/server/services/invoice.server.test.ts (numbering, concurrency on PGlite), tests/e2e/admin-invoice.spec.ts (parallel first invoices on a real Postgres)
- AC1, AC3, AC4, AC7 → tests/e2e/admin-invoice.spec.ts (download parsed with pdf-lib: number and total)
- AC8 → src/app/routes/admin/invoice-data.test.ts, tests/e2e/admin-invoice.spec.ts (admin only, print view axe)
- AC9 → src/app/routes/admin/settings.invoice.test.ts, tests/e2e/admin-invoice.spec.ts (axe, 375 px)
- AC10 → src/app/domain/privacy-facts.test.ts, src/app/routes/admin/settings.invoice.test.ts, tests/e2e/admin-invoice.spec.ts

## Implementation notes (2026-11-14)
- Fonts: the PDF standard fonts (Times for the template's serif, Helvetica for its small caps labels): nothing to download and every EN/FR letter prints; a character outside Latin-1 loses its accent or prints "?" rather than breaking the file.
- Badge: the v0.3 badge has no pink variant, so `public/brand/logo-badge-pink.svg` recolours it (soft #F9D9D9 disc, charcoal line art); the PDF draws it as vectors from that file.
- The printable page darkens the template's grey-blue band to #5F7279 so its white text meets AA contrast; the PDF keeps #A4B0B5 as on the paper template.
- pdf-lib (≈ 200 kB gzipped) loads only when More actions opens (preloaded then), never with a route.
- A custom-cake quote has no lines: it prints one "Custom cake" line at the quote less any delivery fee. A total set by hand prints an ADJUSTMENT line so the rows still add up.
- Workshop registrations: if they are `orders` rows, they work unchanged.
