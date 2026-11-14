# E-12: Real content, polish, testing, launch and handover

Status: planned · Milestone: beta (phase 6), launch (phase 7)
PRD: no new FRs; verifies NFR-001..012 and Appendix A · Specs: all
Release phase: 6 Real content and polish, 7 Testing, launch, handover

## Goal
The site carries the bakery's real content, meets the quality bar on a real phone, and is launched and handed over to the Owner.

## Success measure
Phase 6 exit: section 6 requirements met on a real mid-range phone. Phase 7 exit: the Owner placed a real test order as a customer and approved it as admin on her own phone, and every Handover item is ticked.

## Scope
- In: real products, photos, texts and FR translations; visual identity; share previews; privacy note and `[TO CONFIRM]` items (Data Protection Act 2017, retention, uptime); performance and accessibility audit (Lighthouse, WCAG 2.2 AA, 200% zoom, 320/375 px); Appendix A launch checklist; backup with a tested restore (NFR-005); domain, launch, walkthrough, handover checklist and sheet.
- **Recorded phone session before launch (design gate concern):** a test session with a customer on a real phone, with notes saved to `production/test-sessions/`, plus the keyboard/zoom/contrast/device checks missing from the 2026-11-10 session. Findings must be triaged before launch.
- Out: new features.

## Stories
| ID | Title | Status | Estimate |
|---|---|---|---|
| S-221 | The real menu, prices and photos replace the sample data | ready | 3 |
| S-222 | Real texts and natural French, reviewed by the Owner | ready | 3 |
| S-223 | The bakery's visual identity is applied and still accessible | ready | 3 |
| S-224 | Pretty share previews and good search basics | in-progress | 3 |
| S-225 | A short privacy note and every [TO CONFIRM] item settled | blocked (Owner) | 3 |
| S-226 | Performance meets the budget on a real mid-range phone | ready | 5 |
| S-227 | Accessibility audit: WCAG 2.2 AA, keyboard, zoom, contrast | in-progress | 5 |
| S-228 | Security review before launch | done (concerns) | 5 |
| S-229 | Privacy audit: data minimisation, cookies, emails and push | in progress | 3 |
| S-230 | Browsers and phones matrix, incl. admin push on iPhone and Android | in-progress | 3 |
| S-231 | Weekly automatic backups to bakery-owned storage | in-progress | 3 |
| S-232 | A backup is restored on a clean environment and verified | in-progress | 3 |
| S-233 | Everything stays on free plans except the domain | in-progress | 2 |
| S-234 | README and a one-page handover sheet | in-progress | 3 |
| S-235 | Staging and live deploy automatically, secrets in bakery accounts | in-progress | 3 |
| S-236 | Deploy-day checklist: real Juice number and pickup address | in-progress | 3 |
| S-237 | Appendix A launch test checklist passes on staging | in-progress | 5 |
| S-238 | Recorded test session with a customer on a real phone (gate concern 4) | ready | 5 |
| S-239 | Findings triaged and the launch gate decided | ready | 3 |
| S-240 | Launch: Owner real test order on her phone, walkthrough, handover | ready | 5 |

Total: 71 pts. Story files: `production/stories/E-12/`. Dependencies on E-01..E-11 (R9) not yet done.

## Dependencies
- E-01..E-11 complete (or cut items agreed); Owner availability for content and the test session.

## Risks
- Real content arriving late; Owner time for testing.
- Worker CPU decision outstanding from E-01 if borderline.
