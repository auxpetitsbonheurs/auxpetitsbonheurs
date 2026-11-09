---
name: db-migration
description: "Creates a safe database migration with the project's ORM or migration tool: designs the change, generates it locally, reviews the SQL, plans expand/contract for breaking changes, and writes rollback notes. Never applies migrations to shared, staging or production databases. Use for any schema change."
argument-hint: "<change description>"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, AskUserQuestion, Agent, Bash(bash .claude/scripts/*), Bash(npx prisma migrate dev --create-only*), Bash(npx prisma generate*), Bash(npx drizzle-kit generate*), Bash(alembic revision*), Bash(python manage.py makemigrations*), Bash(php artisan make:migration*), Bash(bin/rails generate migration*)
model: sonnet
---

# DB Migration

Schema changes are the one kind of code that can destroy data. This skill
generates and reviews the migration **locally** and prints the deploy step for
the user. It never runs `migrate deploy`, `db push`, `migrate reset`,
`supabase db push` or anything that touches a shared database.

## Inputs

- The change (argument) and the story/spec it serves
- `docs/architecture/data-model.md` (update it alongside)
- `project.yaml → stack.database`, `stack.orm`, `.claude/docs/stack-matrix.md` (migration commands)
- Existing migrations folder (`prisma/migrations`, `drizzle/`, `alembic/versions`, `*/migrations`, `database/migrations`, `db/migrate`)

## Phases

### Phase 1: Design

Spawn `data-engineer` (+ the data specialist for the stack) to propose the change:
columns, types, constraints, indexes, defaults, and the data impact.

Classify it:
- **Additive** (new table, nullable column, new index): one migration.
- **Breaking** (rename, drop, type change, NOT NULL on existing data): **expand →
  migrate → contract** across separate deploys:
  1. Expand: add the new column/table; code writes both.
  2. Backfill: batched data migration (script or job), idempotent.
  3. Switch reads to the new shape.
  4. Contract: drop the old column in a later release.

Show the plan and ask "Proceed?"

### Phase 2: Generate locally

Update the schema file (Prisma schema, Drizzle tables, SQLAlchemy/Django/Eloquent/
ActiveRecord models), then generate with the stack's **create-only/generate**
command (e.g. `npx prisma migrate dev --create-only --name <slug>`,
`npx drizzle-kit generate`, `alembic revision --autogenerate -m`,
`python manage.py makemigrations`). Ask before each write and command.

### Phase 3: Review the SQL

Read the generated SQL and check:
- no unintended `DROP` or table rewrite
- large tables: indexes `CONCURRENTLY` (Postgres), no long locks; NOT NULL added after backfill
- defaults that are cheap (no volatile defaults rewriting big tables)
- foreign keys indexed; constraints named
- RLS policies for new tables on Supabase

Report findings; fix and regenerate as needed.

### Phase 4: Rollback and docs

Write a rollback note in the migration folder or the story's `## Notes`:
the reverse migration or the follow-up migration that undoes it, and whether
data can be lost. Update `docs/architecture/data-model.md`. Ask before writing.

### Phase 5: Hand off

Tell the user the commands to apply it, in order:
- local: `npx prisma migrate dev` (or equivalent), which they may let you run on the local dev DB
- deploy: the CI/deploy step (e.g. `npx prisma migrate deploy` run by the pipeline), **after a backup**

## Next step

Back to `/dev-story` for the code that uses the new schema.
