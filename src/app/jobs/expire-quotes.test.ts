// E-08 S-160: expired quotes close themselves (hourly tick, Mauritius dates, fixed clocks).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { Database } from "~/server/db.server";
import { acceptQuote, declineQuote, sendQuote } from "~/server/services/quotes.server";
import { insertAdmin } from "~/server/testing/admins";
import { submitTestRequest } from "~/server/testing/custom-requests";
import { FakeAuth } from "~/server/testing/fake-auth";
import { closeExpiredQuote, expireQuotes } from "./expire-quotes";

let database: TestDatabase;
let db: Database;
let adminId: string;

beforeEach(async () => {
  database = await createTestDatabase();
  db = database.db as unknown as Database;
  adminId = (await insertAdmin(database, new FakeAuth())).id;
}, 60_000);

afterEach(async () => {
  vi.restoreAllMocks();
  await database.close();
});

const query = async <T>(text: string, params: unknown[] = []) => (await database.client.query<T>(text, params)).rows;
const context = (now: string) => ({ now: new Date(now), db, supabase: { url: "https://ref.supabase.co", anonKey: "anon" } });

async function quoteUntil(expiresOn: string) {
  const placed = await submitTestRequest(database);
  const sent = await sendQuote(db, { orderId: placed.orderId, version: 1, adminId, amountRs: 4500, note: null, expiresOn, now: new Date("2026-11-10T08:00:00Z") });
  if (!sent.ok) throw new Error(sent.code);
  return { ...placed, version: sent.order.version };
}

const status = async (orderId: string) => (await query<{ status: string }>("select status from orders where id = $1", [orderId]))[0]!.status;
const closedMails = (orderId: string) => query("select 1 from email_outbox where order_id = $1 and template = 'quote_closed'", [orderId]);

describe("expireQuotes (S-160)", () => {
  test("AC1, AC8: after 23:59 MU on the expiry day: Closed, system event quote_expired, 'Quote closed' queued", async () => {
    const quote = await quoteUntil("2026-11-15");

    // 23:00 MU on the 15th (19:00Z): still valid. 00:00 MU on the 16th (20:00Z on the 15th): closed.
    expect(await expireQuotes(context("2026-11-15T19:00:00Z"))).toEqual({ job: "expireQuotes", ran: true, processed: 0 });
    expect(await expireQuotes(context("2026-11-15T20:00:00Z"))).toEqual({ job: "expireQuotes", ran: true, processed: 1 });

    expect(await status(quote.orderId)).toBe("closed");
    expect(await query("select actor_type, type, from_status, to_status from order_event where type = 'quote_expired'")).toEqual([{ actor_type: "system", type: "quote_expired", from_status: "quote_sent", to_status: "closed" }]);
    expect(await query<{ payload: unknown }>("select payload from email_outbox where template = 'quote_closed'")).toEqual([{ payload: { orderId: quote.orderId, why: "expired" } }]);
  });

  test("AC2: run twice, one email", async () => {
    const quote = await quoteUntil("2026-11-15");
    await expireQuotes(context("2026-11-17T08:00:00Z"));
    expect(await expireQuotes(context("2026-11-17T09:00:00Z"))).toMatchObject({ processed: 0 });
    expect(await closedMails(quote.orderId)).toHaveLength(1);
  });

  test("AC3: a customer accepted after the job read the row: the versioned update misses and it stays Approved", async () => {
    const quote = await quoteUntil("2026-11-15");
    await acceptQuote(db, { token: quote.trackingToken, version: quote.version, today: "2026-11-15", now: new Date("2026-11-15T19:59:00Z") });

    expect(await closeExpiredQuote(context("2026-11-16T08:00:00Z"), { id: quote.orderId, version: quote.version })).toBe(false);
    expect(await status(quote.orderId)).toBe("approved");
  });

  test("AC5: today's or later quotes stay Quote sent", async () => {
    const today = await quoteUntil("2026-11-16");
    const later = await quoteUntil("2026-11-30");
    await expireQuotes(context("2026-11-16T08:00:00Z"));
    expect([await status(today.orderId), await status(later.orderId)]).toEqual(["quote_sent", "quote_sent"]);
  });

  test("AC6: nothing to close is an empty report; one failing row is reported and the others still close", async () => {
    expect(await expireQuotes(context("2026-11-17T08:00:00Z"))).toEqual({ job: "expireQuotes", ran: true, processed: 0 });
    const [a, b] = [await quoteUntil("2026-11-14"), await quoteUntil("2026-11-15")];
    const failing = { ...context("2026-11-17T08:00:00Z") };
    const execute = db.execute.bind(db);
    failing.db = new Proxy(db, {
      get: (target, key) =>
        key === "execute"
          ? (statement: Parameters<typeof execute>[0]) => {
              const text = JSON.stringify(statement);
              return text.includes(a.orderId) && text.includes("quote_expired") ? Promise.reject(new Error("deadlock detected")) : execute(statement);
            }
          : Reflect.get(target, key),
    });
    vi.spyOn(console, "log").mockImplementation(() => {});

    const report = await expireQuotes(failing);

    expect(report).toEqual({ job: "expireQuotes", ran: false, error: "1 of 2 quotes could not be closed (1 closed)" });
    expect([await status(a.orderId), await status(b.orderId)]).toEqual(["quote_sent", "closed"]);
  });

  test("S-159 AC4: a customer declined after expiry; the job later sends no second 'Quote closed'", async () => {
    const quote = await quoteUntil("2026-11-15");
    await declineQuote(db, { token: quote.trackingToken, version: quote.version, today: "2026-11-16", now: new Date("2026-11-16T05:00:00Z") });
    await expireQuotes(context("2026-11-16T08:00:00Z"));
    expect(await closedMails(quote.orderId)).toHaveLength(1);
  });
});
