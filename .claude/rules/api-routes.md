---
paths:
  - "**/api/**"
  - "**/route.ts"
  - "**/route.js"
  - "**/routes/**"
  - "**/server/**"
  - "**/controllers/**"
  - "**/handlers/**"
  - "**/views.py"
  - "**/routers/**"
---

# API Route Rules

- The contract (`docs/architecture/api/` or the feature spec's API section) is authoritative; change it first, with lead-frontend and lead-backend agreeing
- Order in every handler: parse & validate input (schema) → authenticate → authorise (incl. object/tenant ownership) → do work → shape output
- Return the contract's error shape (problem+json or the project's standard) with correct status codes; never leak stack traces
- List endpoints paginate (cursor preferred) and cap `limit`
- Mutations that clients may retry accept an idempotency key
- Rate-limit authentication, signup, password reset, OTP and expensive endpoints
- Outbound calls have timeouts; failures are mapped, logged with context and never hang the request
- Log with a request ID; never log credentials, tokens, card data or unnecessary PII
- Each endpoint has integration tests: success, validation error, unauthenticated, forbidden, not found
