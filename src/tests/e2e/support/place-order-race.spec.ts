// S-014 AC3 and G-21 on real Postgres (ADR-0003 amendment 3): the `place_order` procedure,
// when two calls with one idempotency key both pass the lookup, rolls the loser back (its
// customer row and order number too) and answers with the winner. Needs two connections, so
// it runs here against the local e2e database instead of in-process PGlite.
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { E2E_DATABASE_URL, SAMPLE_PRODUCT } from "./database";
import { expect, test } from "./fixtures";

interface ProcedureReply {
  kind: string;
  existing?: { orderId: string; contactEmail: string };
  placed?: { orderId: string; number: number };
}

async function connect() {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  return client;
}

const call = async (client: pg.Client, input: object) =>
  (await client.query<{ result: ProcedureReply }>("call place_order($1::jsonb, null)", [JSON.stringify(input)])).rows[0]!.result;

test.describe("place_order procedure: lost race on the idempotency key", () => {
  test("the loser waits, is rolled back without consuming a number, and gets the winner", async () => {
    // Database-only: once is enough, not once per viewport.
    test.skip(test.info().project.name !== "desktop-1280", "database-only check");
    const [winner, loser, observer] = await Promise.all([connect(), connect(), connect()]);
    try {
      const { rows: [product] } = await observer.query<{ id: string; base_price_rs: number }>("select id, base_price_rs from product where slug = $1", [SAMPLE_PRODUCT.slug]);
      const { rows: [settings] } = await observer.query<{ window_id: string }>("select pickup_windows->0->>'id' as window_id from settings where id = 1");
      const key = randomUUID();
      const email = `race-${randomUUID()}@example.com`;
      const input = (name: string) => ({
        idempotencyKey: key,
        insert: true,
        basket: [{ productId: product!.id, quantity: 1, cakeMessage: null }],
        order: {
          contactName: name, contactPhone: "+23057000000", contactEmail: email, fulfilment: "pickup", address: null, landmark: null,
          fulfilOn: "2030-01-15", windowId: settings!.window_id, customerNote: null, locale: "en",
          trackingToken: randomBytes(32).toString("base64url"), displayedTotalRs: product!.base_price_rs, policiesAcceptedAt: new Date().toISOString(),
        },
      });

      await winner.query("begin");
      const won = await call(winner, input("Race winner"));
      expect(won.kind).toBe("placed");

      // The loser's lookup sees nothing (uncommitted) and its insert waits on the unique key.
      const lost = call(loser, input("Race loser"));
      await expect.poll(async () => (await observer.query("select 1 from pg_stat_activity where wait_event_type = 'Lock' and query like 'call place_order%'")).rowCount).toBe(1);
      await winner.query("commit");

      const reply = await lost;
      expect(reply.kind).toBe("existing");
      expect(reply.existing).toMatchObject({ orderId: won.placed!.orderId, contactEmail: email });
      // The loser's increment was rolled back: committed numbers stay gap-free (other specs order in parallel).
      const orders = await observer.query<{ gapless: boolean; mine: number }>(
        "select max(number) = count(*) as gapless, count(*) filter (where idempotency_key = $1)::int as mine from orders",
        [key],
      );
      expect(orders.rows[0]).toEqual({ gapless: true, mine: 1 });
      const customers = await observer.query("select 1 from customer where email = $1", [email]);
      expect(customers.rowCount).toBe(1);
    } finally {
      await winner.query("rollback").catch(() => undefined);
      await Promise.all([winner.end(), loser.end(), observer.end()]);
    }
  });
});
