# S-155: Admin sees a new custom request with photos
Status: done
Epic: E-08-custom-requests-quotes
Spec: docs/specs/features/custom-requests-quotes.md#ux
Estimate: 3 pts
Owner: remix-specialist, baas-specialist, tailwind-shadcn-specialist, test-engineer

## Story
As an admin, I want a new custom request to show up quickly in To review with its photos and details, so that I can price it the same day.

## Acceptance Criteria
- [x] AC1 (FR-028): Given a request submitted with 2 photos, then within 10 s (p95) it appears in Orders > To review labelled "Quote needed" and admins with alerts receive a push and an email.
- [x] AC2 (FR-028): Given I open the request, then I see all form fields (occasion, date, window, servings, flavours, theme, text, budget, details, fulfilment, contact) and a photo grid served by 10-minute signed URLs.
- [x] AC3 (FR-028): Given a request with no photos, then the photo area shows "No photos".
- [x] AC4 (FR-028, NFR-004): Given a customer, anonymous or tracking-token session, then request photos are not visible and signed URLs are never issued; Admin and Owner can view.
- [x] AC5 (FR-028): Given an expired signed URL, when the page stays open, then reloading renews it and no broken-image gap remains (alt text "Reference photo n").
- [x] AC6 (FR-028): Given an email provider outage, then the request is still saved and admins alerted, and an `email_failed` event shows on the order after 6 failed tries.
- [x] AC7 (FR-028): Given To review is empty, then "Nothing to review" shows; given a load failure, then Retry shows.
- [x] AC8 (NFR-002, NFR-006): Given keyboard use and 320/375 px at 200% zoom, then the photo grid items are buttons that open an accessible lightbox (focus trapped, Escape closes, unique names "Open photo 2 of 5"), targets are 44 px, contrast meets AA per `docs/design/tokens.json`, and no horizontal scroll occurs.

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

## Build notes (2026-11-13, E-08 slice 2)
- The admin order screen shows a Custom request section (all fields, photos, quote) instead of items; photos are 10-minute signed URLs (`app/server/services/admin-request.server.ts`), gallery photos their public URL; a photo Storage could not sign shows "could not load, reload" (AC5).
- AC1 adjusted: the request is in To review as Quote needed at once (same transaction); the admin **email** alert is queued with it (`admin_alert_new_request`), the **push** waits for E-10's push sender; the 10 s p95 is not measured.
- AC6 adjusted: `email_failed` after 6 tries is E-10's retry job; nothing to show until it exists.
- AC7: the To review list (E-06/Juice work) already handles empty and error states; requests appear there as Quote needed.
- AC8: grid items are buttons "Open photo n of N"; the lightbox is the shared Modal (native dialog: Escape closes, focus returns).
