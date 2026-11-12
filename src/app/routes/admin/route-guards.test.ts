// S-021 AC5 (FR-039, FR-041): the route table is the list of admin routes. Every route
// under /admin must be a declared public module or must guard each of its loaders and
// actions with `requireAdmin`, so a new route cannot forget the guard: called as an
// anonymous visitor it has to answer the login redirect, never data.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { RouteConfigEntry } from "@react-router/dev/routes";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import routes from "~/routes";
import { ADMIN_MODULE_POLICY, OWNER_ONLY_MODULES, PUBLIC_ADMIN_MODULES } from "~/server/admin-policy.server";
import { signedInAdmin } from "~/server/testing/admin-session";
import { FakeAuth } from "~/server/testing/fake-auth";
import { routeArgs } from "~/server/testing/route-context";

type Handler = (args: never) => Promise<unknown> | unknown;
interface RouteModule {
  loader?: Handler;
  action?: Handler;
}

// Route modules only: importing a *.test.tsx here would re-register its tests in this file.
const modules = import.meta.glob<RouteModule>(["./*.tsx", "!./*.test.tsx"], { eager: true });

/** Every route file whose URL is /admin or below, with its full path. */
function adminRoutes(entries: RouteConfigEntry[], parent = ""): { path: string; file: string }[] {
  return entries.flatMap((entry) => {
    const path = entry.path ? `${parent}/${entry.path}`.replace(/\/+/g, "/") : parent;
    const own = path === "/admin" || path.startsWith("/admin/") ? [{ path, file: entry.file }] : [];
    return [...own, ...adminRoutes(entry.children ?? [], path)];
  });
}

const table = adminRoutes(routes as RouteConfigEntry[]);
const moduleName = (file: string) => file.replace(/^routes\/admin\//, "").replace(/\.tsx?$/, "");

let database: TestDatabase;
const auth = new FakeAuth();

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

afterAll(async () => {
  await database.close();
});

test("the route table lists the admin routes", () => {
  expect(table.map((r) => r.file)).toEqual(expect.arrayContaining(["routes/admin/login.tsx", "routes/admin/layout.tsx", "routes/admin/orders.tsx"]));
});

describe.each(table)("$path ($file)", ({ path, file }) => {
  test("lives in routes/admin and has a declared policy (S-022 AC4)", () => {
    expect(file).toMatch(/^routes\/admin\/[a-z-]+\.tsx$/);
    expect(Object.keys(ADMIN_MODULE_POLICY), `${file} needs an entry in ADMIN_MODULE_POLICY`).toContain(moduleName(file));
  });

  test("every loader and action calls requireAdmin, unless the module is public", async () => {
    const name = moduleName(file);
    if ((PUBLIC_ADMIN_MODULES as readonly string[]).includes(name)) return;
    const module = modules[`./${name}.tsx`];
    expect(module, `${file} is not found`).toBeDefined();
    expect(module!.loader, `${file} has no loader`).toBeTypeOf("function");
    const url = path.replace(/:[a-z]+/gi, "00000000-0000-4000-8000-000000000000").replace("*", "anything");
    const params = { id: "00000000-0000-4000-8000-000000000000", "*": "anything" };

    for (const handler of [module!.loader, module!.action]) {
      if (!handler) continue;
      const form = handler === module!.action ? { intent: "x" } : undefined;
      let outcome: unknown;
      try {
        outcome = await handler(routeArgs(database, { path: url, params, auth, form }) as never);
      } catch (error) {
        outcome = error;
      }
      expect(outcome, `${file} answered without the guard`).toBeInstanceOf(Response);
      expect((outcome as Response).headers.get("Location")).toBe(`/admin/login?next=${encodeURIComponent(url)}`);
    }
  });

  test("an Owner-only module refuses an Admin with 403 in its loader and action (S-022 AC4)", async () => {
    const name = moduleName(file) as keyof typeof ADMIN_MODULE_POLICY;
    if (ADMIN_MODULE_POLICY[name] !== "owner") return;
    const session = await signedInAdmin(database, { role: "admin" });
    const module = modules[`./${name}.tsx`]!;

    for (const handler of [module.loader, module.action]) {
      if (!handler) continue;
      const form = handler === module.action ? { intent: "x" } : undefined;
      let outcome: unknown;
      try {
        outcome = await handler(routeArgs(database, { path, auth: session.auth, cookie: session.cookie, form }) as never);
      } catch (error) {
        outcome = error;
      }
      expect((outcome as { init?: { status: number } }).init?.status, `${file} let an Admin through`).toBe(403);
    }
  });
});

describe("the policy table (S-022 AC4)", () => {
  test("Availability, Settings and Team are the Owner-only modules", () => {
    expect([...OWNER_ONLY_MODULES].sort()).toEqual(["availability", "settings", "team"]);
  });

  test("Menu, Promotions, Gallery, Customers, Sales summary, Orders, Calendar, Profile and Pages (E-13 S-246 AC6) are open to Admins", () => {
    for (const name of ["menu", "promotions", "gallery", "customers", "sales", "orders", "order", "calendar", "profile", "pages", "page-editor"] as const) {
      expect(ADMIN_MODULE_POLICY[name], name).toBe("admin");
    }
  });
});
