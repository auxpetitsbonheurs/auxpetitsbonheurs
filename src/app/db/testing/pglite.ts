// In-process Postgres for tests (PGlite): no Docker, no network, deterministic.
// Stubs the Supabase-owned objects our migrations reference (auth.users,
// storage.buckets, the anon/authenticated roles), then applies every migration
// in ./drizzle exactly as `npm run db:migrate` would. Never point this at a real database.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import * as schema from "~/db/schema";
import { SUPABASE_GRANTS, SUPABASE_STUBS } from "./supabase-stubs";

export const migrationsFolder = fileURLToPath(new URL("../../../drizzle", import.meta.url));

export async function createTestDatabase() {
  const client = new PGlite();
  await client.exec(SUPABASE_STUBS);
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder });
  await client.exec(SUPABASE_GRANTS);
  return { client, db, close: () => client.close() };
}

export type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;
