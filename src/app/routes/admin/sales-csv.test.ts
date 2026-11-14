// `/admin/sales.csv` (S-178, S-179): sections equal to the screen, encoding, safety, access.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertCustomerAccount } from "~/server/testing/admins";
import { signedInAdmin } from "~/server/testing/admin-session";
import { routeArgs } from "~/server/testing/route-context";
import { insertTestCustomer, insertTestOrder } from "~/server/testing/sales";
import { loader as pageLoader } from "./sales";
import { loader } from "./sales-csv";

let database: TestDatabase;
let customerId: string;
const NOW = "2026-11-13T06:00:00Z";

beforeEach(async () => {
  database = await createTestDatabase();
  customerId = await insertTestCustomer(database.db);
}, 60_000);

afterEach(async () => {
  await database.close();
  vi.restoreAllMocks();
});

async function download(query: string, role: "owner" | "admin" = "owner"): Promise<Response> {
  const session = await signedInAdmin(database, { role });
  return loader(routeArgs(database, { path: `/admin/sales.csv?${query}`, auth: session.auth, cookie: session.cookie, now: NOW }) as never);
}

/** Section name → its rows (header row first), the BOM removed. */
function sections(text: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const block of text.replace(/^\uFEFF/, "").split("\r\n\r\n")) {
    const [name, ...rows] = block.split("\r\n").filter((line) => line !== "");
    if (name) out[name] = rows;
  }
  return out;
}

async function seed() {
  const cake = await insertProduct(database.db, { slug: "cake", nameEn: "Chocolate cake" });
  await insertTestOrder(database.db, { customerId, totalRs: 1650, deliveryFeeRs: 150, fulfilment: "delivery", paid: true, items: [{ productId: cake, quantity: 2, lineTotalRs: 1500 }] });
  await insertTestOrder(database.db, { customerId, totalRs: 900, source: "manual", paid: true, items: [{ productId: null, name: "Balloons", quantity: 1, lineTotalRs: 900 }] });
  await insertTestOrder(database.db, { customerId, totalRs: 333, source: "custom_request", paid: true, fulfilOn: "2026-11-30" });
  await insertTestOrder(database.db, { customerId, status: "approved", totalRs: 3000, contactName: "=HYPERLINK(\"http://x\")" });
  await insertTestOrder(database.db, { customerId, status: "out_for_delivery", totalRs: 500, contactName: "Hélène, \"Lili\"" });
  await insertTestOrder(database.db, { customerId, status: "cancelled", totalRs: 7777 });
}

