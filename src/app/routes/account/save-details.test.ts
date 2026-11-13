// S-215 Save my details (and S-216 AC4: nothing visible before the email is confirmed).
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { loader as confirmedLoader } from "~/routes/site/order-confirmed";
import { insertAdmin, insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { placeTestOrder } from "~/server/testing/orders";
import { type RouteArgsOptions, routeArgs } from "~/server/testing/route-context";
import { action, loader } from "./save-details";

let database: TestDatabase;
let auth: FakeAuth;

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

beforeEach(async () => {
  auth = new FakeAuth();
  await database.client.exec("delete from rate_limit_bucket; delete from usage_counter");
});

afterAll(async () => {
  await database.close();
});

type Envelope = { data: { ok: false; error: { code: string } }; init: { status: number } };

const save = (token: string, options: Partial<RouteArgsOptions> = {}) =>
  action(routeArgs(database, { path: "/account/save-details", auth, form: { trackingToken: token }, headers: { "cf-connecting-ip": "203.0.113.20" }, ...options }) as never) as Promise<unknown>;

describe("the card on the confirmation page (AC1, AC8)", () => {
  test("a guest's website order offers it, linking to save-details with the token; a signed-in browser does not", async () => {
    const order = await placeTestOrder(database, { overrides: { "contact.email": "card@example.com" } });
    const guest = (await confirmedLoader(routeArgs(database, { path: order.path, params: { token: order.token }, auth, cookie: order.confirmationCookie }) as never)) as { offerSaveDetails: boolean; saveDetailsUrl: string };
    const signedIn = (await confirmedLoader(routeArgs(database, { path: order.path, params: { token: order.token }, auth, cookie: `${order.confirmationCookie}; apb_customer=1` }) as never)) as { offerSaveDetails: boolean };
    expect(guest).toMatchObject({ offerSaveDetails: true, saveDetailsUrl: `/account/save-details?t=${order.token}` });
    expect(signedIn.offerSaveDetails).toBe(false);
  });
});

describe("save my details (AC2, AC4, AC6, AC7)", () => {
  test("an unconfirmed account for the order's email, no password asked, the confirmation sent; nothing linked yet (AC2, AC3)", async () => {
    const order = await placeTestOrder(database, { overrides: { "contact.email": "Save@Example.com", "contact.name": "Aisha K" } });

    expect(await loader(routeArgs(database, { path: `/account/save-details?t=${order.token}`, auth }) as never)).toMatchObject({ email: "save@example.com" });
    expect(await save(order.token)).toEqual({ ok: true, confirmationSent: true });

    expect(auth.signUps).toHaveLength(1);
    expect(auth.signUps[0]).toMatchObject({ email: "save@example.com", metadata: { name: "Aisha K", phone: "+23057123456", locale: "en", source: "save_details" } });
    expect(auth.signUps[0]!.password).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const { rows } = await database.client.query("select auth_user_id from customer where email = 'save@example.com'");
    expect(rows).toEqual([{ auth_user_id: null }]);
  });

  test("an email with an account (customer or admin): EMAIL_IN_USE, nothing created (AC4)", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const admin = await insertAdmin(database, auth);
    for (const email of [customer.email, admin.email]) {
      const order = await placeTestOrder(database, { overrides: { "contact.email": email } });
      expect(((await save(order.token, { headers: { "cf-connecting-ip": `203.0.113.${email.length}` } })) as Envelope).data.error.code).toBe("EMAIL_IN_USE");
    }
    expect(auth.signUps).toEqual([]);
  });

  test("an unknown and a malformed token answer the same NOT_FOUND (AC6)", async () => {
    const unknown = (await save("A".repeat(43))) as Envelope;
    const malformed = (await save("<x>")) as Envelope;
    expect([unknown.init.status, malformed.init.status]).toEqual([404, 404]);
    await expect(loader(routeArgs(database, { path: "/account/save-details?t=nope", auth }) as never)).rejects.toMatchObject({ init: { status: 404 } });
  });

  test("the 4th request in an hour from one IP is RATE_LIMITED (AC7)", async () => {
    const order = await placeTestOrder(database, { overrides: { "contact.email": "limit@example.com" } });
    for (let i = 0; i < 3; i++) await save(order.token);
    expect(((await save(order.token)) as Envelope).init.status).toBe(429);
  });
});
