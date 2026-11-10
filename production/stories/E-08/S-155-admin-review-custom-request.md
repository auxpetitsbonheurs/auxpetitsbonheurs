# S-155: Admin sees a new custom request with photos
Status: ready
Epic: E-08-custom-requests-quotes
Spec: docs/specs/features/custom-requests-quotes.md#ux
Estimate: 3 pts
Owner: remix-specialist, baas-specialist, tailwind-shadcn-specialist, test-engineer

## Story
As an admin, I want a new custom request to show up quickly in To review with its photos and details, so that I can price it the same day.

## Acceptance Criteria
- [ ] AC1 (FR-028): Given a request submitted with 2 photos, then within 10 s (p95) it appears in Orders > To review labelled "Quote needed" and admins with alerts receive a push and an email.
- [ ] AC2 (FR-028): Given I open the request, then I see all form fields (occasion, date, window, servings, flavours, theme, text, budget, details, fulfilment, contact) and a photo grid served by 10-minute signed URLs.
- [ ] AC3 (FR-028): Given a request with no photos, then the photo area shows "No photos".
- [ ] AC4 (FR-028, NFR-004): Given a customer, anonymous or tracking-token session, then request photos are not visible and signed URLs are never issued; Admin and Owner can view.
- [ ] AC5 (FR-028): Given an expired signed URL, when the page stays open, then reloading renews it and no broken-image gap remains (alt text "Reference photo n").
- [ ] AC6 (FR-028): Given an email provider outage, then the request is still saved and admins alerted, and an `email_failed` event shows on the order after 6 failed tries.
- [ ] AC7 (FR-028): Given To review is empty, then "Nothing to review" shows; given a load failure, then Retry shows.
- [ ] AC8 (NFR-002, NFR-006): Given keyboard use and 320/375 px at 200% zoom, then the photo grid items are buttons that open an accessible lightbox (focus trapped, Escape closes, unique names "Open photo 2 of 5"), targets are 44 px, contrast meets AA per `docs/design/tokens.json`, and no horizontal scroll occurs.

## Tests
- AC1 → src/tests/e2e/custom-request.spec.ts
- AC2 → src/app/routes/admin.orders.$id.test.tsx
- AC3 → src/app/routes/admin.orders.$id.test.tsx
- AC4 → src/app/routes/admin.orders.$id.test.tsx
- AC5 → src/app/routes/admin.orders.$id.test.tsx
- AC6 → src/app/routes/admin.orders.$id.test.tsx
- AC7 → src/app/routes/admin.orders.test.tsx
- AC8 → src/tests/e2e/admin-request.a11y.spec.ts

## Notes
- Depends on S-151, S-153, E-06 (admin order detail, To review tab), E-10 (push/email alerts; stubbed via outbox until then, so the 10 s AC1 push/email part is verified for real only after E-10; the admin list part is verifiable now).
- The 10 s target is the epic's J5 measure; measured in the e2e with a p95 over 20 runs against local DB.
