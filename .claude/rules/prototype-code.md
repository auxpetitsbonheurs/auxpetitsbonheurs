---
paths:
  - "prototypes/**"
---

# Prototype Code Rules

- Prototypes answer one question; the `README.md` states it and the finding
- Production standards are relaxed on purpose (no tests, hard-coded data); hooks only warn here
- A working prototype (`Type: working-prototype`) fakes auth, payments, email and AI with obvious toggles, uses deterministic seed data, and shows a permanent "Prototype" label
- Never import prototype code into `src/`; re-implement it properly through a story
- No real customer data, production credentials or live payment keys
