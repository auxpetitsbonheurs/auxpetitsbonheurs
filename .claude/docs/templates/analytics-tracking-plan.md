<!-- Template: analytics-tracking-plan | Filled by: /analytics-plan (analytics-engineer, growth-lead) | Output: production/analytics/tracking-plan.md -->
# Analytics Tracking Plan

Tool: [posthog | plausible | ga4] · Consent required in: [privacy.regions] · Updated: [YYYY-MM-DD]
Naming: `object_action`, snake_case, past tense (`project_created`). No PII in properties.

## Questions this plan answers
1. [WHAT % OF SIGNUPS ACTIVATE WITHIN 7 DAYS?]

## Metrics
| Metric | Definition | Events used | Target |
|---|---|---|---|
| North Star | [DEFINITION] | | [TARGET] |
| Activation | [% NEW USERS WHO … WITHIN N DAYS] | signed_up, [value_event] | |
| Retention | [W4 RETENTION] | [EVENT] | |
| Conversion | [TRIAL → PAID] | checkout_completed | |

## Events
| Event | Trigger | Client/server | Properties (type) | Question # | Owner |
|---|---|---|---|---|---|
| signed_up | account created | server | method (string), plan (string) | 1 | analytics-engineer |
| [object_action] | | | | | |

## Identity
- Anonymous ID → identify on signup/login with [INTERNAL USER ID, NOT EMAIL]
- Group / org analytics: [YES/NO, KEY]

## Exclusions
- Internal/test users: [HOW] · Bots: [HOW]

## Dashboards
- [DASHBOARD NAME] — [METRICS]

## QA
- [ ] Events verified in debug view on preview · [ ] Consent off → no tracking
