<!-- Template: feature-spec | Filled by: /feature-spec (product-manager, ux-lead, lead-backend, lead-frontend) | Output: docs/specs/features/<feature-slug>.md -->
# Feature Spec — [FEATURE NAME]

Status: [draft | review | approved] · Owner: [NAME] · Updated: [YYYY-MM-DD]
ADRs: [LINKS] · Epic: [E-NN]

## Summary
<!-- 2–3 sentences: what, for whom, why now. -->
[SUMMARY]

## Requirements trace
| PRD ID | Requirement | Covered by section |
|---|---|---|
| FR-[NNN] | [TEXT] | [UX / API / …] |

## UX
### Screens & states
| Screen | Route | Loading | Empty | Error | Success |
|---|---|---|---|---|---|
| [SCREEN] | [/path] | [SKELETON] | [COPY + CTA] | [MESSAGE + RETRY] | [CONFIRMATION] |
### Flow
[LINK TO docs/design/ux/<flow>.md OR SHORT STEP LIST]
### Copy
[KEY STRINGS OR LINK]

## API Contract
<!-- Contract first: frontend and backend both build against this. For REST, reference docs/architecture/api/openapi.yaml paths. For tRPC / server actions, give signatures here. -->
| Operation | Method / name | Input | Output | Errors | Auth |
|---|---|---|---|---|---|
| [CREATE X] | POST /api/[x] | [SCHEMA] | 201 [SCHEMA] | 400, 401, 403, 409 | [ROLE] |

## Data Model Changes
| Entity | Change | Fields / constraints / indexes | Migration notes |
|---|---|---|---|
| [ENTITY] | [add table / add column] | [DETAILS] | [EXPAND → BACKFILL → CONTRACT?] |

## Permissions matrix
| Action | Anonymous | Member | Admin | Owner |
|---|---|---|---|---|
| [VIEW X] | ✗ | ✓ (own org) | ✓ | ✓ |

## Analytics Events
| Event | Trigger | Properties (no PII) |
|---|---|---|
| [x_created] | [WHEN] | [plan, source] |

## Edge Cases
- [CONCURRENT EDITS / LIMITS / DELETED PARENT / TIMEZONES / LARGE INPUT / RETRIES]

## Acceptance Criteria
- AC1: Given [CONTEXT], when [ACTION], then [OUTCOME].
- AC2: Given [CONTEXT], when [ACTION], then [OUTCOME].

## Non-functional
- Performance: [ROUTE] within project.yaml budgets; API p95 ≤ [X ms]
- Accessibility: [WCAG 2.2 AA SPECIFICS]
- Security: [AUTHZ, RATE LIMITS, INPUT VALIDATION, THREAT-MODEL LINK]
- Privacy: [PERSONAL DATA TOUCHED, RETENTION, CONSENT]

## Rollout / flags
- Flag: [FLAG NAME | none] · Rollout: [% / ALLOWLIST] · Rollback: [HOW]

## Open Questions
- [QUESTION] — owner [NAME]
