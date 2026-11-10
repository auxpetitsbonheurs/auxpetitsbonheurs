import { defineConfig } from "drizzle-kit";

// Migrations are generated locally and applied with `npm run db:migrate`.
// DATABASE_URL comes from the shell or .env (never committed); see .env.example.
export default defineConfig({
  dialect: "postgresql",
  schema: "./app/db/schema.ts",
  // Supabase owns auth/storage schemas; only manage our tables.
  schemaFilter: ["public"],
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
