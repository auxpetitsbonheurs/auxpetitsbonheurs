// The order activity log (S-018 AC1, AC3): append and read only, names by join on the
// admin row (which is never deleted), and the database's actor rule.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertAdmin } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { placeTestOrder } from "~/server/testing/orders";
import type { Database } from "~/server/db.server";
import { deactivateAdmin } from "~/server/services/deactivate-admin.server";
import { FakeUserAdmin } from "~/server/testing/fake-user-admin";
import * as repo from "./order-events.server";

let database: TestDatabase;
let orderId: string;
let adminId: string;

beforeEach(async () => {
  database = await createTestDatabase();
  adminId = (await insertAdmin(database, new FakeAuth(), { name: "Sarah" })).id;
  const { token } = await placeTestOrder(database);
  orderId = (await database.client.query<{ id: string }>("select id from orders where tracking_token = $1", [token])).rows[0]!.id;
}, 60_000);

afterEach(async () => {
  await database.close();
});

describe("no update or delete (S-018 AC3)", () => {
  test("the module exposes only append and read", () => {
    expect(Object.keys(repo).sort()).toEqual(["appendOrderEvent", "listOrderEvents"]);
  });
});

describe("the database actor rule (S-018 AC3)", () => {
  const insert = (actorType: string, actorAdminId: string | null) =>
    database.client.query("insert into order_event (order_id, actor_type, actor_admin_id, type) values ($1, $2, $3, 'test')", [orderId, actorType, actorAdminId]);

  test("an admin event without an admin id is refused", async () => {
    await expect(insert("admin", null)).rejects.toThrow(/order_event_actor_ck/);
  });

  test.each(["customer", "system"])("a %s event with an admin id is refused", async (actorType) => {
    await expect(insert(actorType, adminId)).rejects.toThrow(/order_event_actor_ck/);
  });

  test("valid pairs are accepted", async () => {
    await insert("admin", adminId);
    await insert("system", null);
  });
});

describe("reading the log (S-018 AC1)", () => {
  test("oldest first, with the admin's name, kept after deactivation", async () => {
    await repo.appendOrderEvent(database.db, {
      orderId,
      actor: { type: "admin", adminId },
      type: "approved",
      fromStatus: "pending_approval",
      toStatus: "approved",
      at: new Date("2099-11-12T10:05:00Z"),
    });
    await database.client.query("update admin set active = false, deactivated_at = now() where id = $1", [adminId]);

    const events = await repo.listOrderEvents(database.db, orderId);

    expect(events.map((e) => [e.type, e.actor])).toEqual([
      ["created", { type: "customer", name: null }],
      ["approved", { type: "admin", name: "Sarah" }],
    ]);
    expect(events[1]).toMatchObject({ at: "2099-11-12T10:05:00.000Z", fromStatus: "pending_approval", toStatus: "approved", details: null });
  });
});

describe("deactivation keeps names (S-032 AC3)", () => {
  test("after the Owner deactivates an admin, the log still names them on their events", async () => {
    const auth = new FakeAuth();
    const owner = await insertAdmin(database, auth, { role: "owner", name: "Owner" });
    const helper = await insertAdmin(database, auth, { role: "admin", name: "Anna" });
    const at = new Date("2099-11-12T10:05:00Z");
    await repo.appendOrderEvent(database.db, { orderId, actor: { type: "admin", adminId: helper.id }, type: "approved", fromStatus: "pending_approval", toStatus: "approved", at });
    const silence = vi.spyOn(console, "log").mockImplementation(() => {});

    await deactivateAdmin(database.db as unknown as Database, new FakeUserAdmin(database, auth), { actorId: owner.id, adminId: helper.id, now: at });
    silence.mockRestore();

    const events = await repo.listOrderEvents(database.db, orderId);
    expect(events.at(-1)?.actor).toEqual({ type: "admin", name: "Anna" });
  });
});
