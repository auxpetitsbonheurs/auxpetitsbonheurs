<!-- Template: email-flow | Filled by: /email-flows (email-specialist, copywriter) | Output: docs/content/email/<flow-slug>.md -->
# Email Flow — [FLOW NAME]

Type: [transactional | lifecycle | marketing] · Provider: [resend | postmark | …] · Stream: [transactional | broadcast]
Goal: [WHAT THE FLOW ACHIEVES] · Metric: [OPEN/CLICK/ACTIVATION]

## Trigger & exit
- Trigger: [EVENT, E.G. signed_up] · Exit: [EVENT, E.G. project_created OR UNSUBSCRIBE]
- Suppression: [WHO NEVER RECEIVES IT]

## Sequence
| # | Delay | Condition | Subject | Preheader | Goal / CTA | Template |
|---|---|---|---|---|---|---|
| 1 | immediate | — | [SUBJECT] | [PREHEADER] | [CTA] | emails/[name].tsx |
| 2 | +2 days | not activated | [SUBJECT] | | | |

## Content per email
### Email [N]: [NAME]
- Body outline: [POINTS] · CTA: [LABEL → URL with UTM (marketing only)]
- Personalisation: [FIELDS, WITH FALLBACKS]

## Compliance & deliverability
- [ ] Consent basis: [CONTRACT / CONSENT] · [ ] One-click unsubscribe (marketing)
- [ ] Plain-text version · [ ] Dark mode check · [ ] Sender domain SPF/DKIM/DMARC
- [ ] Test sends to inbox capture only (Mailpit / provider sandbox)

## Localisation
[LOCALES, STRING KEYS]
