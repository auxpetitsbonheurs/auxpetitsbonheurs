---
paths:
  - "**/prisma/**"
  - "**/drizzle/**"
  - "**/migrations/**"
  - "**/schema.ts"
  - "**/schema.prisma"
  - "**/models.py"
  - "**/models/**"
  - "**/db/**"
  - "**/supabase/migrations/**"
---

# Database Rules

- Invariants live in the database: NOT NULL, FOREIGN KEY, UNIQUE, CHECK constraints
- Money as integer minor units (or DECIMAL) with a currency; timestamps as `timestamptz` in UTC
- Never edit a migration that has been applied anywhere; add a new one
- Breaking changes use expand → backfill → contract across separate releases
- Large tables: create indexes concurrently; add NOT NULL via nullable → backfill → constraint
- Every query filter, join and sort used on a hot path has an index; check with EXPLAIN
- No string-built SQL; use the ORM, parameters or tagged templates
- Multi-tenant tables carry a tenant key and every query scopes by it (or RLS enforces it)
- Supabase: RLS enabled with policies and policy tests for every table
- Generating a migration locally is fine; applying it to shared, staging or production databases is the user's call
