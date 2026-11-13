// Every unit test starts with empty per-isolate Settings and promotions caches (each test has its own,
// freshly reset database: app/db/testing/pglite.ts), and each file closes its database.
import { afterAll, beforeEach } from "vitest";
import { closeSharedTestDatabase } from "~/db/testing/pglite";
import { promotionsCache } from "~/server/repos/promotions.server";
import { siteSettingsCache } from "~/server/repos/settings.server";

beforeEach(() => {
  siteSettingsCache.clear();
  promotionsCache.clear();
});

afterAll(async () => {
  await closeSharedTestDatabase();
});
