<!-- Template: security-review | Filled by: /security-audit (security-lead) | Output: production/audits/security-YYYY-MM-DD.md -->
# Security Review — [SCOPE] — [DATE]

Reviewer: security-lead · Commit: [SHA] · Verdict: [PASS | CONCERNS | FAIL]
<!-- Never paste secrets into this report; give file:line only. -->

## Summary
| Severity | Count |
|---|---|
| Critical | [N] |
| High | [N] |
| Medium | [N] |
| Low / info | [N] |

## Findings
| ID | Severity | Category (OWASP) | Location | Description | Exploit scenario | Fix |
|---|---|---|---|---|---|---|
| SEC-01 | [High] | [A01 Broken Access Control] | [path:line] | [MISSING ORG CHECK ON GET /projects/:id] | [USER A READS ORG B DATA] | [SCOPE QUERY BY org_id + TEST] |

## Checklist
- [ ] Authn + object-level authz on every route/action
- [ ] Input validation at boundaries; output encoding; no unsafe HTML sinks with user data
- [ ] Parameterised queries only
- [ ] CSRF protection for cookie-auth mutations; SameSite cookies
- [ ] Rate limits on auth and expensive endpoints
- [ ] Security headers: CSP, HSTS, X-Content-Type-Options, Referrer-Policy, frame-ancestors
- [ ] CORS allowlist; no wildcard with credentials
- [ ] Secrets: none in repo/logs/client bundle; `.env.example` complete
- [ ] Webhooks signature-verified and idempotent
- [ ] File uploads: type/size limits, safe storage and serving
- [ ] SSRF: outbound fetches to user-supplied URLs restricted
- [ ] Dependencies: no known high/critical CVEs (see deps audit)
- [ ] Logging excludes PII/tokens; audit log for admin actions

## Accepted risks (user decision)
| Finding | Reason | Decided by | Date |
|---|---|---|---|
