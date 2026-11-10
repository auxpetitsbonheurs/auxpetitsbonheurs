// In-process Postgres for tests (PGlite): no Docker, no network, deterministic.
// Stubs the Supabase-owned objects our migrations reference (auth.users,
// storage.buckets, the anon/authenticated roles), then applies every migration
// in ./drizzle exactly as `npm run db:migrate` would. Never point this at a real database.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import * as schema from "~/db/schema";

export const migrationsFolder = fileURLToPath(new URL("../../../drizzle", import.meta.url));

const SUPABASE_STUBS = `
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    email_confirmed_at timestamptz
  );
  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null unique,
    public boolean default false,
    file_size_limit bigint,
    allowed_mime_types text[],
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );
  create role anon nologin;
  create role authenticated nologin;
`;

/** Mirrors Supabase's default grants, so RLS (not missing grants) is what denies access. */
const SUPABASE_GRANTS = `
  grant usage on schema public to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to anon, authenticated;
`;

export async function createTestDatabase() {
  const client = new PGlite();
  await client.exec(SUPABASE_STUBS);
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder });
  await client.exec(SUPABASE_GRANTS);
  return { client, db, close: () => client.close() };
}

export type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;
