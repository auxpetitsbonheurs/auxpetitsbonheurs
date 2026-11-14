// S-200: admins nudged once when a website order waits over 24 hours (fixed clocks).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { Database } from "~/server/db.server";
import { placeTestOrder } from "~/server/testing/orders";
import { RecordingPusher, alertAdmin } from "~/server/testing/push";
import { pendingAlerts } from "./pending-alerts";

let database: TestDatabase;
let db: Database;

beforeEach(async () => {
  database = await createTestDatabase();
  db = database.db as unknown as Database;
}, 60_000);

afterEach(async () => {
  await database.close();
});

const PLACED = "2026-11-05T08:00:00Z";
const at = (minutesAfter: number) => new Date(new Date(PLACED).getTime() + minutesAfter * 60_000);
const H24 = 24 * 60;
const run = (pusher: RecordingPusher | null, now: Date) => pendingAlerts({ now, db, supabase: { url: "https://ref.supabase.co", anonKey: "anon" }, pusher });

/** A website order Pending approval since PLACED (or a custom request when `source` says so). */
async function pendingOrder(source: "website" | "custom_request" = "website") {
  const placed = await placeTestOrder(database, { overrides: { "contact.name": "Aisha Ramdin" } });
  const { rows } = await database.client.query<{ id: string }>(
    "update orders set status = 'pending_approval', source = $2, created_at = $3 where tracking_token = $1 returning id",
    [placed.token, source, PLACED],
  );
  return rows[0]!.id;
}

const events = async (orderId: string) =>
  (await database.client.query<{ type: string; actor_type: string }>("select type, actor_type from order_event where order_id = $1 and type = 'pending_alert_sent'", [orderId])).rows;
const status = async (orderId: string) => (await database.client.query<{ status: string }>("select status from orders where id = $1", [orderId])).rows[0]!.status;

describe("pendingAlerts (S-200)", () => {
  test("AC1: at 24 h 1 min each opted-in admin gets exactly one push opening the order; no status change; event pending_alert_sent", async () => {
    await alertAdmin(database);
    await alertAdmin(database, { locale: "fr" });
    const orderId = await pendingOrder();
    const pusher = new RecordingPusher();

    expect(await run(pusher, at(H24 + 1))).toEqual({ job: "pendingAlerts", ran: true, processed: 1 });

    expect(pusher.sent.map((s) => s.payload.url)).toEqual([`/admin/orders/${orderId}`, `/admin/orders/${orderId}`]);
    expect(pusher.sent.map((s) => s.payload.tag)).toEqual([`pending_24h:${orderId}`, `pending_24h:${orderId}`]);
    expect(await status(orderId)).toBe("pending_approval");
    expect(await events(orderId)).toEqual([{ type: "pending_alert_sent", actor_type: "system" }]);
  });

  test("AC2: approved or cancelled at 23 h: no push", async () => {
    await alertAdmin(database);
    const approved = await pendingOrder();
    const cancelled = await pendingOrder();
    await database.client.query("update orders set status = 'approved' where id = $1", [approved]);
    await database.client.query("update orders set status = 'cancelled' where id = $1", [cancelled]);
    const pusher = new RecordingPusher();

    await run(pusher, at(H24 + 60));

    expect(pusher.sent).toHaveLength(0);
  });

  test("AC3: the job runs again later: no second push", async () => {
    await alertAdmin(database);
    await pendingOrder();
    const pusher = new RecordingPusher();

    await run(pusher, at(H24 + 1));
    await run(pusher, at(H24 + 61));
    await run(pusher, at(3 * H24));

    expect(pusher.sent).toHaveLength(1);
  });

  test("AC4: a custom request waiting over 24 h is not alerted", async () => {
    await alertAdmin(database);
    await pendingOrder("custom_request");
    const pusher = new RecordingPusher();

    expect(await run(pusher, at(2 * H24))).toMatchObject({ processed: 0 });
    expect(pusher.sent).toHaveLength(0);
  });

  test("AC6: push off or deactivated: nothing; and no email for this alert", async () => {
    await alertAdmin(database, { push: false });
    await alertAdmin(database, { active: false });
    await pendingOrder();
    await database.client.query("delete from email_outbox");
    const pusher = new RecordingPusher();

    await run(pusher, at(H24 + 1));

    expect(pusher.sent).toHaveLength(0);
    expect((await database.client.query("select 1 from email_outbox")).rows).toHaveLength(0);
  });

  test("AC7: at exactly 23 h 59 min no alert; the next tick after 24 h alerts it", async () => {
    await alertAdmin(database);
    await pendingOrder();
    const pusher = new RecordingPusher();

    await run(pusher, at(H24 - 1));
    expect(pusher.sent).toHaveLength(0);

    await run(pusher, at(H24 + 59));
    expect(pusher.sent).toHaveLength(1);
  });

  test("AC8: an order reverted to Pending approval after its alert is not alerted again", async () => {
    await alertAdmin(database);
    const orderId = await pendingOrder();
    const pusher = new RecordingPusher();
    await run(pusher, at(H24 + 1));
    await database.client.query("update orders set status = 'approved' where id = $1", [orderId]);
    await database.client.query("update orders set status = 'pending_approval' where id = $1", [orderId]);

    await run(pusher, at(H24 + 120));

    expect(pusher.sent).toHaveLength(1);
  });

  test("while push is not configured nothing is marked, so the order is alerted once the keys are set", async () => {
    await alertAdmin(database);
    const orderId = await pendingOrder();

    expect(await run(null, at(H24 + 1))).toMatchObject({ processed: 0 });
    expect(await events(orderId)).toEqual([]);

    const pusher = new RecordingPusher();
    await run(pusher, at(H24 + 61));
    expect(pusher.sent).toHaveLength(1);
  });
});
