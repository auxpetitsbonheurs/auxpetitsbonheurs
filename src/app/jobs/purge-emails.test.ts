// S-187 AC6, PRV-01 (privacy-2026.md): after 90 days a finished outbox row keeps no personal data:
// its payload is emptied and its recipient address cleared, at 03:00 Mauritius time. The row
// itself stays so its dedupe key still blocks a second send. Newer and still-pending rows stay.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { CLEARED_RECIPIENT, purgeEmails } from "./purge-emails";
import type { JobContext } from "./types";

let database: TestDatabase;
// 03:10 in Mauritius (UTC+4)
const AT_THREE = new Date("2026-11-13T23:10:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(AT_THREE.getTime() - days * DAY).toISOString();

beforeEach(async () => {
  database = await createTestDatabase();
  const insert = "insert into email_outbox (template, to_email, locale, payload, dedupe_key, status, created_at) values ($1, 'a@example.com', 'en', $2, $3, $4, $5)";
  await database.client.query(insert, ["order_received", '{"orderId":"x"}', "old-sent", "sent", ago(91)]);
  await database.client.query(insert, ["order_received", '{"orderId":"x"}', "new-sent", "sent", ago(89)]);
  await database.client.query(insert, ["order_received", '{"orderId":"x"}', "old-pending", "pending", ago(120)]);
  await database.client.query(insert, ["order_received", '{"orderId":"x"}', "old-dead", "dead", ago(100)]);
  // The Send Email hook's claim row (routes/hooks/send-email.ts) has an empty payload but an address.
  await database.client.query(insert, ["auth.signup", "{}", "auth-hook:old", "sent", ago(95)]);
}, 60_000);

afterEach(async () => {
  await database.close();
});

const run = (now: Date) => purgeEmails({ now, db: database.db } as unknown as JobContext);
const rows = async () =>
  (await database.client.query<{ dedupe_key: string; to_email: string; payload: object }>("select dedupe_key, to_email, payload from email_outbox order by dedupe_key")).rows;

describe("purgeEmails (S-187 AC6, PRV-01)", () => {
  test("at 03:00 old finished rows lose their payload and address; newer and still-pending rows keep both", async () => {
    expect(await run(AT_THREE)).toEqual({ job: "purgeEmails", ran: true, processed: 3 });

    expect(await rows()).toEqual([
      { dedupe_key: "auth-hook:old", to_email: CLEARED_RECIPIENT, payload: {} },
      { dedupe_key: "new-sent", to_email: "a@example.com", payload: { orderId: "x" } },
      { dedupe_key: "old-dead", to_email: CLEARED_RECIPIENT, payload: {} },
      { dedupe_key: "old-pending", to_email: "a@example.com", payload: { orderId: "x" } },
      { dedupe_key: "old-sent", to_email: CLEARED_RECIPIENT, payload: {} },
    ]);
  });

  test("no finished row older than 90 days keeps an address, and a second run changes nothing (idempotent)", async () => {
    await run(AT_THREE);
    const { rows: left } = await database.client.query("select dedupe_key from email_outbox where to_email <> '' and created_at < $1", [ago(90)]);
    expect(left).toEqual([{ dedupe_key: "old-pending" }]); // still pending: it may yet be sent
    expect(await run(AT_THREE)).toEqual({ job: "purgeEmails", ran: true, processed: 0 });
  });

  test("the dedupe key of a purged row still blocks a second send", async () => {
    await run(AT_THREE);
    await expect(
      database.client.query("insert into email_outbox (template, to_email, locale, payload, dedupe_key) values ('order_received', 'a@example.com', 'en', '{}', 'old-sent')"),
    ).rejects.toThrow(/duplicate key/);
  });

  test("at any other hour it does nothing", async () => {
    expect(await run(new Date(AT_THREE.getTime() + 3_600_000))).toEqual({ job: "purgeEmails", ran: true, processed: 0 });
  });
});
