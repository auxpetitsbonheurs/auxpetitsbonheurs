import { pgSchema, uuid } from "drizzle-orm/pg-core";

/**
 * Supabase-managed `auth.users`, declared only so foreign keys can point at it.
 * Deliberately NOT re-exported from ../schema.ts, and drizzle.config.ts filters
 * to `public`, so drizzle-kit never tries to create or alter it.
 */
const authSchema = pgSchema("auth");
export const authUsers = authSchema.table("users", { id: uuid("id").primaryKey() });
