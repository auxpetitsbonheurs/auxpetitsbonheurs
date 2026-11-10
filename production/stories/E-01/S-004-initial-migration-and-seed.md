# S-004: Initial migration 0000 with slug history, plus launch seed
Status: ready
Epic: E-01-walking-skeleton
Spec: docs/architecture/data-model.md#migration-plan
Estimate: 5 pts
Owner: postgres-specialist, data-engineer

## Story
As the bakery's developer, I want one reviewed initial migration that already includes every table, so that the database starts right and no later epic needs a rushed schema change.

## Acceptance Criteria
- [ ] AC1 (NFR-013): Given `src/app/db/tables/catalogue.ts`, when the schema is loaded, then it exports `product_slug_history` (`slug` text PK, `product_id` uuid FK to `product` ON DELETE CASCADE, `created_at` timestamptz default now) with RLS enabled, and the schema has exactly 24 tables. This is written BEFORE the first `drizzle-kit generate` (carry-over concern 1).
- [ ] AC2 (NFR-013): Given the schema from AC1, when `drizzle-kit generate` is run for the first time, then exactly one generated migration, `0000`, exists, it creates all 24 tables including `product_slug_history`, and it enables row level security on every one.
- [ ] AC3 (NFR-013, FR-024): Given a hand-written follow-up migration `0001`, when all migrations run on an empty Postgres, then `settings` holds one row with: delivery fee Rs 200, pickup address containing "Beau Bassin", a clearly fake placeholder Juice number, default notice 3 days, closed weekday Sunday, windows Morning 09:00-12:00, Afternoon 12:00-17:00, Evening 17:00-20:00, quote validity 5, cake message max 40, evening reminder 18:00, order prefix `APB-`; and `counter` holds `order_number` = 0.
- [ ] AC4 (NFR-003): Given the migrations applied, when a second `settings` row is inserted, then the singleton check refuses it; when two orders get the same number, tracking token or idempotency key, then the unique constraints refuse it.
- [ ] AC5 (NFR-004, NFR-003): Given RLS on and no policies, when the `anon` role selects from `orders`, `customer` or `settings`, then it gets no rows or a permission error.
- [ ] AC6 (NFR-012): Given the README "Deploy" section, then it says migrations are applied with `npm run db:migrate` to staging first, then production, before the deploy that needs them; this story applies nothing to a shared database.
- [ ] AC7 (NFR-009): Given `0001`, then the two Storage buckets `public-images` and `request-photos` are created with MIME types `image/jpeg, image/png, image/webp` and a 1 MB limit, and `request-photos` is private.

## Tests
- AC1 → src/app/db/schema.test.ts (extend: table count 24, slug history columns, FK cascade, RLS)
- AC2 → src/app/db/migrations.test.ts (reads `drizzle/0000_*.sql` and the journal)
- AC3 → src/app/db/migrations.test.ts (integration: applies migrations in a Postgres container)
- AC4 → src/app/db/migrations.test.ts
- AC5 → src/app/db/migrations.test.ts (creates an `anon` role in the container)
- AC6 → src/app/lib/readme.test.ts
- AC7 → src/app/db/migrations.test.ts (Storage tables are stubbed in the container; asserts the SQL text for bucket rows)

## Notes
- Depends on: S-003.
- Launch values: Juice number is a fake placeholder until deploy day (use `5000 0000` and add "replace Juice number" to the README launch checklist); exact pickup street address is not in the specs, only "Beau Bassin" (spec gap, owner to supply; editable later in Settings, E-03).
- `schema.test.ts` currently expects >= 20 tables; tighten to exactly 24.
- Order of work matters: table added to the Drizzle schema, test red, then generate.
- Migration log in data-model.md is updated in the same change.
