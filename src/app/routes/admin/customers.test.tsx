// `admin/customers` loader and view (S-174, S-175): rows, sort, cursor, search, empty states, roles, FR.
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { messagesFor } from "~/i18n/catalog.server";
import { I18nProvider } from "~/i18n/react";
import { insertCustomerAccount } from "~/server/testing/admins";
import { signedInAdmin } from "~/server/testing/admin-session";
import { routeArgs } from "~/server/testing/route-context";
import { insertTestCustomer, insertTestOrder } from "~/server/testing/sales";
import AdminCustomers, { loader } from "./customers";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
  vi.restoreAllMocks();
});

type Body = Parameters<typeof AdminCustomers>[0]["loaderData"];

async function load(path: string, options: { role?: "owner" | "admin"; locale?: "en" | "fr" } = {}) {
  const session = await signedInAdmin(database, options);
  const result = (await loader(routeArgs(database, { path, auth: session.auth, cookie: session.cookie }) as never)) as unknown;
  const wrapped = result as { type?: string; data?: unknown; init?: { status?: number } };
  return wrapped.type === "DataWithResponseInit" ? { status: wrapped.init?.status ?? 200, body: wrapped.data as Body } : { status: 200, body: result as Body };
}

async function render(path: string, locale: "en" | "fr" = "en") {
  const { body } = await load(path, { locale });
  const props = { loaderData: body } as unknown as Parameters<typeof AdminCustomers>[0];
  const Stub = createRoutesStub([{ path: "/admin/customers", Component: () => <AdminCustomers {...props} /> }]);
  return renderToStaticMarkup(
    <I18nProvider locale={locale} messages={messagesFor(locale)}>
      <Stub initialEntries={[path]} />
    </I18nProvider>,
  );
}

describe("the list (S-174 AC1, AC2, AC6, AC8)", () => {
  test("rows with name, phone, order count, total spent and last order date", async () => {
    const anna = await insertTestCustomer(database.db, { name: "Anna" });
    await insertTestOrder(database.db, { customerId: anna, totalRs: 1000, createdAt: new Date("2026-11-03T06:00:00Z") });
    await insertTestOrder(database.db, { customerId: anna, totalRs: 500, createdAt: new Date("2026-11-04T06:00:00Z") });
    await insertTestOrder(database.db, { customerId: anna, status: "cancelled", totalRs: 900, createdAt: new Date("2026-11-05T06:00:00Z") });
    const { body } = await load("/admin/customers");
    expect(body).toMatchObject({ sort: "last_order", q: "", invalid: null, total: 1, nextCursor: null });
    expect(body.data).toEqual([{ id: anna, name: "Anna", phone: "+23057123456", deleted: false, orderCount: 2, totalSpentRs: 1500, lastOrderOn: "2026-11-05", lastOrderLabel: "Thu 5 Nov" }]);
    const html = await render("/admin/customers");
    expect(html).toContain(`href="/admin/customers/${anna}"`);
    expect(html).toContain("Rs 1,500");
    expect(html).toContain("1 customer");
  });

  test("an anonymised customer shows Deleted customer and no phone", async () => {
    await insertTestCustomer(database.db, { anonymised: true, phone: "+23057123456", email: null });
    const { body } = await load("/admin/customers");
    expect(body.data[0]).toMatchObject({ name: "Deleted customer", phone: null, deleted: true });
    const html = await render("/admin/customers", "fr");
    expect(html).toContain("Client supprimé");
    expect(html).not.toContain("57123456");
  });

  test("no customers: the empty text", async () => {
    expect(await render("/admin/customers")).toContain("Customers appear after the first order.");
  });

  test("French labels and money", async () => {
    const anna = await insertTestCustomer(database.db, { name: "Anna" });
    await insertTestOrder(database.db, { customerId: anna, totalRs: 1250 });
    const html = await render("/admin/customers", "fr");
    expect(html).toContain("Total dépensé");
    expect(html).toContain("Rs 1,250");
    expect(html).toContain("Trier par");
  });
});

describe("sort and pages (S-174 AC3, AC4)", () => {
  test("the sort stays in the next-page link; an unknown sort falls back to last order", async () => {
    for (let i = 0; i < 31; i += 1) await insertTestCustomer(database.db, { name: `C${String(i).padStart(2, "0")}` });
    const { body } = await load("/admin/customers?sort=name");
    expect(body.data).toHaveLength(30);
    expect(body.data[0]!.name).toBe("C00");
    const next = await load(`/admin/customers?sort=name&cursor=${encodeURIComponent(body.nextCursor!)}`);
    expect(next.body.data.map((r) => r.name)).toEqual(["C30"]);
    expect((await load("/admin/customers?sort=bogus")).body.sort).toBe("last_order");
    const html = await render("/admin/customers?sort=name");
    expect(html).toMatch(/href="\/admin\/customers\?sort=name&amp;cursor=[^"]+"/);
  });
});

describe("search (S-175 AC2..AC5)", () => {
  test("a partial name finds the customer; no match shows the text and Clear", async () => {
    await insertTestCustomer(database.db, { name: "Anna Rault" });
    expect((await load("/admin/customers?q=raul")).body.data.map((r) => r.name)).toEqual(["Anna Rault"]);
    const html = await render("/admin/customers?q=zzz");
    expect(html).toContain("No match for ‘zzz’.");
    expect(html).toMatch(/href="\/admin\/customers"[^>]*>Clear</);
    expect(html).toContain('role="search"');
  });

  test("over 80 characters: VALIDATION_FAILED 400 and no rows", async () => {
    await insertTestCustomer(database.db);
    const { status, body } = await load(`/admin/customers?q=${"a".repeat(81)}`);
    expect(status).toBe(400);
    expect(body).toMatchObject({ invalid: { code: "VALIDATION_FAILED" }, data: [] });
  });

  test("the log line has the query length, never the query", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await load("/admin/customers?q=Anna%20Rault", { role: "admin" });
    const line = log.mock.calls.map((call) => String(call[0])).find((text) => text.includes("customers_searched"))!;
    expect(JSON.parse(line)).toEqual({ level: "info", event: "customers_searched", length: 10, actorRole: "admin" });
    expect(line).not.toContain("Anna");
  });
});

describe("who may see customers (S-174 AC7, S-175 AC7)", () => {
  test("Admin and Owner load it; anonymous and customer sessions go to sign in with no data", async () => {
    expect((await load("/admin/customers", { role: "admin" })).status).toBe(200);
    expect((await load("/admin/customers", { role: "owner" })).status).toBe(200);
    const session = await signedInAdmin(database);
    const account = await insertCustomerAccount(database, session.auth);
    const cookie = session.auth.sessionCookie(account.id, new Date("2026-11-09T08:00:00Z"));
    for (const c of [undefined, cookie]) {
      let thrown: unknown;
      try {
        await loader(routeArgs(database, { path: "/admin/customers?q=anna", auth: session.auth, cookie: c }) as never);
      } catch (error) {
        thrown = error;
      }
      expect((thrown as Response).headers.get("Location")).toBe("/admin/login?next=%2Fadmin%2Fcustomers%3Fq%3Danna");
    }
  });
});
