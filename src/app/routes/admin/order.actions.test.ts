// `admin/order` actions and detail beyond approve (S-113, S-114, S-116..S-119, S-124, S-125):
// the route parses, authorises and answers per contract; the services' own rules are covered in
// transition-order.server.test.ts and order-flags.server.test.ts.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertCustomerAccount } from "~/server/testing/admins";
import { signedInAdmin } from "~/server/testing/admin-session";
import { placeTestOrder } from "~/server/testing/orders";
import { routeArgs } from "~/server/testing/route-context";
import { action, loader } from "./order";

let database: TestDatabase;
let session: Awaited<ReturnType<typeof signedInAdmin>>;
let id: string;

beforeEach(async () => {
  database = await createTestDatabase();
  session = await signedInAdmin(database, { name: "Sarah" });
  const { token } = await placeTestOrder(database);
  id = (await database.client.query<{ id: string }>("select id from orders where tracking_token = $1", [token])).rows[0]!.id;
  // The created event is stamped by the database clock: pin it before the test clock's actions.
  await database.client.query("update order_event set created_at = '2026-11-12T09:00:00Z' where order_id = $1", [id]);
  // Website orders start awaiting their Juice payment; these tests use the approval path.
  await database.client.query("update orders set status = 'pending_approval' where id = $1", [id]);
}, 60_000);

afterEach(async () => {
  vi.restoreAllMocks();
  await database.close();
});

type Refusal = { data: { ok: false; intent: string | null; error: { code: string; message: string; fields?: Record<string, string> } }; init: { status: number } };

const NOW = "2026-11-12T10:05:00Z";
const post = (form: Record<string, string>, as = session) =>
  action(routeArgs(database, { path: `/admin/orders/${id}`, params: { id }, auth: as.auth, cookie: as.cookie, form, now: NOW }) as never) as Promise<unknown>;
const load = (as = session) => loader(routeArgs(database, { path: `/admin/orders/${id}`, params: { id }, auth: as.auth, cookie: as.cookie }) as never);
const setStatus = (status: string) => database.client.query("update orders set status = $2 where id = $1", [id, status]);
const row = async () => (await database.client.query<Record<string, unknown>>("select status, version, paid, admin_note from orders where id = $1", [id])).rows[0]!;

describe("status actions through the route (S-116, S-117, S-119)", () => {
  test("advance answers the new status; allowed then offers the next step and Back (S-117 AC1, AC8)", async () => {
    await setStatus("approved");

    expect(await post({ intent: "advance", version: "1" })).toEqual({ ok: true, intent: "advance", order: { status: "in_preparation", version: 2, paid: false } });
    expect((await load()).allowed).toMatchObject({ advance: "ready_for_pickup", revert: "approved" });
  });

  test("revert from approved is INVALID_TRANSITION 409 (S-117 AC5)", async () => {
    await setStatus("approved");

    const refused = (await post({ intent: "revert", version: "1" })) as Refusal;
    expect(refused.init.status).toBe(409);
    expect(refused.data).toMatchObject({ intent: "revert", error: { code: "INVALID_TRANSITION" } });
  });

  test("Refuse with a reason (the Juice payment service); the detail shows the reason and the log line (S-116 AC2, S-113 AC1, S-125)", async () => {
    expect(await post({ intent: "decline", version: "1", reason: "Fully booked" })).toMatchObject({ ok: true, order: { status: "declined" } });

    const page = await load();
    expect(page.payment.declineReason).toBe("Fully booked");
    expect(page.events.at(-1)).toMatchObject({ type: "declined", text: "Refused by Sarah, 12 Nov 14:05" });
  });

  test("a custom request is declined with declineRequest; its reason shows in the log (S-116 AC2)", async () => {
    await setStatus("quote_needed");

    expect(await post({ intent: "declineRequest", version: "1", reason: "No slot that week" })).toMatchObject({ ok: true, intent: "declineRequest", order: { status: "declined" } });
    const page = await load();
    expect(page.payment.declineReason).toBe("No slot that week");
    expect(page.events.at(-1)!.notes).toEqual(["Reason: No slot that week"]);
  });

  test("a reason over 500 characters is VALIDATION_FAILED with a field message, and nothing changes (S-116 AC3)", async () => {
    const refused = (await post({ intent: "cancel", version: "1", reason: "x".repeat(501) })) as Refusal;

    expect(refused.init.status).toBe(400);
    expect(refused.data.error.fields).toEqual({ reason: "500 characters at most." });
    expect(await row()).toMatchObject({ status: "pending_approval", version: 1 });
  });

  test("cancel of a paid order: the reason shows and the log notes the refund (S-119 AC2, AC5)", async () => {
    await setStatus("approved");
    await post({ intent: "setPaid", version: "1", paid: "true" });

    expect(await post({ intent: "cancel", version: "2", reason: "Customer called" })).toMatchObject({ ok: true, order: { status: "cancelled", paid: true } });
    const page = await load();
    expect(page.order.reason).toBe("Customer called");
    expect(page.events.at(-1)!.notes).toEqual(["Reason: Customer called", "The order was paid: refund outside the site."]);
  });

  test("setPaid toggles the flag and logs it (S-119 AC1, S-125 AC1)", async () => {
    expect(await post({ intent: "setPaid", version: "1", paid: "true" })).toEqual({ ok: true, intent: "setPaid", order: { status: "pending_approval", version: 2, paid: true } });
    expect((await load()).events.at(-1)!.text).toBe("Marked paid by Sarah, 12 Nov 14:05");
  });

  test("advance and revert lines name the status, in French for a French admin (S-125 AC6)", async () => {
    const french = await signedInAdmin(database, { name: "Amélie", locale: "fr" });
    await setStatus("in_preparation");
    await post({ intent: "advance", version: "1" }, french);
    await post({ intent: "revert", version: "2" }, french);

    expect((await load(french)).events.slice(-2).map((e) => e.text)).toEqual([
      "Passée à « Prête à retirer » par Amélie, 12 Nov 14:05",
      "Revenue à « En préparation » par Amélie, 12 Nov 14:05",
    ]);
  });
});

