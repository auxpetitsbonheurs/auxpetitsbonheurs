// `admin/sales` loader and view (S-171, S-172, S-173): ranges, validation, roles, copy, empty states.
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
import AdminSales, { loader } from "./sales";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
  vi.restoreAllMocks();
});

/** 13 Nov 2026, 10:00 in Mauritius. */
const NOW = "2026-11-13T06:00:00Z";

async function load(path: string, session?: { auth: never; cookie: string }) {
  const s = session ?? (await signedInAdmin(database));
  return loader(routeArgs(database, { path, auth: s.auth, cookie: s.cookie, now: NOW }) as never);
}

/** A loader answer: plain data, or `data(...)` with a status (invalid range). */
function unwrap(result: unknown): { status: number; body: Awaited<ReturnType<typeof loader>> extends infer T ? (T extends { data: infer D } ? D : T) : never } {
  const wrapped = result as { type?: string; data?: unknown; init?: { status?: number } };
  if (wrapped && wrapped.type === "DataWithResponseInit") return { status: wrapped.init?.status ?? 200, body: wrapped.data as never };
  return { status: 200, body: result as never };
}

async function caught(run: () => unknown): Promise<Response> {
  try {
    await run();
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
  throw new Error("expected a thrown response");
}

describe("periods (S-171 AC5, AC6)", () => {
  test("default This month: the range in the header and the figures", async () => {
    const customerId = await insertTestCustomer(database.db);
    await insertTestOrder(database.db, { customerId, totalRs: 1250 });
    const { status, body } = unwrap(await load("/admin/sales"));
    expect(status).toBe(200);
    expect(body).toMatchObject({ range: "month", from: "2026-11-01", to: "2026-11-30", label: "1–30 Nov 2026", invalid: null });
    expect(body.report).toMatchObject({ revenueRs: 1250, orderCount: 1, averageRs: 1250 });
  });

  test("This week and Last month", async () => {
    expect(unwrap(await load("/admin/sales?range=week")).body).toMatchObject({ range: "week", from: "2026-11-09", to: "2026-11-15" });
    expect(unwrap(await load("/admin/sales?range=last_month")).body).toMatchObject({ range: "last_month", from: "2026-10-01", to: "2026-10-31", label: "1–31 Oct 2026" });
  });

  test("Custom loads a valid range, future dates showing zeros", async () => {
    const { body } = unwrap(await load("/admin/sales?range=custom&from=2027-02-01&to=2027-02-10"));
    expect(body).toMatchObject({ range: "custom", from: "2027-02-01", to: "2027-02-10", invalid: null });
    expect(body.report).toMatchObject({ revenueRs: 0, orderCount: 0, averageRs: 0 });
  });

  test("Custom with from > to, over 366 days or a bad date: VALIDATION_FAILED 400 and no data", async () => {
    for (const [query, problem] of [
      ["from=2026-11-10&to=2026-11-01", "order"],
      ["from=2025-01-01&to=2026-11-01", "tooLong"],
      ["from=2026-13-01&to=2026-11-01", "invalid"],
    ] as const) {
      const { status, body } = unwrap(await load(`/admin/sales?range=custom&${query}`));
      expect(status).toBe(400);
      expect(body.invalid).toEqual({ code: "VALIDATION_FAILED", problem });
      expect(body.report).toBeNull();
    }
  });
});

describe("who may see sales (S-171 AC10, S-172 AC6, S-173 AC7)", () => {
  test("an Admin and an Owner load it", async () => {
    for (const role of ["admin", "owner"] as const) {
      const session = await signedInAdmin(database, { role, email: `${role}@example.com` });
      expect(unwrap(await load("/admin/sales", session as never)).status).toBe(200);
    }
  });

  test("anonymous and customer sessions are sent to the sign-in page with no data", async () => {
    const session = await signedInAdmin(database);
    const customer = await insertCustomerAccount(database, session.auth);
    const customerCookie = session.auth.sessionCookie(customer.id, new Date("2026-11-09T08:00:00Z"));
    for (const cookie of [undefined, customerCookie]) {
      const response = await caught(() => loader(routeArgs(database, { path: "/admin/sales?range=week", auth: session.auth, cookie, now: NOW }) as never));
      expect(response.headers.get("Location")).toBe("/admin/login?next=%2Fadmin%2Fsales%3Frange%3Dweek");
      expect(await response.text()).toBe("");
    }
  });

  test("a sales_viewed log line with the range and role only", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await load("/admin/sales?range=week", (await signedInAdmin(database, { role: "admin" })) as never);
    const line = log.mock.calls.map((call) => String(call[0])).find((text) => text.includes("sales_viewed"));
    expect(JSON.parse(line!)).toEqual({ level: "info", event: "sales_viewed", range: "week", actorRole: "admin" });
  });
});

