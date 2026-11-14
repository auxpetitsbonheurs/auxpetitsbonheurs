// `admin/customer` loader, saveNote and view (S-176, S-177).
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { messagesFor } from "~/i18n/catalog.server";
import { I18nProvider } from "~/i18n/react";
import { insertCustomerAccount } from "~/server/testing/admins";
import { signedInAdmin } from "~/server/testing/admin-session";
import { FakeUserAdmin } from "~/server/testing/fake-user-admin";
import { routeArgs } from "~/server/testing/route-context";
import { userAdminContext } from "~/server/user-admin.server";
import { insertTestCustomer, insertTestOrder } from "~/server/testing/sales";
import AdminCustomer, { action, loader } from "./customer";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
  vi.restoreAllMocks();
});

async function session(options: { role?: "owner" | "admin"; locale?: "en" | "fr" } = {}) {
  return signedInAdmin(database, options);
}

async function load(id: string, s?: Awaited<ReturnType<typeof session>>) {
  const me = s ?? (await session());
  return loader(routeArgs(database, { path: `/admin/customers/${id}`, params: { id }, auth: me.auth, cookie: me.cookie }) as never);
}

async function post(id: string, form: Record<string, string>, s?: Awaited<ReturnType<typeof session>>) {
  const me = s ?? (await session());
  const result = (await action(routeArgs(database, { path: `/admin/customers/${id}`, params: { id }, auth: me.auth, cookie: me.cookie, form }) as never)) as unknown;
  const wrapped = result as { type?: string; data?: unknown; init?: { status?: number } };
  return wrapped.type === "DataWithResponseInit" ? { status: wrapped.init?.status ?? 200, body: wrapped.data as Record<string, unknown> } : { status: 200, body: result as Record<string, unknown> };
}

async function thrown(run: () => unknown): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}

describe("detail (S-176 AC1..AC4)", () => {
  test("contact, language, account, totals, Call and WhatsApp links, every order newest first", async () => {
    const id = await insertTestCustomer(database.db, { name: "Anna Rault", locale: "fr", email: "anna@example.com" });
    await insertTestOrder(database.db, { customerId: id, totalRs: 1000, contactName: "Anna", createdAt: new Date("2026-11-01T06:00:00Z"), fulfilOn: "2026-11-12" });
    await insertTestOrder(database.db, { customerId: id, status: "declined", totalRs: 400, contactName: "A. Rault", createdAt: new Date("2026-11-05T06:00:00Z"), fulfilOn: "2026-11-14" });
    const page = await load(id);
    expect(page.customer).toMatchObject({ name: "Anna Rault", phone: "+23057123456", email: "anna@example.com", locale: "fr", hasAccount: false, deleted: false, telUrl: "tel:+23057123456", whatsappUrl: "https://wa.me/23057123456" });
    expect(page).toMatchObject({ orderCount: 1, totalSpentRs: 1000 });
    expect(page.orders.map((o) => [o.contactName, o.status, o.dateLabel])).toEqual([["A. Rault", "declined", "Sat 14 Nov"], ["Anna", "completed", "Thu 12 Nov"]]);
    const html = render(page);
    expect(html).toContain('href="tel:+23057123456"');
    expect(html).toContain(">Call Anna Rault<");
    expect(html).toContain(">WhatsApp Anna Rault<");
    expect(html).toMatch(/href="\/admin\/orders\/[0-9a-f-]+"/);
    expect(html).toContain("Ordered as A. Rault");
    expect(html).toContain("French");
  });

  test("no orders; anonymised shows Deleted customer without phone or links", async () => {
    const none = await insertTestCustomer(database.db, { name: "New" });
    expect(render(await load(none))).toContain("No orders yet.");
    const gone = await insertTestCustomer(database.db, { anonymised: true, email: null });
    const page = await load(gone);
    expect(page.customer).toMatchObject({ deleted: true, phone: null, telUrl: null, whatsappUrl: null });
    expect(render(page)).not.toContain("tel:");
  });

  test("unknown or malformed id: 404", async () => {
    for (const id of ["00000000-0000-4000-8000-000000000000", "not-a-uuid"]) {
      expect((await thrown(() => load(id)) as { init: { status: number } }).init.status).toBe(404);
    }
  });
});