describe("conflicts (S-124 AC1, AC3, AC6)", () => {
  test("A approves, then B declines with the same version: B gets ORDER_CHANGED and the order stays approved", async () => {
    const other = await signedInAdmin(database, { name: "Bea" });
    await post({ intent: "approve", version: "1" });

    const refused = (await post({ intent: "decline", version: "1" }, other)) as Refusal;
    expect(refused.init.status).toBe(409);
    expect(refused.data.error).toEqual({ code: "ORDER_CHANGED", message: "This order changed. Reload" });
    expect(await row()).toMatchObject({ status: "approved", version: 2 });
  });

  test.each([
    { intent: "advance" },
    { intent: "revert" },
    { intent: "cancel" },
    { intent: "setPaid", paid: "true" },
  ] as Record<string, string>[])("a stale version on $intent is ORDER_CHANGED with no change", async (form) => {
    await database.client.query("update orders set status = 'in_preparation', version = 3 where id = $1", [id]);

    expect(((await post({ ...form, version: "2" })) as Refusal).data.error.code).toBe("ORDER_CHANGED");
    expect(await row()).toMatchObject({ status: "in_preparation", version: 3, paid: false });
  });

  test("a conflict writes one order_conflict log line with ids and no personal data", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await database.client.query("update orders set version = 2 where id = $1", [id]);

    await post({ intent: "approve", version: "1" });

    expect(warn).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(warn.mock.calls[0]![0])) as Record<string, unknown>;
    expect(line).toEqual({ level: "warn", event: "order_conflict", action: "approve", orderId: id, adminId: session.admin.id });
    expect(JSON.stringify(line)).not.toMatch(/Aisha|aisha@|5712/);
  });
});

describe("private note (S-114 AC1-AC3, AC6)", () => {
  test("saveNote stores the note without a version, bump or event; the detail returns it", async () => {
    expect(await post({ intent: "saveNote", adminNote: "Nut allergy: call first" })).toEqual({ ok: true, intent: "saveNote" });

    expect(await row()).toMatchObject({ admin_note: "Nut allergy: call first", version: 1 });
    const page = await load();
    expect(page.adminNote).toBe("Nut allergy: call first");
    expect(page.events).toHaveLength(1);
  });

  test("a note over 2000 characters is VALIDATION_FAILED and nothing is stored", async () => {
    const refused = (await post({ intent: "saveNote", adminNote: "x".repeat(2001) })) as Refusal;

    expect(refused.init.status).toBe(400);
    expect(refused.data.error.fields).toEqual({ adminNote: "The note is too long: 2000 characters at most. Your text is kept." });
    expect(await row()).toMatchObject({ admin_note: null });
  });

  test("a customer cannot save a note (FORBIDDEN) and an anonymous visitor is sent to login", async () => {
    const customer = await insertCustomerAccount(database, session.auth);
    const customerCookie = session.auth.sessionCookie(customer.id, new Date("2026-11-09T08:00:00Z"));
    for (const cookie of [customerCookie, undefined]) {
      let thrown: unknown;
      try {
        await action(routeArgs(database, { path: `/admin/orders/${id}`, params: { id }, auth: session.auth, cookie, form: { intent: "saveNote", adminNote: "hi" } }) as never);
      } catch (error) {
        thrown = error;
      }
      if (cookie) expect((thrown as { init: { status: number } }).init.status).toBe(403);
      else expect((thrown as Response).headers.get("Location")).toMatch(/^\/admin\/login\?next=/);
    }
    expect(await row()).toMatchObject({ admin_note: null });
  });
});

describe("detail fields (S-113 AC3, AC5, AC8)", () => {
  test("no usable phone: Call and WhatsApp links are null", async () => {
    await database.client.query("update orders set contact_phone = '' where id = $1", [id]);

    const page = await load();
    expect(page).toMatchObject({ telUrl: null, whatsappUrl: null, mapsUrl: null });
  });

  test("a delivery order whose address is blank on legacy data has no Maps link", async () => {
    await database.client.query("update orders set fulfilment = 'delivery', address = '  ' where id = $1", [id]);

    expect((await load()).mapsUrl).toBeNull();
  });

  test("a total set by hand is flagged", async () => {
    await database.client.query("update orders set total_overridden = true where id = $1", [id]);

    expect((await load()).order.totalOverridden).toBe(true);
  });

  test("a custom request shows its request fields and quote", async () => {
    await database.client.query("update orders set source = 'custom_request', status = 'quote_sent' where id = $1", [id]);
    await database.client.query(
      "insert into custom_request (order_id, occasion, servings, theme, quote_amount_rs, quote_expires_on) values ($1, 'Birthday', 12, 'Unicorn', 2500, '2026-11-20')",
      [id],
    );

    const page = await load();
    expect(page.order.customRequest).toMatchObject({ occasion: "Birthday", servings: 12, theme: "Unicorn", quoteAmountRs: 2500, quoteExpiresOn: "2026-11-20" });
    expect(page.order.quoteExpiresLabel).toBe("Fri 20 Nov");
    expect(page.allowed).toMatchObject({ sendQuote: true, cancel: true, approve: false });
  });
});
