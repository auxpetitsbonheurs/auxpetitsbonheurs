---
paths:
  - "**/realtime/**"
  - "**/ws/**"
  - "**/sockets/**"
  - "**/socket/**"
  - "**/channels/**"
  - "**/sse/**"
---

# Realtime Code Rules

- Authenticate the connection; authorise every channel/room subscription on the server
- Validate and size-limit every inbound message; rate-limit per connection
- Clients reconnect with backoff and resume from the last event ID; handlers are idempotent
- Use pub/sub (Redis, Postgres NOTIFY, managed broker) so multiple instances share events
- The UI shows connection state and degrades to refresh/polling when realtime is unavailable
- Confirm the host supports long-lived connections before choosing WebSockets on serverless
