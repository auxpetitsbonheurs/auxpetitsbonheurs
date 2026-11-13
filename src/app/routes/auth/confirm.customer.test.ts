// E-11: customer links on /auth/confirm (S-206 AC2, S-208 AC3/AC4, S-209, S-216 AC2..AC10, S-217).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { linkConfirmedAccount } from "~/server/repos/customer-accounts.server";
import { insertAdmin } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { placeTestOrder } from "~/server/testing/orders";
import { routeArgs } from "~/server/testing/route-context";
import { loader } from "./confirm";

let database: TestDatabase;
let auth: FakeAuth;

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

beforeEach(async () => {
  auth = new FakeAuth();
  await database.client.query("delete from usage_counter");
});

afterAll(async () => {
  await database.close();
});

async function open(query: string) {
  const args = routeArgs(database, { path: `/auth/confirm?${query}`, auth });
  try {
    await loader(args as never);
  } catch (thrown) {
    if (thrown instanceof Response) {
      await args.afterResponse.settled();
      return thrown;
    }
    throw thrown;
  }
  throw new Error("expected a redirect");
}

/** An unconfirmed Auth user as sign-up leaves it (the auth.users row exists on Supabase too). */
async function signedUp(email: string, metadata: Record<string, unknown> = { name: "Aisha K", phone: "5712 3456", locale: "en" }) {
  const id = auth.addUnconfirmedUser(email, metadata);
  await database.client.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  return id;
}

async function customerRows(email: string) {
  const { rows } = await database.client.query<{ id: string; auth_user_id: string | null; name: string; phone: string; email: string }>(
    "select id, auth_user_id, name, phone, email from customer where lower(email) = $1",
    [email],
  );
  return rows;
}

async function counters() {
  const { rows } = await database.client.query<{ event: string; props: string; count: number }>("select event, props, count from usage_counter order by event, props");
  return rows;
}

describe("first confirmation of a sign-up (S-206 AC2, S-216 AC1/AC2)", () => {
  test("links the guest row with that email, keeps its details, then asks for a password", async () => {
    await placeTestOrder(database, { overrides: { "contact.email": "aisha@example.com" } });
    await placeTestOrder(database, { overrides: { "contact.email": "aisha@example.com" } });
    const before = await customerRows("aisha@example.com");
    const userId = await signedUp("aisha@example.com", { name: "Someone Else", phone: "5999 0000", locale: "fr" });

    const response = await open(`token_hash=${auth.linkToken("aisha@example.com", "signup")}&type=signup&next=/account/orders`);

    expect(response.headers.get("Location")).toBe(`/account/reset?mode=new&next=${encodeURIComponent("/account/orders")}`);
    expect(response.headers.get("Set-Cookie")).toContain("apb_customer=1");
    const after = await customerRows("aisha@example.com");
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: before[0]!.id, auth_user_id: userId, name: before[0]!.name, phone: before[0]!.phone });
    expect(await counters()).toContainEqual({ event: "account_created", props: "linkedOrders=2;method=signup", count: 1 });
  });

  test("with no guest row, creates one from the sign-up details (normalised phone, language)", async () => {
    const email = `new-${randomUUID().slice(0, 6)}@example.com`;
    const userId = await signedUp(email, { name: "Marie Dupont", phone: "5712 3456", locale: "fr" });

    const response = await open(`token_hash=${auth.linkToken(email, "signup")}&type=signup&next=/fr/account/orders`);

    expect(response.headers.get("Location")).toBe(`/fr/account/reset?mode=new&next=${encodeURIComponent("/fr/account/orders")}`);
    const { rows } = await database.client.query("select name, phone, locale, auth_user_id from customer where email = $1", [email]);
    expect(rows).toEqual([{ name: "Marie Dupont", phone: "+23057123456", locale: "fr", auth_user_id: userId }]);
  });
});

