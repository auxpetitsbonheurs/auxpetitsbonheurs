// Loads the Owner's real menu on STAGING only (S-241). Run by the manual `seed-menu` GitHub
// workflow (staging environment); locally only against a staging copy:
//   APP_ENV=staging DATABASE_URL=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run seed:menu
// Insert-only by slug and safe to re-run. Prints names and outcomes, never a URL or a key.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MENU_PHOTOS_DIR } from "../app/db/menu-data";
import { createRequestDb } from "../app/server/db.server";
import { prepareMenuPhoto, signedPut } from "../app/server/services/menu-photos.server";
import { SeedMenuRefused, assertSeedAllowed, seedMenu } from "../app/server/services/seed-menu.server";
import { supabaseStorage } from "../app/server/storage.server";

const REQUIRED = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

try {
  assertSeedAllowed(process.env.APP_ENV);
} catch (error) {
  fail(error instanceof SeedMenuRefused ? error.message : "seed:menu refused.");
}
const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) fail(`Missing: ${missing.join(", ")}. Nothing was written.`);

const photosDir = resolve(import.meta.dirname, "..", "..", MENU_PHOTOS_DIR);
const storage = supabaseStorage({ url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! });
const requestDb = createRequestDb(process.env.DATABASE_URL!);
try {
  const report = await seedMenu(requestDb.db, {
    appEnv: process.env.APP_ENV,
    now: new Date(),
    runId: randomUUID(),
    uploads: { ...storage, put: signedPut() },
    storage,
    photo: async (file) => prepareMenuPhoto(await readFile(resolve(photosDir, file))),
  });
  for (const line of report.lines) console.log(`${line.name} (/menu/${line.slug}): ${line.outcome}${line.status ? `, ${line.status}` : ""}`);
  console.log(`\nPrices to enter (${report.pricesToEnter.length}):${report.pricesToEnter.map((n) => `\n- ${n}`).join("") || " none"}`);
  console.log(`\nMissing content (${report.missing.length}):${report.missing.map((n) => `\n- ${n}`).join("") || " none"}`);
} catch (error) {
  // The message only: a driver error could quote the connection string in its details.
  console.error(`seed:menu failed: ${error instanceof Error ? error.message.replace(/postgres(ql)?:\/\/\S+/g, "[database url]") : "unknown error"}`);
  process.exitCode = 1;
} finally {
  await requestDb.close();
}
