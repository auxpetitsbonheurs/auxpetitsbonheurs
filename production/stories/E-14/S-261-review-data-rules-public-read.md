# S-261: Review data, rules and public read
Status: ready
Epic: E-14-customer-reviews
Spec: docs/specs/features/bakery-reviews.md (to write) · Data: docs/architecture/data-model.md (add `review`)
Estimate: 5 pts
Owner: postgres-specialist, api-engineer, data-engineer

## Story
As the bakery, I want reviews stored with a clear status and strict rules, so that only approved reviews can ever be shown and every customer has at most one.

## Acceptance Criteria
- [ ] AC1 (FR-082): Given the migration (expand-only), then `review` has one row per customer (unique on the customer account), `rating` 1 to 5 (database check), `comment` 1 to 1000 characters after trim, `display_name` (first name and last initial), `status` in `pending`, `approved`, `rejected`, `hidden`, timestamps, `decided_by` and `decided_at`; no email, phone or order link is stored on it.
- [ ] AC2 (FR-082): Given a rating of 0, 6 or 3.5, or a comment of 0 or 1001 characters, then the rule rejects it with `VALIDATION_FAILED` (service) and the database check also refuses it.
- [ ] AC3 (FR-083, FR-085): Given reviews in all four statuses, when the public read runs, then only `approved` rows are returned, with `display_name`, `rating`, `comment`, date and nothing else (no ids of customers), newest first; pending, rejected and hidden never leave the server.
- [ ] AC4 (FR-085): Given approved reviews 5, 4 and 4 stars, then the aggregate returns average 4.3 (one decimal, rounded half up) and count 3; given none, then count 0 and no average; hidden and pending reviews do not count.
- [ ] AC5 (FR-082): Given a customer's name "Anna Kowalski", then the display name is "Anna K."; "Anna" alone gives "Anna"; a name with accents or two words in the first name ("Marie Claire Dupont") gives "Marie C."; extra whitespace is trimmed; empty names are refused (the form asks for a name first, S-262).
- [ ] AC6 (FR-083): Given the status rules, then allowed moves are: new → pending; pending → approved or rejected (admin); approved → hidden or pending (customer edit); hidden → approved (admin show); rejected → pending (customer edit); any other move returns `INVALID_TRANSITION`.
- [ ] AC7 (FR-083, NFR-003): Given anonymous or customer access, then row-level security and the server guard allow a customer to read and change only their own row, and only Owner or Admin sessions to decide; the public read uses a view or query that exposes only AC3 columns.
- [ ] AC8 (FR-085, NFR-001): Given the public read, then it uses one indexed query for the latest and one for the aggregate, cached 60 s per isolate and cleared in the isolate that saved a decision.

## Tests
- AC1 → src/tests/db/review-migration.test.ts
- AC2 → src/app/domain/review.test.ts, src/tests/db/review-migration.test.ts
- AC3 → src/app/server/repos/review.server.test.ts
- AC4 → src/app/domain/review.test.ts
- AC5 → src/app/domain/review.test.ts
- AC6 → src/app/domain/review.test.ts
- AC7 → src/tests/db/review-rls.test.ts
- AC8 → src/app/server/services/review.server.test.ts

## Notes
- Depends on: E-11 S-206/S-210 (customer account and name), S-001 skeleton schema pattern.
- Contract-first (lead-backend + lead-frontend) before S-262.
- Decision proposed: edit of an approved review returns it to `pending` and it disappears publicly until approved again.