describe("never by phone (S-216 AC5, AC6; spec AC6c)", () => {
  test("customer C (email V, phone P) is unchanged when A with the same phone confirms", async () => {
    await placeTestOrder(database, { overrides: { "contact.email": "v@example.com", "contact.phone": "5700 0001" } });
    await placeTestOrder(database, { overrides: { "contact.email": "a@example.com", "contact.phone": "5700 0001" } });
    const v = (await customerRows("v@example.com"))[0]!;
    await signedUp("a@example.com");

    await open(`token_hash=${auth.linkToken("a@example.com", "signup")}&type=signup`);

    expect((await customerRows("v@example.com"))[0]).toEqual(v);
    expect((await customerRows("a@example.com"))[0]!.auth_user_id).not.toBeNull();
  });
});

describe("refusals", () => {
  test("a link used twice: the second lands on the expired notice and links nothing again (S-208 AC4, S-216 AC7)", async () => {
    await signedUp("twice@example.com");
    const token = auth.linkToken("twice@example.com", "signup");
    await open(`token_hash=${token}&type=signup`);

    const again = await open(`token_hash=${token}&type=signup`);

    expect(again.headers.get("Location")).toBe("/account/sign-in?link=expired");
    expect(again.headers.get("Set-Cookie")).toBeNull();
    expect(await customerRows("twice@example.com")).toHaveLength(1);
  });

  test("a malformed token never reaches Auth", async () => {
    const response = await open("token_hash=%3Cscript%3E&type=magiclink&next=/fr/account");
    expect(response.headers.get("Location")).toBe("/fr/account/sign-in?link=expired");
  });

  test("an admin's address never becomes a customer and keeps no session (S-216 AC9)", async () => {
    const admin = await insertAdmin(database, auth);

    const response = await open(`token_hash=${auth.linkToken(admin.email, "magiclink")}&type=magiclink`);

    expect(response.headers.get("Location")).toBe("/account/sign-in?link=expired");
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(await customerRows(admin.email)).toHaveLength(0);
    expect(auth.signOuts).toHaveLength(1);
  });

  test("an expired reset link shows the reset page's expired notice (S-209 AC4)", async () => {
    const response = await open("token_hash=unknown&type=recovery&next=/account/reset");
    expect(response.headers.get("Location")).toBe("/account/reset?expired=1");
  });
});

describe("sign-in link (S-208 AC3)", () => {
  test("signs in and follows a same-site next; an outside next goes to the account", async () => {
    await signedUp("link@example.com");
    await open(`token_hash=${auth.linkToken("link@example.com", "signup")}&type=signup`);

    const inside = await open(`token_hash=${auth.linkToken("link@example.com", "magiclink")}&type=magiclink&next=/reviews/write`);
    const outside = await open(`token_hash=${auth.linkToken("link@example.com", "magiclink")}&type=magiclink&next=${encodeURIComponent("//evil.example")}`);

    expect(inside.headers.get("Location")).toBe("/reviews/write");
    expect(outside.headers.get("Location")).toBe("/account");
    expect(await counters()).toContainEqual({ event: "sign_in", props: "method=magic_link", count: 3 });
  });

  test("a customer reset link lands on /account/reset with a link session", async () => {
    await signedUp("reset@example.com");
    const response = await open(`token_hash=${auth.linkToken("reset@example.com", "recovery")}&type=recovery&next=/fr/account/reset`);
    expect(response.headers.get("Location")).toBe("/fr/account/reset");
    expect(response.headers.get("Set-Cookie")).toContain("apb_fake_session=");
  });
});

describe("concurrent confirmations (S-216 AC10)", () => {
  test("two link calls for the same user end on one row without an error", async () => {
    await placeTestOrder(database, { overrides: { "contact.email": "race@example.com" } });
    const userId = await signedUp("race@example.com");
    const user = { userId, email: "race@example.com", metadata: {} };

    const results = await Promise.all([linkConfirmedAccount(database.db as never, user), linkConfirmedAccount(database.db as never, user)]);

    expect(results.every((r) => r.ok)).toBe(true);
    expect(await customerRows("race@example.com")).toHaveLength(1);
  });
});
