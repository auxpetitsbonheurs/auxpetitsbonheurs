// S-009 AC4, S-017 AC7 and S-021 (FR-039): every admin loader and action guards itself.
// Each module is called directly, without its layout. Anonymous visitors and signed-in
// customers opening a page are redirected to /admin/login?next=... with no admin data and
// the customer session left as it was; a customer posting an admin action (a fetcher) gets
// FORBIDDEN 403 and nothing changes.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { PUBLIC_ADMIN_MODULES } from "~/server/admin-policy.server";
import { insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { placeTestOrder } from "~/server/testing/orders";
import { routeArgs } from "~/server/testing/route-context";
import { action as approveAction } from "./order";
import { loader as loginLoader } from "./login";

type Handler = (args: never) => Promise<unknown> | unknown;
interface RouteModule {
  loader?: Handler;
  action?: Handler;
}

const moduleName = (path: string) => path.replace(/^\.\//, "").replace(/\.tsx$/, "");
const modules = Object.entries(import.meta.glob<RouteModule>("./*.tsx", { eager: true })).filter(
  ([path]) => !(PUBLIC_ADMIN_MODULES as readonly string[]).includes(moduleName(path)),
);

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

async function thrown(run: () => unknown): Promise<unknown> {
  try {
    const result = await run();
    throw new Error(`expected a refusal, got ${JSON.stringify(result)}`);
  } catch (error) {
    return error;
  }
}

async function redirectOf(run: () => unknown): Promise<Response> {
  const error = await thrown(run);
  if (error instanceof Response) return error;
  throw error;
}

type Envelope = { data: { ok: false; error: { code: string; message: string } }; init: { status: number } };

const visitors = [
  ["an anonymous visitor", () => undefined],
  ["a signed-in customer", () => customerCookie],
] as const;

test("the guarded admin modules are found", () => {
  expect(modules.map(([path]) => path)).toEqual(expect.arrayContaining(["./home.tsx", "./layout.tsx", "./not-found.tsx"]));
});

describe.each(modules)("%s", (_path, module) => {
  const params = { id: randomUUID(), "*": "anything" };

  test.each(visitors)("loader: %s is redirected to the login page, no admin data, no cookie change (AC1, AC6)", async (_label, cookie) => {
    if (!module.loader) return;
    const path = "/admin/orders?tab=review";
    const response = await redirectOf(() => module.loader!(routeArgs(database, { path, params, auth, cookie: cookie() }) as never));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/admin/login?next=%2Fadmin%2Forders%3Ftab%3Dreview");
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(await response.text()).toBe("");
  });

  test("action: an anonymous visitor is redirected to the login page (S-009 AC4)", async () => {
    if (!module.action) return;
    const form = { intent: "approve", version: "1" };
    const response = await redirectOf(() => module.action!(routeArgs(database, { path: `/admin/orders/${params.id}`, params, auth, form }) as never));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(`/admin/login?next=${encodeURIComponent(`/admin/orders/${params.id}`)}`);
  });

  test("action: a signed-in customer gets FORBIDDEN 403 (AC3)", async () => {
    if (!module.action) return;
    const form = { intent: "approve", version: "1" };
    const refusal = (await thrown(() =>
      module.action!(routeArgs(database, { path: `/admin/orders/${params.id}`, params, auth, cookie: customerCookie, form }) as never),
    )) as Envelope;

    expect(refusal.init.status).toBe(403);
    expect(refusal.data).toEqual({ ok: false, error: { code: "FORBIDDEN", message: "You cannot do this." } });
  });
});

describe("a customer session (S-021)", () => {
  test("AC3: approve posted from a fetcher is FORBIDDEN and the order does not change", async () => {
    const { token } = await placeTestOrder(database);
    const before = (await database.client.query<{ id: string; status: string; version: number }>("select id, status, version from orders where tracking_token = $1", [token])).rows[0]!;

    const refusal = (await thrown(() =>
      approveAction(
        routeArgs(database, {
          path: `/admin/orders/${before.id}.data`,
          params: { id: before.id },
          auth,
          cookie: customerCookie,
          form: { intent: "approve", version: String(before.version) },
        }) as never,
      ),
    )) as Envelope;

    expect(refusal.init.status).toBe(403);
    expect(refusal.data.error.code).toBe("FORBIDDEN");
    const after = (await database.client.query("select status, version from orders where id = $1", [before.id])).rows[0];
    expect(after).toEqual({ status: before.status, version: before.version });
    expect(auth.signOuts).toEqual([]);
  });

  test("AC3: the refusal follows the visitor's language", async () => {
    const refusal = (await thrown(() =>
      approveAction(
        routeArgs(database, { path: "/admin/orders/x", params: { id: randomUUID() }, auth, cookie: `${customerCookie}; apb_locale=fr`, form: { version: "1" } }) as never,
      ),
    )) as Envelope;

    expect(refusal.data.error.message).toBe("Vous ne pouvez pas faire cela.");
  });

  test("AC4: /admin/login renders the public sign-in page with no admin data", async () => {
    const page = await loginLoader(routeArgs(database, { path: "/admin/login?next=%2Fadmin", auth, cookie: customerCookie }) as never);

    expect(page).toEqual({ next: "/admin", title: "Sign in" });
    expect(auth.signOuts).toEqual([]);
  });
});
