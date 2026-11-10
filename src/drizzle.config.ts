import { defineConfig } from "drizzle-kit";

// Migrations are generated locally and applied with `npm run db:migrate`.
// DATABASE_URL comes from the shell or .env (never committed); see .env.example.
export default defineConfig({
  dialect: "postgresql",
  schema: "./app/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
