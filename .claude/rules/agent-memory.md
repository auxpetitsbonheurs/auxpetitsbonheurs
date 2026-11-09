---
paths:
  - ".claude/agent-memory/**"
---

# Agent Memory Rules

- Memory holds durable, project-specific lessons (conventions discovered, decisions the user made, pitfalls), not session chatter
- One fact per bullet, dated, with the source (file, ADR, user decision)
- Never store secrets, credentials, personal data or customer data
- Remove entries that a newer decision contradicts