describe("unpaid list and the Payment tab (S-173)", () => {
  test("rows carry a date label and the order link; awaiting payment is counted for the Payment tab", async () => {
    const customerId = await insertTestCustomer(database.db);
    const unpaid = await insertTestOrder(database.db, { customerId, status: "approved", totalRs: 3000, fulfilOn: "2026-11-20" });
    await insertTestOrder(database.db, { customerId, status: "awaiting_payment" });
    const { body } = unwrap(await load("/admin/sales"));
    expect(body.report!.unpaid).toEqual([expect.objectContaining({ id: unpaid.id, number: "APB-0001", dateLabel: "Fri 20 Nov", totalRs: 3000 })]);
    expect(body.awaitingPayment).toBe(1);
  });
});

type Props = Parameters<typeof AdminSales>[0];

async function renderPage(path: string, locale: "en" | "fr" = "en") {
  const { body } = unwrap(await load(path, (await signedInAdmin(database, { locale })) as never));
  const Stub = createRoutesStub([{ path: "/admin/sales", Component: () => <AdminSales {...({ loaderData: body } as unknown as Props)} /> }]);
  return renderToStaticMarkup(
    <I18nProvider locale={locale} messages={messagesFor(locale)}>
      <Stub initialEntries={[path]} />
    </I18nProvider>,
  );
}

describe("the page (S-171 AC4, AC9, AC11, AC12; S-172 AC5, AC7; S-173 AC6)", () => {
  test("zero orders: Rs 0 / 0 / Rs 0, the empty texts, nothing unpaid, and the footnote", async () => {
    const html = await renderPage("/admin/sales");
    expect(html).toContain("No completed orders in this period.");
    expect(html).toContain("Revenue counts Completed orders by order date.");
    expect(html).toContain("Nothing unpaid in this period.");
    expect(html.match(/Rs 0/g)!.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain('role="tablist"');
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>This month</);
  });

  test("figures: tiles, delivery vs pickup in words, top 5 ranks as text, sources and the unpaid row link", async () => {
    const customerId = await insertTestCustomer(database.db);
    await insertTestOrder(database.db, { customerId, totalRs: 1500, fulfilment: "delivery", deliveryFeeRs: 150, source: "manual" });
    await insertTestOrder(database.db, { customerId, status: "approved", totalRs: 3000, contactName: "Hélène" });
    const html = await renderPage("/admin/sales");
    expect(html).toContain("Rs 1,500");
    expect(html).toContain("Delivery");
    expect(html).toContain("Pickup");
    expect(html).toContain("Custom request");
    expect(html).toMatch(/href="\/admin\/orders\/[0-9a-f-]+"/);
    expect(html).toContain("APB-0002, Hélène, Rs 3,000");
  });

  test("in French: labels, sources and the long-form month", async () => {
    const customerId = await insertTestCustomer(database.db);
    await insertTestOrder(database.db, { customerId, totalRs: 1250 });
    const html = await renderPage("/admin/sales", "fr");
    expect(html).toContain("Chiffre d’affaires");
    expect(html).toContain("Total non payé :");
    expect(html).toContain("Rs 1,250");
    expect(html).toContain("Site web");
    expect(html).toContain("Demande sur mesure");
    expect(html).toContain("Manuelle");
    expect(html).toContain("novembre 2026");
  });

  test("an invalid custom range shows the message inline and no figures", async () => {
    const html = await renderPage("/admin/sales?range=custom&from=2026-11-10&to=2026-11-01");
    expect(html).toContain("The start date must be on or before the end date.");
    expect(html).not.toContain("Revenue counts Completed orders");
  });
});