describe("private note (S-177)", () => {
  test("AC1: saves, another admin sees it; AC2: 2000 saves, 2001 is refused, empty clears", async () => {
    const id = await insertTestCustomer(database.db);
    expect((await post(id, { intent: "saveNote", adminNote: "Allergic to nuts" })).body).toEqual({ ok: true, intent: "saveNote", adminNote: "Allergic to nuts" });
    expect((await load(id, await session({ role: "admin" }))).customer.adminNote).toBe("Allergic to nuts");
    const tooLong = await post(id, { intent: "saveNote", adminNote: "x".repeat(2001) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED", fields: { adminNote: "The note can have at most 2000 characters." } } });
    expect((await load(id)).customer.adminNote).toBe("Allergic to nuts");
    expect((await post(id, { intent: "saveNote", adminNote: "y".repeat(2000) })).status).toBe(200);
    expect((await post(id, { intent: "saveNote", adminNote: "   " })).body).toMatchObject({ ok: true, adminNote: null });
    expect((await load(id)).customer.adminNote).toBeNull();
  });

  test("AC4: last write wins", async () => {
    const id = await insertTestCustomer(database.db);
    await post(id, { intent: "saveNote", adminNote: "first" });
    await post(id, { intent: "saveNote", adminNote: "second" }, await session({ role: "admin" }));
    expect((await load(id)).customer.adminNote).toBe("second");
  });

  test("AC5: unknown customer NOT_FOUND; unknown intent refused", async () => {
    expect((await post("00000000-0000-4000-8000-000000000000", { intent: "saveNote", adminNote: "x" })).body).toMatchObject({ error: { code: "NOT_FOUND" } });
    expect((await post("00000000-0000-4000-8000-000000000000", { intent: "delete" })).status).toBe(400);
  });

  test("AC3: the log line carries the id and role only, never the note", async () => {
    const id = await insertTestCustomer(database.db);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await post(id, { intent: "saveNote", adminNote: "Secret allergy" });
    const lines = log.mock.calls.map((call) => String(call[0]));
    expect(lines.join("\n")).not.toContain("Secret allergy");
    expect(JSON.parse(lines.find((l) => l.includes("customer_note_saved"))!)).toEqual({ level: "info", event: "customer_note_saved", customerId: id, actorRole: "owner" });
  });

  test("AC6: anonymous redirects, a customer session is FORBIDDEN", async () => {
    const id = await insertTestCustomer(database.db);
    const me = await session();
    const account = await insertCustomerAccount(database, me.auth);
    const cookie = me.auth.sessionCookie(account.id, new Date("2026-11-09T08:00:00Z"));
    const args = (c?: string) => routeArgs(database, { path: `/admin/customers/${id}`, params: { id }, auth: me.auth, cookie: c, form: { intent: "saveNote", adminNote: "x" } }) as never;
    expect(((await thrown(() => action(args()))) as Response).headers.get("Location")).toBe(`/admin/login?next=${encodeURIComponent(`/admin/customers/${id}`)}`);
    expect(((await thrown(() => action(args(cookie)))) as { init: { status: number } }).init.status).toBe(403);
    const loaded = await thrown(() => loader(routeArgs(database, { path: `/admin/customers/${id}`, params: { id }, auth: me.auth, cookie }) as never));
    expect((loaded as Response).headers.get("Location")).toContain("/admin/login");
    expect((await load(id)).customer.adminNote).toBeNull();
  });
});

describe("Anonymise customer (PRV-02, S-229 AC6): Owner only, confirm first, idempotent", () => {
  async function anonymise(id: string, s: Awaited<ReturnType<typeof session>>, users = new FakeUserAdmin(database, s.auth)) {
    const args = routeArgs(database, { path: `/admin/customers/${id}`, params: { id }, auth: s.auth, cookie: s.cookie, form: { intent: "anonymise" }, now: "2026-11-14T08:00:00Z" }) as unknown as { context: { set: (k: unknown, v: unknown) => void } };
    args.context.set(userAdminContext, users);
    const result = (await action(args as never)) as unknown as { type?: string; data?: unknown; init?: { status?: number } };
    return result.type === "DataWithResponseInit" ? { status: result.init?.status ?? 200, body: result.data as Record<string, unknown> } : { status: 200, body: result as Record<string, unknown> };
  }

  test("an Owner sees the section with a confirm; an Admin does not, and an Admin's post is FORBIDDEN with nothing changed", async () => {
    const id = await insertTestCustomer(database.db, { name: "Anna Rault" });
    const owner = await session({ role: "owner" });
    const admin = await session({ role: "admin" });

    expect((await load(id, owner)).anonymise).toEqual({ allowed: true, openOrders: 0 });
    expect(render(await load(id, owner))).toContain(">Anonymise customer<");
    expect((await load(id, admin)).anonymise).toEqual({ allowed: false, openOrders: 0 });
    expect(render(await load(id, admin))).not.toContain("Anonymise customer");
    expect(await anonymise(id, admin)).toMatchObject({ status: 403, body: { ok: false, intent: "anonymise", error: { code: "FORBIDDEN" } } });
    expect((await load(id, owner)).customer.deleted).toBe(false);
  });

  test("the Owner anonymises: the page then shows Deleted customer, no contact, no note box, and a second post is still ok", async () => {
    const id = await insertTestCustomer(database.db, { name: "Anna Rault", adminNote: "Nut allergy" });
    await insertTestOrder(database.db, { customerId: id, totalRs: 1500 });
    const owner = await session({ role: "owner" });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(await anonymise(id, owner)).toEqual({ status: 200, body: { ok: true, intent: "anonymise", outcome: "anonymised" } });
    expect(JSON.stringify(log.mock.calls)).not.toContain("Anna");
    const page = await load(id, owner);
    expect(page.customer).toMatchObject({ name: "Deleted customer", phone: null, email: null, deleted: true, adminNote: null, telUrl: null });
    expect(page).toMatchObject({ orderCount: 1, totalSpentRs: 1500, anonymise: { allowed: false } });
    const html = render(page);
    expect(html).toContain("Personal data removed on Sat 14 Nov.");
    expect(html).not.toContain("Private note");
    expect(await anonymise(id, owner)).toEqual({ status: 200, body: { ok: true, intent: "anonymise", outcome: "already" } });
  });

  test("open orders: the page says to finish them first instead of offering the button, and a post is refused with the count (FR)", async () => {
    const id = await insertTestCustomer(database.db, {});
    await insertTestOrder(database.db, { customerId: id, status: "approved" });
    const owner = await session({ role: "owner", locale: "fr" });

    const page = await load(id, owner);
    expect(page.anonymise).toEqual({ allowed: true, openOrders: 1 });
    const html = render(page, "fr");
    expect(html).toContain("Terminez ou annulez d’abord sa commande en cours");
    expect(html).not.toContain(">Anonymiser le client<");
    const answer = await anonymise(id, owner);
    expect(answer.status).toBe(409);
    expect(answer.body).toMatchObject({ ok: false, intent: "anonymise", error: { code: "INVALID_TRANSITION", message: "Ce client a 1 commande en cours. Terminez-la ou annulez-la d’abord." } });
  });

  test("the sign-in account could not be removed: nothing changed, a calm retry message", async () => {
    const owner = await session({ role: "owner" });
    const account = await insertCustomerAccount(database, owner.auth);
    const { rows } = await database.client.query<{ id: string }>("select id from customer where email = $1", [account.email]);
    const users = new FakeUserAdmin(database, owner.auth);
    users.deleteFails = true;

    const answer = await anonymise(rows[0]!.id, owner, users);

    expect(answer.status).toBe(502);
    expect(answer.body).toMatchObject({ ok: false, error: { code: "INTERNAL", message: "The customer's sign-in account could not be removed, so nothing was changed. Try again in a minute." } });
    expect((await load(rows[0]!.id, owner)).customer.deleted).toBe(false);
  });

  test("an unknown customer is NOT_FOUND", async () => {
    const owner = await session({ role: "owner" });
    expect((await anonymise(crypto.randomUUID(), owner)).body).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

function render(loaderData: Awaited<ReturnType<typeof loader>>, locale: "en" | "fr" = "en") {
  const props = { loaderData } as unknown as Parameters<typeof AdminCustomer>[0];
  const Stub = createRoutesStub([{ path: "/admin/customers/:id", Component: () => <AdminCustomer {...props} /> }]);
  return renderToStaticMarkup(
    <I18nProvider locale={locale} messages={messagesFor(locale)}>
      <Stub initialEntries={[`/admin/customers/${loaderData.customer.id}`]} />
    </I18nProvider>,
  );
}
