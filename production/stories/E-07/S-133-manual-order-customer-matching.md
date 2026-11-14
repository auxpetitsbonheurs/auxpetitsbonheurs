# S-133: Manual order finds the existing customer
Status: done
Epic: E-07-manual-orders-calendar-prep
Spec: docs/specs/features/admin-manual-orders.md#data-model-changes
Estimate: 3 pts
Owner: remix-specialist, postgres-specialist, test-engineer, ui-engineer

## Story
As an admin, I want the form to find a returning customer by phone or email, so that I never create a duplicate customer record.

## Acceptance Criteria
- [x] AC1 (FR-057): Given a customer stored with phone 57123456, when I type "+230 5712 3456" (or "5712 3456", "230-5712-3456") and leave the field, then lookup returns that customer ("Existing customer: Anna Rault, 4 orders. Use details?") and saving creates no new customer row.
- [x] AC2 (FR-057): Given an existing customer email in different case, when I type it, then the same customer is matched and reused.
- [x] AC3 (FR-057): Given no match, when saved, then exactly one new customer row is created with the entered details and no auth account.
- [x] AC4 (FR-057): Given a match, when I tap "Use this customer", then the name is filled and typed phone/email stay as typed; given I keep a different typed name, then the order keeps the typed name snapshot and the customer record name is unchanged.
- [x] AC5 (FR-057): Given email and phone match different customers, then the email match is used and a notice is shown (`conflict: true`).
- [x] AC6 (FR-057): Given a matched customer without email and an entered email, when saved, then the order `contact_email` is the entered email while `customer.email` and `customer.auth_user_id` are unchanged.
- [x] AC7 (FR-057): Given `findCustomer` with neither phone nor email, then `VALIDATION_FAILED`; given a match, then the response holds only id, name, phone, email, locale and orderCount, at most one match.
- [x] AC8 (FR-057): Given the lookup fails (network), then "Could not search, you can still continue." shows and Save still works; given no match, nothing is shown.
- [x] AC9 (FR-041, FR-039): Given a customer or anonymous session, when calling `findCustomer`, then it is refused; Admin and Owner succeed.
- [x] AC10 (NFR-002): Given keyboard and screen reader, then the match card is announced via a polite status region, "Use this customer" is a real button reachable by Tab, the lookup spinner has a text label, targets are 44 px, contrast meets AA per `docs/design/tokens.json`, and the layout holds at 320/375 px and 200% zoom.

## Tests
- AC1 → src/app/domain/customer-match.test.ts
- AC2 → src/app/domain/customer-match.test.ts
- AC3 → src/app/routes/admin.orders.new.test.tsx
- AC4 → src/app/routes/admin.orders.new.test.tsx
- AC5 → src/app/domain/customer-match.test.ts
- AC6 → src/app/routes/admin.orders.new.test.tsx
- AC7 → src/app/routes/admin.orders.new.test.tsx
- AC8 → src/app/routes/admin.orders.new.test.tsx
- AC9 → src/app/routes/admin.orders.new.test.tsx
- AC10 → src/tests/e2e/admin-manual-order.a11y.spec.ts

## Notes
- Depends on S-131. Security rule (threat-model G-02): never write an entered email onto an existing customer row.
- E.164 normalisation with +230 default is shared with FR-021 (E-05/E-11); reuse the domain helper if it exists, else create it here.

## As built (2026-11-14, manual job)
- `findCustomer` is `POST /admin/customer-lookup` (JSON resource route) called with `fetch` once typing pauses (600 ms) on a valid phone or email, rather than on blur: a failure only shows "Could not search, you can still continue." and Save keeps working (AC8).
- Phone matching compares digits, so "+230 5712 3456", "5712 3456", "230-5712-3456" and a stored "57123456" are the same (`domain/customer-match`). The oldest customer with that number wins.
- "Use this customer" fills the name and the confirmation language; phone and email stay as typed; the order is saved for the matched customer either way.
