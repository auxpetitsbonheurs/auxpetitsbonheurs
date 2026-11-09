<!-- Template: prd | Filled by: /write-prd (product-manager) | Output: docs/product/prd.md -->
# PRD — [PRODUCT NAME]

Version: [0.1] · Status: [draft | review | approved] · Owner: [NAME] · Updated: [YYYY-MM-DD]
Brief: docs/product/brief.md

## 1. Problem & context
[PROBLEM STATEMENT, EVIDENCE]

## 2. Users
- Personas: [LINKS TO docs/product/personas/*]
- Primary job to be done: [JTBD]

## 3. Goals & success metrics
| Goal | Metric | Target | Timeframe |
|---|---|---|---|
| [ACTIVATION] | [% NEW USERS WHO …] | [X%] | [30 DAYS AFTER LAUNCH] |

## 4. Scope
### MVP (in)
- [FEATURE]
### Later
- [FEATURE]
### Non-goals
- [EXPLICITLY NOT DOING]

## 5. Functional requirements
<!-- Stable IDs: specs and stories trace to them. -->
| ID | Requirement | Priority (Must/Should/Could) | Persona |
|---|---|---|---|
| FR-001 | [The user can …] | Must | [PERSONA] |

## 6. Non-functional requirements
| ID | Area | Requirement |
|---|---|---|
| NFR-001 | Performance | Key routes meet project.yaml budgets (LCP ≤ [2.5s], INP ≤ [200ms], CLS ≤ [0.1]) |
| NFR-002 | Accessibility | [WCAG 2.2 AA] |
| NFR-003 | Security | [AUTHZ ON EVERY MUTATION, RATE LIMITS …] |
| NFR-004 | Privacy | [REGIONS, CONSENT, RETENTION] |
| NFR-005 | Availability | [TARGET UPTIME] |
| NFR-006 | Browsers/devices | [LAST 2 VERSIONS, MOBILE FIRST] |
| NFR-007 | i18n | [LOCALES] |

## 7. Key user journeys
1. [JOURNEY NAME]: [STEP → STEP → OUTCOME] (critical journey: [yes/no])

## 8. Monetisation (if applicable)
[PLANS, TRIALS, LIMITS]

## 9. Integrations & dependencies
- [AUTH / PAYMENTS / CMS / AI / EMAIL PROVIDERS]

## 10. Risks & assumptions
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|

## 11. Release plan
- MVP: [DATE] — [EXIT CRITERION]

## 12. Open questions
- [QUESTION] — owner [NAME]
