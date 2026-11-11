// Review fix (S-023): rate-limit buckets are purged on the hourly tick (data-model
// retention: 1 day), so failed sign-in spam cannot grow the Free-plan database for ever.
import { afterEach, beforeEach, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { Database } from "~/server/db.server";
import { RL_AUTH, consumeRateLimit } from "~/server/rate-limit.server";
import { purgeRateLimits } from "./purge-rate-limits";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

test("deletes buckets older than one day and reports how many", async () => {
  const db = database.db as unknown as Database;
  await consumeRateLimit(db, RL_AUTH, { action: "admin.signIn", parts: ["a@example.com", "1"] }, new Date("2026-11-10T07:00:00Z"));
  await consumeRateLimit(db, RL_AUTH, { action: "admin.signIn", parts: ["b@example.com", "1"] }, new Date("2026-11-12T07:00:00Z"));

  const result = await purgeRateLimits({ now: new Date("2026-11-12T08:00:00Z"), db, supabase: { url: "https://ref.supabase.co", anonKey: "anon" } });

  expect(result).toEqual({ job: "purgeRateLimits", ran: true, processed: 1 });
  expect((await database.client.query("select count(*)::int as n from rate_limit_bucket")).rows).toEqual([{ n: 1 }]);
});
