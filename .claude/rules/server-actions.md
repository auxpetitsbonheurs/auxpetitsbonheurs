---
paths:
  - "**/actions/**"
  - "**/actions.ts"
  - "**/*.server.ts"
  - "**/*.server.js"
  - "**/+page.server.ts"
  - "**/+server.ts"
---

# Server Action / Loader Rules

- Server actions, form actions and loaders are public HTTP endpoints: validate input and check authz inside each one, every time
- Never trust hidden form fields or client-supplied IDs for ownership; re-load the record and check it belongs to the user/tenant
- Return typed field errors for validation failures; redirect or revalidate on success
- Revalidate exactly what changed (path/tag), not the whole site
- Keep business logic in domain modules; the action only orchestrates
- Mark server-only modules (`server-only`, `$lib/server`, `.server.ts`) so they cannot be imported by client code
