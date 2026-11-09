---
paths:
  - "**/billing/**"
  - "**/payments/**"
  - "**/checkout/**"
  - "**/webhooks/**"
  - "**/subscriptions/**"
  - "**/stripe/**"
---

# Payments Code Rules

- The provider is the source of truth; the app mirrors billing state through webhooks
- Webhooks: verify the signature on the raw body, reject stale timestamps, store event IDs and skip duplicates, tolerate out-of-order delivery
- Prices, plans and quantities come from the server/provider, never from the client
- Amounts in integer minor units with currency
- Gate features through one entitlement check derived from synced subscription state
- Never handle raw card data; use hosted checkout or provider elements
- Test mode keys only outside production; tests use fixtures and the provider's test clocks, never live calls
- Handle failure paths: payment failed, past due, cancelled, refunded, disputed
