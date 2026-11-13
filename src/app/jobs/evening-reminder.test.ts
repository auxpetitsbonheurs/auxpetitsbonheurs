// S-198: the 18:00 reminder with tomorrow's confirmed order count (Mauritius time, fixed clocks).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { Database } from "~/server/db.server";
import { placeTestOrder } from "~/server/testing/orders";
import { RecordingPusher, alertAdmin } from "~/server/testing/push";
import { eveningReminder, inReminderWindow } from "./evening-reminder";

let database: TestDatabase;
let db: Database;

beforeEach(async () => {
  database = await createTestDatabase();
  db = database.db as unknown as Database;
}, 60_000);

afterEach(async () => {
  await database.close();
});

// Mauritius is UTC+4 all year: 18:00 MU on Wed 11 Nov = 14:00Z. Tomorrow = Thu 12 Nov.
const MU = (time: string, day = "2026-11-11") => new Date(`${day}T${time}:00+04:00`);
const TOMORROW = "2026-11-12";
const run = (pusher: RecordingPusher | null, now: Date) => eveningReminder({ now, db, supabase: { url: "https://ref.supabase.co", anonKey: "anon" }, pusher });

async function ordersFor(date: string, statuses: string[]) {
  for (const status of statuses) {
    const placed = await placeTestOrder(database);
    await database.client.query("update orders set status = $2, fulfil_on = $3 where tracking_token = $1", [placed.token, status, date]);
  }
}

const claimed = async (day = "2026-11-11") => (await database.client.query("select 1 from job_run where job = 'evening_reminder' and run_key = $1", [day])).rows.length === 1;

describe("eveningReminder (S-198)", () => {
  test("AC1, AC9: 3 confirmed orders tomorrow: one push per admin, in their language, opening tomorrow's prep list; no email", async () => {
    await alertAdmin(database, { locale: "en" });
    await alertAdmin(database, { locale: "fr" });
    await ordersFor(TOMORROW, ["approved", "in_preparation", "ready_for_pickup"]);
    await database.client.query("delete from email_outbox");
    const pusher = new RecordingPusher();

    await run(pusher, MU("18:00"));

    expect(pusher.sent.map((s) => s.payload.title).sort()).toEqual(["Demain : 3 commandes", "Tomorrow: 3 orders"]);
    expect(new Set(pusher.sent.map((s) => s.payload.url))).toEqual(new Set([`/admin/calendar/${TOMORROW}/prep`]));
    expect((await database.client.query("select 1 from email_outbox")).rows).toHaveLength(0);
  });

  test("one order reads in the singular", async () => {
    await alertAdmin(database);
    await ordersFor(TOMORROW, ["approved"]);
    const pusher = new RecordingPusher();

    await run(pusher, MU("18:00"));

    expect(pusher.sent[0]!.payload.title).toBe("Tomorrow: 1 order");
  });

  test("AC2: 0 confirmed orders tomorrow: no push, the run key is still claimed", async () => {
    await alertAdmin(database);
    const pusher = new RecordingPusher();

    await run(pusher, MU("18:00"));

    expect(pusher.sent).toHaveLength(0);
    expect(await claimed()).toBe(true);
  });

  test("AC3: two runs in the 18:00 hour: one push per admin", async () => {
    await alertAdmin(database);
    await ordersFor(TOMORROW, ["approved"]);
    const pusher = new RecordingPusher();

    await run(pusher, MU("18:00"));
    await run(pusher, MU("18:30"));
    await run(pusher, MU("19:00"));

    expect(pusher.sent).toHaveLength(1);
  });

  test("AC4: a missed 18:00 tick still sends at 20:00; nothing at 21:00 or later", async () => {
    await alertAdmin(database);
    await ordersFor(TOMORROW, ["approved"]);
    await ordersFor("2026-11-13", ["approved"]);
    const pusher = new RecordingPusher();

    await run(pusher, MU("20:00"));
    expect(pusher.sent).toHaveLength(1);

    await run(pusher, MU("21:00", "2026-11-12"));
    expect(pusher.sent).toHaveLength(1);
    expect(await claimed("2026-11-12")).toBe(false);
  });

  test("AC5: the count is the confirmed set (approved..completed); pending, awaiting payment and stopped orders are not counted", async () => {
    await alertAdmin(database);
    await ordersFor(TOMORROW, ["approved", "completed", "out_for_delivery", "pending_approval", "awaiting_payment", "cancelled", "declined"]);
    const pusher = new RecordingPusher();

    await run(pusher, MU("18:00"));

    expect(pusher.sent[0]!.payload.title).toBe("Tomorrow: 3 orders");
  });

  test("AC6: push off or deactivated: nothing", async () => {
    await alertAdmin(database, { push: false });
    await alertAdmin(database, { active: false });
    await ordersFor(TOMORROW, ["approved"]);
    const pusher = new RecordingPusher();

    await run(pusher, MU("18:00"));

    expect(pusher.sent).toHaveLength(0);
  });

  test("AC7: the Owner moves the reminder to 17:00: the next day's job sends at 17:00", async () => {
    await alertAdmin(database);
    await ordersFor(TOMORROW, ["approved"]);
    await database.client.query("update settings set evening_reminder_at = '17:00'");
    const pusher = new RecordingPusher();

    await run(pusher, MU("16:00"));
    expect(pusher.sent).toHaveLength(0);
    await run(pusher, MU("17:00"));
    expect(pusher.sent).toHaveLength(1);
  });

  test("AC8: decided by Mauritius time: 17:59 MU sends nothing, 18:00 MU sends (14:00Z, whatever the server clock)", async () => {
    await alertAdmin(database);
    await ordersFor(TOMORROW, ["approved"]);
    const pusher = new RecordingPusher();

    await run(pusher, new Date("2026-11-11T13:59:00Z"));
    expect(pusher.sent).toHaveLength(0);
    expect(await claimed()).toBe(false);

    await run(pusher, new Date("2026-11-11T14:00:00Z"));
    expect(pusher.sent).toHaveLength(1);
  });

  test("while push is not configured the day is not claimed", async () => {
    await alertAdmin(database);

    expect(await run(null, MU("18:00"))).toMatchObject({ processed: 0 });
    expect(await claimed()).toBe(false);
  });
});

describe("inReminderWindow", () => {
  test.each([
    ["17:59", "18:00", false],
    ["18:00", "18:00", true],
    ["20:59", "18:00", true],
    ["21:00", "18:00", false],
    ["21:30", "21:30", true],
  ])("%s with the reminder at %s: %s", (time, opensAt, expected) => {
    expect(inReminderWindow(time, opensAt)).toBe(expected);
  });
});
