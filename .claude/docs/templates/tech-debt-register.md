<!-- Template: tech-debt-register | Filled by: /tech-debt (lead-frontend, lead-backend) | Output: production/tech-debt.md -->
# Tech Debt Register

Updated: [YYYY-MM-DD]
<!-- Interest = ongoing cost of not fixing. Prioritise high interest / low effort. -->

| ID | Area | Description | Location | Interest (H/M/L) | Effort | Risk if ignored | Plan | Status |
|---|---|---|---|---|---|---|---|---|
| TD-[NNN] | [frontend/backend/infra/tests] | [WHAT] | [path:line] | [H] | [S/M/L] | [RISK] | [STORY / SPRINT] | [open] |

## Policy
- New debt taken deliberately gets a row and a reason in the same PR.
- Each sprint reserves [X%] capacity for debt.

## Paid off
| ID | Date | How |
|---|---|---|

## Sources to scan
<!-- /tech-debt reads these to find new candidates. -->
- `TODO` / `FIXME` / `HACK` markers in the code root
- Skipped or quarantined tests
- Outdated major dependencies (`/dependency-audit`)
- Review findings left open in `/review-code`