describe("the file (S-178 AC1..AC4, AC8; S-179 AC1..AC3)", () => {
  test("name, type, BOM, CRLF and the five sections", async () => {
    await seed();
    const response = await download("range=month");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="apb-sales-2026-11-01_2026-11-30.csv"');
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = await response.text();
    expect(text.replace(/\r\n/g, "")).not.toContain("\n");
    expect(Object.keys(sections(text))).toEqual(["Summary", "Top products", "By source", "Unpaid", "Orders"]);
  });

  test("Summary equals the on-screen tiles; Orders rows reconcile with revenue", async () => {
    await seed();
    const session = await signedInAdmin(database);
    const page = (await pageLoader(routeArgs(database, { path: "/admin/sales", auth: session.auth, cookie: session.cookie, now: NOW }) as never)) as unknown as { report: Record<string, number> };
    const csv = sections(await (await download("range=month")).text());
    expect(csv.Summary).toEqual([
      "revenue,orders,average,delivery_count,delivery_revenue,pickup_count,pickup_revenue",
      [page.report.revenueRs, page.report.orderCount, page.report.averageRs, page.report.delivery, page.report.deliveryRevenueRs, page.report.pickup, page.report.pickupRevenueRs].join(","),
    ]);
    expect(csv.Summary![1]).toBe("2883,3,961,1,1650,2,1233");
    expect(csv["Top products"]).toEqual(["rank,product,units,revenue", "1,Chocolate cake,2,1500"]);
    expect(csv["By source"]).toEqual(["source,revenue", "website,1650", "custom_request,333", "manual,900", "workshop,0"]);
    const orders = csv.Orders!;
    expect(orders[0]).toBe("number,date,source,fulfilment,items_rs,delivery_fee_rs,total_rs,paid");
    expect(orders).toHaveLength(1 + 3);
    expect(orders[1]).toBe("APB-0001,2026-11-12,website,delivery,1500,150,1650,yes");
    expect(orders.slice(1).reduce((sum, row) => sum + Number(row.split(",")[6]), 0)).toBe(2883);
  });

  test("Unpaid lists every unpaid row with names guarded and quoted; no phone or email anywhere", async () => {
    await seed();
    const text = await (await download("range=month")).text();
    expect(sections(text).Unpaid).toEqual([
      "number,customer,status,date,total",
      "APB-0004,\"'=HYPERLINK(\"\"http://x\"\")\",approved,2026-11-12,3000",
      "APB-0005,\"Hélène, \"\"Lili\"\"\",out_for_delivery,2026-11-12,500",
      "total,,,,3500",
    ]);
    expect(text).not.toContain("57123456");
    expect(text).not.toContain("@example.com");
    expect(text).not.toContain("Anna");
  });

  test("an empty range is a valid file with headers and zero totals", async () => {
    const csv = sections(await (await download("range=custom&from=2027-03-01&to=2027-03-31")).text());
    expect(csv.Summary![1]).toBe("0,0,0,0,0,0,0");
    expect(csv["Top products"]).toEqual(["rank,product,units,revenue"]);
    expect(csv["By source"]).toEqual(["source,revenue", "website,0", "custom_request,0", "manual,0", "workshop,0"]);
    expect(csv.Unpaid).toEqual(["number,customer,status,date,total", "total,,,,0"]);
    expect(csv.Orders).toEqual(["number,date,source,fulfilment,items_rs,delivery_fee_rs,total_rs,paid"]);
  });

  test("1,500 completed orders page through without loss (streamed)", async () => {
    await database.client.query(
      `insert into orders (number, number_prefix, source, status, customer_id, contact_name, contact_phone, fulfilment, fulfil_on, time_window, items_total_rs, total_rs, locale, tracking_token)
       select n, 'APB-', 'website', 'completed', $1, 'Bulk', '+23057123456', 'pickup', '2026-11-12', '{"id":"m","start":"09:00","end":"12:00","label":{"en":"M"}}', 2, 2, 'en', 'bulk-' || n
       from generate_series(1, 1500) n`,
      [customerId],
    );
    const response = await download("range=month");
    expect(response.body).toBeInstanceOf(ReadableStream);
    const csv = sections(await response.text());
    expect(csv.Orders).toHaveLength(1501);
    expect(new Set(csv.Orders).size).toBe(1501);
    expect(csv.Summary![1]!.startsWith("3000,1500,")).toBe(true);
  });

  test("a sales_exported log line with the range and row count only", async () => {
    await seed();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await (await download("range=month")).text();
    const line = log.mock.calls.map((call) => String(call[0])).find((text) => text.includes("sales_exported"));
    expect(JSON.parse(line!)).toEqual({ level: "info", event: "sales_exported", range: "month", rows: 3 });
  });
});

describe("validation and access (S-178 AC7, S-179 AC4..AC6)", () => {
  test("an invalid range or unknown parameter value is VALIDATION_FAILED with no file", async () => {
    for (const query of ["range=custom&from=2026-11-10&to=2026-11-01", "range=custom&from=2025-01-01&to=2026-11-01", "range=year", "range=custom&from=x&to=y"]) {
      const response = await download(query);
      expect(response.status).toBe(400);
      expect(response.headers.get("Content-Type")).toContain("application/json");
      expect(await response.json()).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    }
  });

  test("an Admin can export too (owner decision)", async () => {
    expect((await download("range=week", "admin")).status).toBe(200);
  });

  test("anonymous and customer sessions are sent to sign in, never data", async () => {
    await seed();
    const session = await signedInAdmin(database);
    const customer = await insertCustomerAccount(database, session.auth);
    const customerCookie = session.auth.sessionCookie(customer.id, new Date("2026-11-09T08:00:00Z"));
    for (const cookie of [undefined, customerCookie]) {
      let response!: Response;
      try {
        await loader(routeArgs(database, { path: "/admin/sales.csv?range=month", auth: session.auth, cookie, now: NOW }) as never);
      } catch (refusal) {
        response = refusal as Response;
      }
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/admin/login?next=%2Fadmin%2Fsales.csv%3Frange%3Dmonth");
      expect(response.headers.get("Content-Type") ?? "").not.toContain("text/csv");
      expect(await response.text()).toBe("");
    }
  });
});
