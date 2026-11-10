import { resetDatabase } from "./database";

/** Resets and seeds the e2e database once per run, before any spec. */
export default async function globalSetup() {
  await resetDatabase();
}
