import { defineConfig } from "drizzle-kit";
import { withLibpqSslModes } from "./app/lib/pg-url";

// Migrations are generated locally and applied with `npm run db:migrate`.
// DATABASE_URL comes from the shell or .env (never committed); see .env.example.
// drizzle-kit uses node-postgres when it is installed: keep libpq's sslmode meaning (app/lib/pg-url.ts).
export default defineConfig({
  dialect: "postgresql",
  schema: "./app/db/schema.ts",
  // Supabase owns auth/storage schemas; only manage our tables.
  schemaFilter: ["public"],
  out: "./drizzle",
  dbCredentials: { url: withLibpqSslModes(process.env.DATABASE_URL ?? "") },
});
