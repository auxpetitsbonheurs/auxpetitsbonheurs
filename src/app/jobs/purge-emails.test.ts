// S-187 AC6: outbox payloads older than 90 days are emptied at 03:00 Mauritius time; newer rows stay.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { purgeEmails } from "./purge-emails";
import type { JobContext } from "./types";

let database: TestDatabase;
// 03:10 in Mauritius (UTC+4)
const AT_THREE = new Date("2026-11-13T23:10:00Z");
const DAY = 86_400_000;

beforeEach(async () => {
  database = await createTestDatabase();
  const insert = "insert into email_outbox (template, to_email, locale, payload, dedupe_key, status, created_at) values ('order_received', 'a@example.com', 'en', '{\"orderId\":\"x\"}', $1, $2, $3)";
  await database.client.query(insert, ["old-sent", "sent", new Date(AT_THREE.getTime() - 91 * DAY).toISOString()]);
  await database.client.query(insert, ["new-sent", "sent", new Date(AT_THREE.getTime() - 89 * DAY).toISOString()]);
  await database.client.query(insert, ["old-pending", "pending", new Date(AT_THREE.getTime() - 120 * DAY).toISOString()]);
}, 60_000);

afterEach(async () => {
  await database.close();
});

const run = (now: Date) => purgeEmails({ now, db: database.db } as unknown as JobContext);
const payloads = async () => (await database.client.query<{ dedupe_key: string; payload: object }>("select dedupe_key, payload from email_outbox order by dedupe_key")).rows;

describe("purgeEmails (S-187 AC6)", () => {
  test("at 03:00 it empties old payloads of finished rows and leaves newer and still-pending rows", async () => {
    expect(await run(AT_THREE)).toEqual({ job: "purgeEmails", ran: true, processed: 1 });

    expect(await payloads()).toEqual([
      { dedupe_key: "new-sent", payload: { orderId: "x" } },
      { dedupe_key: "old-pending", payload: { orderId: "x" } },
      { dedupe_key: "old-sent", payload: {} },
    ]);
  });

  test("at any other hour it does nothing", async () => {
    expect(await run(new Date(AT_THREE.getTime() + 3_600_000))).toEqual({ job: "purgeEmails", ran: true, processed: 0 });
  });
});
