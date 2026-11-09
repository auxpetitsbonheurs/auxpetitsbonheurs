<!-- Template: launch-checklist | Filled by: /launch-checklist (release-manager) | Output: production/releases/<version-or-date>/checklist.md (first public launch) -->
# Launch Checklist — [PRODUCT] — [TARGET DATE]

Owner: release-manager · Go/no-go decided by: the user · Verdict: [GO | NO-GO]
<!-- Each item: ✓ done, ✗ missing, n/a with reason. Link evidence. -->

## Audits (production/audits/)
- [ ] Performance — budgets met on key routes ([LINK])
- [ ] Accessibility — no critical/serious issues ([LINK])
- [ ] Security — no open critical/high ([LINK])
- [ ] Dependencies — no known critical/high CVEs ([LINK])
- [ ] SEO ([LINK]) · [ ] Privacy ([LINK])

## Quality
- [ ] All critical journeys pass in Playwright against the production build
- [ ] No open S1/S2 bugs · [ ] Cross-browser + mobile check done

## Legal & privacy
- [ ] Privacy policy, terms, cookie policy published (reviewed by the user / counsel)
- [ ] Consent banner blocks non-essential scripts until opt-in where required
- [ ] Imprint / company details where legally required
- [ ] Accessibility statement (if required)

## Analytics & monitoring
- [ ] Analytics installed per tracking plan; internal traffic excluded; consent-aware
- [ ] Error tracking (client + server) with release + source maps
- [ ] Uptime checks on home, login, core API; alerts route to the user
- [ ] Structured logs retained [N] days

## Infrastructure
- [ ] Production env vars set in the host's secret store; `.env.example` up to date
- [ ] Database backups automated; restore tested on [DATE]
- [ ] Migrations applied and verified; seed/test data absent
- [ ] Rate limits on auth and expensive endpoints

## Domain, DNS & transport
- [ ] DNS records correct (apex + www), TTLs lowered before cut-over
- [ ] TLS certificate valid, auto-renewing · [ ] HSTS enabled (preload considered)
- [ ] Canonical host redirect (www ↔ apex, http → https)

## Web essentials
- [ ] Custom 404 and 500 pages (correct status codes)
- [ ] Redirects for any changed/legacy URLs (301)
- [ ] Favicon set, apple-touch-icon, web app manifest
- [ ] Open Graph / Twitter card tags and OG images on key pages
- [ ] sitemap.xml and robots.txt correct; previews noindex
- [ ] Security headers (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, frame-ancestors)

## Email
- [ ] SPF, DKIM, DMARC set for the sending domain · [ ] Transactional templates tested in major clients
- [ ] Bounce/complaint handling · [ ] Unsubscribe on marketing email

## Payments (if applicable)
- [ ] Live keys in secret store (set by the user) · [ ] Webhook endpoint registered and verified
- [ ] Test purchase + refund done in live mode by the user

## Rollback
- [ ] Previous deploy can be restored in one step: [HOW]
- [ ] Database rollback / forward-fix plan: [PLAN]
- [ ] Status / comms plan if launch goes wrong: [PLAN]

## Launch-day
- [ ] Smoke check (`/smoke-check`) on production · [ ] Monitoring watched for [N] hours
