<!-- Template: feature-spec | Written at build (E-14, 2026-11-13) from the epic's Owner request and lead decisions -->
# Feature Spec — Bakery reviews

Status: built (E-14 slice, 2026-11-13) · Owner: product-manager · Epic: E-14 (`production/epics/E-14-customer-reviews.md`)
Sources: PRD v0.4 §5.10 (FR-082..FR-086), epic lead decisions 2026-11-12, `docs/architecture/api/contracts.md` "Reviews" (v0.41), `docs/architecture/data-model.md` (`review`, `review_event`).

## Summary
Signed-in customers leave one review of the bakery (1 to 5 stars and a comment). Nothing is public until an Owner or Admin approves it. Home shows the average and the latest 3 approved reviews; `/reviews` lists them all. Admins can reject, hide, show again and (on request) delete. Customers can edit (back to approval) or delete their review at any time.

## Requirements trace
| PRD ID | Requirement | Covered by |
|---|---|---|
| FR-082 | Signed-in customers write, edit, delete one review | `/reviews/write`, S-262 |
| FR-083 | Approval before display; Approve/Reject; badge | `/admin/reviews`, S-263, S-264 |
| FR-084 | Hide and show a published review | S-265 |
| FR-085 | Home section and Reviews page | S-266, S-267 |
| FR-086 | Privacy: what is shown, deletion, no rating markup | S-268 |

## UX
| Screen | Route | Empty | Error | Success |
|---|---|---|---|---|
| Write / edit | `/reviews/write` (`/fr/...`) | Signed out: "Sign in to leave a review" with Sign in and Create account (return here) | Field errors with a summary; rate limit wait | "Thank you. Your review will appear after we approve it." (focus); own status "Waiting for approval" / "Published" / "Not published" |
| Reviews | `/reviews` | "No reviews yet. Be the first." + Write a review (page noindex) | Error with Retry | Average + count, 10 at a time, "Show more" link (`?shown=20`) |
| Home section | `/` | Omitted (no empty box) | Omitted silently | "What our customers say": average, latest 3 (160 characters + Read more), See all, Write a review |
| Admin Reviews | More > Reviews (`/admin/reviews`) | "Nothing to approve." | Admin error boundary with Retry | Tabs To approve (n) / Published / Not published; Approve (Undo 10 s), Reject (confirm), Hide (confirm), Show, Delete (confirm, not published only) |

Display name: first word and the initial of the second word of the profile name ("Anna K."), taken when sent and refreshed when approved. Stars always come with text ("4 of 5"). Comments are plain text with line breaks, shown with `lang` when written in the other language.

## API contract
See contracts.md "Reviews" (v0.41).

## Data model
`review` (one per customer, cascade with the customer row; rating 1..5; comment 1..1000 trimmed; display name; locale; status; decided_by/at; version) and `review_event` (approve, reject, hide, show, delete, undo; admin id; never text). Migration 0018.

## Permissions
| Action | Anonymous | Customer | Admin | Owner |
|---|---|---|---|---|
| Read approved reviews | ✓ | ✓ | ✓ | ✓ |
| Write / edit / delete own review | ✗ (sign-in prompt; action 401) | ✓ own only | ✗ (403) | ✗ (403) |
| Approve, reject, hide, show, delete | ✗ | ✗ | ✓ | ✓ |

## Non-functional
- Public read: one indexed query for the latest and one for the aggregate, cached 60 s per isolate, cleared in the isolate that changed a review. Server-rendered; no client JS on `/reviews` beyond the deferred frame.
- Rate limit: 5 sends or edits per hour per account (RL-review).
- Logs: account or admin id and the action only.
- No `Review` or `AggregateRating` structured data (self-serving reviews are not eligible; PRD question 18).

## Open questions
- Retention after account inactivity (PRD Q12). Account self-deletion is not in v1: the database cascade deletes reviews when a customer row is removed.
- The privacy note has no public page yet; the form's note links to it once the page exists.
