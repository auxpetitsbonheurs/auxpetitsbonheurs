// S-200 AC5: two overlapping ticks alert each order once, because the marker is set in the same
// statement that selects the rows. Two connections to one PGlite instance are serialised, so the
// race is modelled by running both claims concurrently and checking each id is claimed once.
import { afterEach, beforeEach, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { Database } from "~/server/db.server";
import { placeTestOrder } from "~/server/testing/orders";
import { claimPendingAlerts } from "./pending-alerts";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

test("AC5: overlapping ticks claim every due order exactly once", async () => {
  for (let i = 0; i < 3; i += 1) {
    const placed = await placeTestOrder(database);
    await database.client.query("update orders set status = 'pending_approval', created_at = '2026-11-01T08:00:00Z' where tracking_token = $1", [placed.token]);
  }
  const context = { now: new Date("2026-11-05T08:00:00Z"), db: database.db as unknown as Database, supabase: { url: "https://ref.supabase.co", anonKey: "anon" } };

  const [first, second] = await Promise.all([claimPendingAlerts(context), claimPendingAlerts(context)]);

  const claimed = [...first, ...second];
  expect(claimed).toHaveLength(3);
  expect(new Set(claimed).size).toBe(3);
  const { rows } = await database.client.query("select 1 from order_event where type = 'pending_alert_sent'");
  expect(rows).toHaveLength(3);
});
