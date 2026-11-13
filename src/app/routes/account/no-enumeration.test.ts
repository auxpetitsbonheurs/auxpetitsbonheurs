// S-218 AC8: the generic answers read the same for an existing and an unknown email, in both
// languages (sign-in failure, sign-in link sent, reset sent, sign-up with an existing email).
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { routeArgs } from "~/server/testing/route-context";
import { action as resetAction } from "./reset";
import { action as signInAction } from "./sign-in";
import { action as signUpAction } from "./sign-up";

let database: TestDatabase;
let auth: FakeAuth;

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

beforeEach(async () => {
  auth = new FakeAuth();
  await database.client.exec("delete from rate_limit_bucket");
});

afterAll(async () => {
  await database.close();
});

/** The answer as the page sees it, with the posted email itself taken out. */
async function answer(run: (args: never) => Promise<unknown>, path: string, form: Record<string, string>) {
  const result = await run(routeArgs(database, { path, auth, form }) as never).catch((thrown: unknown) => thrown);
  const body = (result as { data?: unknown }).data ?? result;
  return JSON.stringify(body, (key, value) => (key === "sentAt" ? 0 : value)).replaceAll(form.email ?? "\u0000", "EMAIL");
}

describe.each(["", "/fr"])("no enumeration on %s pages", (prefix) => {
  test("sign-in failure, link, reset and sign-up answer the same for a real account and an unknown email", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const pairs: [(args: never) => Promise<unknown>, string, (email: string) => Record<string, string>][] = [
      [signInAction as never, `${prefix}/account/sign-in`, (email) => ({ intent: "password", email, password: "not the password!" })],
      [signInAction as never, `${prefix}/account/sign-in`, (email) => ({ intent: "magicLink", email })],
      [resetAction as never, `${prefix}/account/reset`, (email) => ({ intent: "requestReset", email })],
      [signUpAction as never, `${prefix}/account/sign-up`, (email) => ({ name: "A B", email, phone: "5712 3456", locale: prefix ? "fr" : "en" })],
    ];
    for (const [run, path, form] of pairs) {
      const known = await answer(run, path, form(customer.email));
      const unknown = await answer(run, path, form(`nobody-${prefix.length}@example.com`));
      expect(unknown, path).toBe(known);
    }
  });
});
