// S-009 AC4 (and S-017 AC7): every admin loader and action guards itself. Each module is
// called directly, without its layout, as an anonymous visitor and as a signed-in
// customer: all answer a redirect to /admin/login?next=... and carry no admin data.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { routeArgs } from "~/server/testing/route-context";

type Handler = (args: never) => Promise<unknown> | unknown;
interface RouteModule {
  loader?: Handler;
  action?: Handler;
}

/** Public by design (contracts.md): login, sign-out (and later invite, forgot, reset). */
const PUBLIC = new Set(["./login.tsx", "./sign-out.tsx"]);
const modules = Object.entries(import.meta.glob<RouteModule>("./*.tsx", { eager: true })).filter(([path]) => !PUBLIC.has(path));

let database: TestDatabase;
let auth: FakeAuth;
let customerCookie: string;

beforeAll(async () => {
  database = await createTestDatabase();
  auth = new FakeAuth();
  const customer = await insertCustomerAccount(database, auth);
  customerCookie = auth.sessionCookie(customer.id, new Date("2026-11-09T00:00:00Z"));
}, 60_000);

afterAll(async () => {
  await database.close();
});

async function outcome(run: () => unknown): Promise<Response> {
  try {
    const result = await run();
    throw new Error(`expected a redirect, got ${JSON.stringify(result)}`);
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}

const visitors = [
  ["an anonymous visitor", () => undefined],
  ["a signed-in customer", () => customerCookie],
] as const;

test("the guarded admin modules are found", () => {
  expect(modules.map(([path]) => path)).toEqual(expect.arrayContaining(["./home.tsx", "./layout.tsx", "./not-found.tsx"]));
});

describe.each(modules)("%s", (_path, module) => {
  const params = { id: randomUUID(), "*": "anything" };

  test.each(visitors)("loader: %s is redirected to the login page", async (_label, cookie) => {
    if (!module.loader) return;
    const path = "/admin/orders?tab=review";
    const response = await outcome(() => module.loader!(routeArgs(database, { path, params, auth, cookie: cookie() }) as never));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/admin/login?next=%2Fadmin%2Forders%3Ftab%3Dreview");
    expect(await response.text()).toBe("");
  });

  test.each(visitors)("action: %s is redirected to the login page", async (_label, cookie) => {
    if (!module.action) return;
    const form = { intent: "approve", version: "1" };
    const response = await outcome(() => module.action!(routeArgs(database, { path: `/admin/orders/${params.id}`, params, auth, cookie: cookie(), form }) as never));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(`/admin/login?next=${encodeURIComponent(`/admin/orders/${params.id}`)}`);
  });
});
