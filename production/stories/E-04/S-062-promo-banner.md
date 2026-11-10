# S-062: Promo banner: show, dismiss, end by time
Status: ready
Epic: E-04-customer-site-browsing
Spec: docs/specs/features/catalogue-browsing.md#promo-banner-fr-002
Estimate: 3 pts
Owner: remix-specialist, tailwind-shadcn-specialist

## Story
As a customer, I want to see the current offer in a banner I can dismiss, so that I notice deals without being nagged for the whole visit.

## Acceptance Criteria
- [ ] AC1 (FR-002): Given a live promotion with placement banner or both, when any page loads, then the banner shows its title/text and links to its target (product `/menu/:slug`, category `/menu?type=`, custom_request `/custom-cake`; none = text only).
- [ ] AC2 (FR-002): Given two live banner promotions, when a page loads, then only the one with the latest `starts_at` shows (ties: lowest id).
- [ ] AC3 (FR-002): Given the visitor presses Dismiss (with or without JavaScript), when they open another page in the same visit, then the banner is not shown; in a new browser session it shows again; a different later promotion still shows.
- [ ] AC4 (FR-002, FR-016): Given a banner promotion with `ends_at` 18:00 Mauritius, when requests are made at 17:59:59 and 18:00:00 (fixed clock), then the first shows the banner and the second does not, with no job running.
- [ ] AC5 (FR-002): Given the banner links to a hidden product, when it renders, then it is text only (no link).
- [ ] AC6 (FR-002): Given an inactive promotion or one not yet started, when a page loads, then no banner shows.
- [ ] AC7 (FR-002): Given a forged `dismissBanner` with a non-uuid id, when posted, then `VALIDATION_FAILED` and the cookie is unchanged; the cookie holds at most 10 ids.
- [ ] AC8 (NFR-002, NFR-006): Given the banner at 320 px and 375 px, at 200% zoom and keyboard-only, when Dismiss and the link are used, then both are reachable, labelled (Dismiss has an accessible name such as "Dismiss offer: <title>"), >= 44 px, AA contrast per `docs/design/tokens.json`, and text wraps with no clipping.

## Tests
- AC1 → src/app/routes/root.test.ts
- AC2 → src/app/domain/promotions.test.ts
- AC3 → src/tests/e2e/promo-banner.spec.ts
- AC4 → src/app/routes/root.test.ts (fixed clock)
- AC5 → src/app/routes/root.test.ts
- AC6 → src/app/domain/promotions.test.ts
- AC7 → src/app/routes/root.test.ts
- AC8 → src/tests/e2e/promo-banner.spec.ts (axe, viewports, keyboard)

## Notes
- Uses `isLive`/`liveBanner` from S-082 (pure domain); if S-082 is not done, this story builds `liveBanner` minimal and S-082 widens it. Dependency noted, same epic family (E-05) so R9 flag: depends on S-082 or builds the stub.
- Decision: banner liveness is judged per request (no-store pages), no scheduled job.
- E-01 dependency: root loader, i18n. E-03 supplies promotion data.
