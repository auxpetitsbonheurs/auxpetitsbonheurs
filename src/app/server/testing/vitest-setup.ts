// Every unit test starts with an empty per-isolate Settings cache (each test has its own,
// freshly reset database: app/db/testing/pglite.ts), and each file closes its database.
import { afterAll, beforeEach } from "vitest";
import { closeSharedTestDatabase } from "~/db/testing/pglite";
import { siteSettingsCache } from "~/server/repos/settings.server";

beforeEach(() => {
  siteSettingsCache.clear();
});

afterAll(async () => {
  await closeSharedTestDatabase();
});
