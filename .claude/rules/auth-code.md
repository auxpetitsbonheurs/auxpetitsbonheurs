---
paths:
  - "**/auth/**"
  - "**/middleware.ts"
  - "**/middleware.js"
  - "**/hooks.server.ts"
  - "**/permissions/**"
  - "**/policies/**"
---

# Auth Code Rules

- Use the configured provider (`stack.auth`); never implement your own password hashing, token format or crypto
- Middleware is a convenience, not a guard: every handler re-checks authentication and authorisation
- One central authorisation layer (`can(user, action, resource)`); no ad-hoc role checks scattered in components
- Sessions: HttpOnly, Secure, SameSite cookies; rotate on login and privilege change; revoke on logout and password change
- OAuth: state + PKCE, exact redirect URI allowlist
- Error messages do not reveal whether an account exists
- Rate-limit login, signup, reset and MFA verification
- Log security events (login, failed login, MFA change, role change) without secrets
- Tests cover each role, the unauthenticated case, and cross-tenant access attempts
