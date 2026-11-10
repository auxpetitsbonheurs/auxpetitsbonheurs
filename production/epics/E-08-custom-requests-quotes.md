# E-08: Custom cake requests and quotes

Status: planned · Milestone: MVP
PRD: FR-028, FR-029, FR-030, FR-031, FR-032, FR-033 (NFR-003) · Specs: docs/specs/features/custom-requests-quotes.md
Release phase: 4 Order management (part 3)

## Goal
A customer requests a bespoke cake with photos, receives a quote, and accepts it; expired quotes close themselves.

## Success measure
J5: request appears in admin within 10 s (p95), quote sent, accepted, Approved order on the calendar; an expired quote cannot be accepted and closes within 24 h.

## Scope
- In: custom form (FR-028), photo upload rules JPEG/PNG/WebP/HEIC, 10 MB, up to 5, shrink before upload, server cap 1 MB (FR-029), send quote or decline (FR-030), accept/decline from email link or tracking (FR-031), daily auto-close (FR-032), re-send quote replacing the old (FR-033, Should). Spam protection and rate limits on the public form. A11y acceptance criteria on the form and photo picker.
- Out: email content (E-10; stubbed through the outbox until then).

## Stories
| ID | Title | Status | Estimate |
|---|---|---|---|
| (to be created by /create-stories E-08) | | draft | |

## Dependencies
- E-05 (tracking, availability), E-06 (admin actions).

## Risks
- HEIC conversion on mid-range phones; test on real devices.

## Cuttable
- FR-033 is Should; not in the PRD cut order. Candidate to defer if needed (confirm with product-director).
