# E-04: Customer site: browsing

Status: planned · Milestone: MVP
PRD: FR-002, FR-003, FR-004, FR-005, FR-007, FR-008, FR-009, FR-010 (NFR-001, 002, 006, 010) · Specs: docs/specs/features/catalogue-browsing.md
Release phase: 3 Customer site and checkout (part 1)

## Goal
Customers browse the bilingual site on a phone: Home, Menu with filters, Product page with options, Gallery, About, Contact and FAQ.

## Success measure
Home and menu load under 3 s on a mid-range phone over 4G and meet the project.yaml budgets (Lighthouse perf >= 90, LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1, JS <= 170 kB gz per route). Lighthouse accessibility >= 95.

## Scope
- In: promo banner (FR-002), footer from Settings (FR-003), Home (FR-004), Menu grid and combining filters (FR-005), Product page with live server-priced options and Add to basket (FR-007), message-on-cake limit client and server (FR-008), Gallery with "Request something similar" (FR-009, Should), About/Contact/FAQ with EN fallback (FR-010), 301 redirect from old product slugs using `product_slug_history`, share previews (NFR-010). A11y acceptance criteria on these first customer UI stories: keyboard, 200% zoom, contrast, 320/375 px, no prototype stepper-label or aria-label-copy defects; swipe galleries have a non-swipe alternative.
- Out: basket, dates and checkout (E-05); the custom form itself (E-08; E-04 only links to it with the photo).

## Stories
| ID | Title | Status | Estimate |
|---|---|---|---|
| (to be created by /create-stories E-04) | | draft | |

## Dependencies
- E-01 (i18n, schema), E-03 (data and sample content). FR-009 depends on E-08 for the form.

## Risks
- Performance budgets with image-heavy pages; lazy-load and resize.

## Cuttable
- FR-009 Gallery "Request something similar" is Should but not in the PRD cut order; cut last, if at all.
