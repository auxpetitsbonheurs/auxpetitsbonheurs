// Makes the confirmed Supabase Auth user OWNER_EMAIL the active Owner (make-owner workflow).
// Run by .github/workflows/make-owner.yml with the environment's database URL; see
// app/server/services/make-owner.server.ts. Output never contains the database URL.
//   APP_ENV=staging DATABASE_URL=… OWNER_EMAIL=… [OWNER_NAME=…] npm run make:owner
import { createRequestDb } from "../app/server/db.server";
import { runMakeOwner } from "../app/server/services/make-owner.server";

process.exitCode = await runMakeOwner({
  env: process.env,
  connect: (input) => createRequestDb(input.DATABASE_URL),
  log: (line) => console.log(process.env.GITHUB_ACTIONS === "true" && line.startsWith("make-owner failed") ? `::error::${line}` : line),
});
