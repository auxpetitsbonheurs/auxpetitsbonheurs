# E-14: Bakery reviews

Status: planned · Milestone: MVP (phase 5, after customer accounts) · Added 2026-11-12 (Owner request; scope change recorded in docs/product/prd.md v0.4)
PRD: FR-082, FR-083, FR-084, FR-085, FR-086 (PRD section 5.10; all Should) (NFR-002, 003, 004, 007) · Specs: to write (docs/specs/features/bakery-reviews.md) before S-261
Release phase: 5 Notifications and accounts (after E-11)

## Goal
Signed-in customers leave one star rating and comment about the bakery; the bakery approves every review before anyone sees it; Home and a Reviews page show the approved ones.

## Owner request and lead decisions (2026-11-12)
Owner request: a general review section for the bakery (not per product). Only signed-in customers post; a review is 1 to 5 stars plus a comment; nothing is public until an Owner or Admin approves it; Admin has a "Reviews to approve" list with Approve and Reject and a count badge like To review.

Lead decisions (recorded, product-director to confirm the cut-order position):
1. **Where shown:** a section on Home (average rating and the latest approved reviews) plus a public Reviews page (`/reviews`) linked from that section and from the footer. Not an 8th navigation item (the Owner fixed the 7 in E-13).
2. **Limits:** one review per customer, editable; an edit goes back to approval (and is hidden publicly until approved again). Comment 1 to 1000 characters, plain text, escaped. Posting and editing are rate-limited.
3. **Public display:** first name and last initial, plus the date ("Anna K., 12 Nov 2026"). Nothing else (no email, phone, order data).
4. **Removing:** an Admin or Owner can hide an approved review later (and show it again).
5. **Search engines:** AggregateRating structured data only if policy-safe. Assessment: search-engine guidelines treat a business's own reviews of itself on its own site as not eligible for star rich results (self-serving), so no markup is published (PRD question 18). The visible average on the page is unaffected. To be re-checked against the current Google Search Central guidelines at build.
6. **Privacy:** a customer can delete their own review at any time (Mauritius Data Protection Act 2017, `[TO CONFIRM]` regime, PRD question 12); account deletion removes reviews.
7. **Who moderates:** Owner and Admin (not Owner-only), like menu and gallery.

## Dependency check: does E-11 provide customer sign-in?
Yes. E-11 gives customer sign-up with email confirmation (S-206), sign-in with password (S-207), one-time link (S-208) and a profile with name (S-210). Reviews need S-206, S-207 and S-210 (name for the display name). Consequences:
- E-14 cannot ship before those three stories; it sits after E-11 in phase 5.
- If customer accounts are cut (PRD section 11 cut order), reviews are cut too; reviews are cut before accounts (proposed).
- Sign-up and magic-link emails need working email (E-10, Resend; Resend is deferred until a custom domain exists). Until then the review flow is tested with the sender mocked and cannot be tried end to end on staging by a real new customer.
- The sign-in redirect must return to the review form (`next` parameter, as S-206 uses `next=`); same-site paths only.

## Success measure
A signed-in customer posts a review in under 1 minute on a phone; the Owner approves it from the admin app in two taps and it shows on Home and `/reviews` within 60 s; an unapproved or hidden review never appears on any public page, in `GET /api/menu`, or in the sitemap.

## Scope
- In: review data and rules, write/edit/delete my review, admin approval list (Approve, Reject), count badge, hide/show, Home section, Reviews page with footer link, privacy handling, accessibility and journey sweep.
- Out: per-product reviews, photos in reviews, replies by the bakery, review emails and reminders (E-10 later), star rich results, importing reviews from other sites, reviews by guests, report/flag by visitors.

## Stories
| ID | Title | Status | Estimate |
|---|---|---|---|
| S-261 | Review data, rules and public read | ready | 5 |
| S-262 | Write, edit and delete my review | ready | 5 |
| S-263 | Admin: Reviews to approve with Approve and Reject | ready | 5 |
| S-264 | Reviews to approve count badge | ready | 2 |
| S-265 | Hide and show a published review | ready | 3 |
| S-266 | Reviews section on Home | ready | 3 |
| S-267 | Public Reviews page and footer link | ready | 3 |
| S-268 | Reviews privacy: delete, account deletion, no rating markup | ready | 2 |
| S-269 | Reviews accessibility, language, performance and journey sweep | ready | 3 |

Total: 31 pts. Files: `production/stories/E-14/`. Story numbers S-261 to S-275 reserved for this epic (S-270 to S-275 spare); next free number after the block: S-276.

Build order: S-261 → S-262 → S-263 → S-264 → S-265 → S-266 → S-267 → S-268 → S-269.

## Dependencies
- E-11 S-206, S-207, S-210 (customer sign-in and name); E-02 S-021 (customer session never opens admin); S-023 rate-limit helper; S-033 admin frame and S-034 badge pattern (`admin/layout` loader `badges`, contracts.md); S-059 plain-text component; S-061 footer (new link); E-04 S-063 Home (new section); E-13 S-253 sitemap (Reviews page entry).
- Contract-first: lead-backend and lead-frontend add the review actions, `admin/reviews` loader/actions and the `badges.reviewsToApprove` field to `docs/architecture/api/contracts.md` before S-262/S-263/S-264.
- Permissions: add rows to the matrix in docs/specs/features/admin-access-team.md (Reviews: Admin and Owner).

## Risks
- Abuse and fake reviews: only confirmed signed-in accounts, one per account, rate limits, approval before display.
- Defamation or personal data in comments: Admin can reject or hide; comment is plain text; the DPA review (PRD Q12) is open.
- Low volume early on: the Home section is omitted until one review is approved (no empty box).
- Cannot be proven end to end on staging until email works (Resend deferred).

## Cuttable
- Entire epic is Should. Proposed cut position: just before customer accounts (after Save my details). Needs product-director confirmation.

## Open questions
1. Is the reviewer's display name captured from the profile at post time (proposed: snapshot, refreshed on edit) or live from the profile?
2. Should a rejected review show the customer a reason? Proposed: no reason is stored for the customer; the customer sees "Not published" and can edit and resubmit.
3. Minimum comment length? Proposed: 1 character after trim (a star rating plus a short line is welcome).
4. Retention of reviews after the customer's last order or account inactivity (PRD Q12).

## Lead decisions on open questions (2026-11-12)
- Cut order: as proposed (reviews are cut just before accounts).
- Display name is a snapshot taken when the review is approved.
- An edited review stays hidden until it is approved again.
- A rejected or hidden review shows the customer only "Not published".
- Retention follows PRD Q12 (open).
