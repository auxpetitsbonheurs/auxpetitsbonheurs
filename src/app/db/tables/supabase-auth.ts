import { pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Supabase-managed `auth.users`, declared only so foreign keys can point at it
 * and server scripts can look a user up by email. Deliberately NOT re-exported
 * from ../schema.ts, and drizzle.config.ts filters to `public`, so drizzle-kit
 * never tries to create or alter it.
 */
const authSchema = pgSchema("auth");
export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
  email: text("email"),
  emailConfirmedAt: timestamp("email_confirmed_at", { withTimezone: true }),
});
