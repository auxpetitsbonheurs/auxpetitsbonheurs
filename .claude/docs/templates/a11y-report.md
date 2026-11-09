<!-- Template: a11y-report | Filled by: /a11y-audit (accessibility-specialist) | Output: production/audits/a11y-YYYY-MM-DD.md -->
# Accessibility Audit — [DATE]

Standard: [WCAG 2.2 AA] · Scope: [PAGES / JOURNEYS] · Tools: [axe-core, Playwright, keyboard, VoiceOver/NVDA]
Verdict: [PASS | CONCERNS | FAIL]

## Summary
- Automated: [N] violations ([critical N / serious N / moderate N / minor N])
- Manual: [N] issues · Pages tested: [N]

## Findings
| ID | Page / component | WCAG SC | Severity | Issue | Evidence (selector / file:line) | Fix |
|---|---|---|---|---|---|---|
| A11Y-01 | [/signup] | [1.3.1 Info and Relationships] | [serious] | [INPUT WITHOUT LABEL] | [#email, src/…:42] | [ADD <label for>] |

## Manual checks
- [ ] Keyboard: every action reachable, logical order, visible focus, no traps
- [ ] Screen reader: landmarks, headings, labels, live announcements
- [ ] Zoom 200% / reflow at 320px without loss
- [ ] Contrast (light and dark), non-colour cues
- [ ] Reduced motion respected; no flashing
- [ ] Forms: errors announced and linked; required indicated
- [ ] Media: captions / alt text

## Passed
- [AREAS WITH NO ISSUES]

## Recommendations
1. [FIX AT COMPONENT LEVEL: …]
