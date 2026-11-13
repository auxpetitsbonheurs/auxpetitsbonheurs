// `admin/order` for a custom request (E-08 S-155 AC2-AC5, S-156 AC1-AC3 AC7 AC8, S-157 AC1 AC3
// AC5, S-161 AC1 AC6): the request with signed photo URLs, Send quote and Refuse.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { requestUploadUrls } from "~/server/services/custom-request.server";
import { signedInAdmin } from "~/server/testing/admin-session";
import { insertCustomerAccount } from "~/server/testing/admins";
import { requestContext, submitTestRequest } from "~/server/testing/custom-requests";
import { FakeAuth } from "~/server/testing/fake-auth";
import { MemoryRequestPhotos } from "~/server/testing/request-photos";
import { routeArgs } from "~/server/testing/route-context";
import { action, loader } from "./order";

let database: TestDatabase;
let session: Awaited<ReturnType<typeof signedInAdmin>>;
let photos: MemoryRequestPhotos;

beforeEach(async () => {
  database = await createTestDatabase();
  session = await signedInAdmin(database, { name: "Sabera" });
  photos = new MemoryRequestPhotos();
}, 60_000);

afterEach(async () => {
  await database.close();
});

/** Routes run on Tue 10 Nov (route-context clock). */
const load = (id: string, auth = session) => loader(routeArgs(database, { path: `/admin/orders/${id}`, params: { id }, auth: auth.auth, cookie: auth.cookie, requestPhotos: photos.gateway }) as never);
const post = (id: string, form: Record<string, string>) =>
  action(routeArgs(database, { path: `/admin/orders/${id}`, params: { id }, auth: session.auth, cookie: session.cookie, form }) as never) as Promise<unknown>;
type Body = { ok: boolean; intent?: string; order?: { status: string; version: number }; error?: { code: string; fields?: Record<string, string> }; values?: Record<string, string> };
const body = (result: unknown): Body => ((result as { data?: Body }).data ?? (result as Body));

async function requestWithPhotos(n: number) {
  if (n === 0) return submitTestRequest(database);
  const session = randomUUID();
  const issued = await requestUploadUrls({ uploadSessionId: session, files: Array.from({ length: n }, () => ({ type: "image/webp" as const, size: 100 })) }, requestContext(database, { photos: photos.gateway }));
  const paths = (issued as { uploads: { path: string }[] }).uploads.map((u) => u.path);
  for (const path of paths) photos.put(path);
  return submitTestRequest(database, { uploadSessionId: session, photoPaths: paths }, { photos: photos.gateway });
}

describe("the request on the order screen (S-155)", () => {
  test("AC2: every field and a photo grid of 10-minute signed URLs; quote defaults today + validity", async () => {
    const placed = await requestWithPhotos(2);

    const page = await load(placed.orderId);

    expect(page.request).toMatchObject({
      occasion: "birthday",
      servings: 20,
      flavours: "Chocolate and passion fruit",
      theme: "Jungle, green and gold",
      cakeText: "Happy 5th birthday Zoé",
      budgetRs: 4000,
      details: "Two tiers, a lion on top.",
      quote: null,
      quoteDefaults: { expiresOn: "2026-11-15" },
    });
    expect(page.request!.photos).toHaveLength(2);
    expect(page.request!.photos[0]!.url).toMatch(/^https:\/\/storage\.test\/sign\/request-photos\/requests\//);
    expect(photos.signedReads.every((s) => s.seconds === 600)).toBe(true);
    expect(page.allowed).toMatchObject({ sendQuote: true, declineRequest: true });
  });

  test("S-156 AC2: Settings quote validity 3 days prefills today + 3", async () => {
    await database.client.query("update settings set quote_validity_days = 3");
    const placed = await requestWithPhotos(0);
    expect((await load(placed.orderId)).request!.quoteDefaults).toEqual({ expiresOn: "2026-11-13" });
  });

  test("AC3: no photos is an empty list (the page says No photos)", async () => {
    const placed = await requestWithPhotos(0);
    expect((await load(placed.orderId)).request!.photos).toEqual([]);
  });

  test("AC5: a photo Storage cannot sign comes back without a URL; the next load signs again", async () => {
    const placed = await requestWithPhotos(1);
    const failing = { ...photos.gateway, signRead: async () => Promise.reject(new Error("storage sign read answered 503")) };
    const page = await loader(routeArgs(database, { path: `/admin/orders/${placed.orderId}`, params: { id: placed.orderId }, auth: session.auth, cookie: session.cookie, requestPhotos: failing }) as never);
    expect(page.request!.photos[0]!.url).toBeNull();
    expect((await load(placed.orderId)).request!.photos[0]!.url).toContain("token=read");
  });

  test("AC4: a customer session gets no order and no signed URL", async () => {
    const placed = await requestWithPhotos(1);
    const auth = new FakeAuth();
    const customer = await insertCustomerAccount(database, auth);
    const before = photos.signedReads.length;
    await expect(load(placed.orderId, { auth, admin: customer, cookie: auth.sessionCookie(customer.id, new Date("2026-11-09T08:00:00Z")) })).rejects.toBeDefined();
    expect(photos.signedReads.length).toBe(before);
  });

  test("a website order has no request part", async () => {
    const placed = await requestWithPhotos(0);
    await database.client.query("update orders set source = 'website' where id = $1", [placed.orderId]);
    expect((await load(placed.orderId)).request).toBeNull();
  });
});

describe("Send quote (S-156, S-161)", () => {
  test("AC1, AC8: sends Rs 4,500 to the default expiry; the result says Quote sent", async () => {
    const placed = await requestWithPhotos(0);

    const result = body(await post(placed.orderId, { intent: "sendQuote", version: "1", amountRs: "4500", note: "Two tiers", expiresOn: "2026-11-15" }));

    expect(result).toEqual({ ok: true, intent: "sendQuote", order: { status: "quote_sent", version: 2 } });
    const page = await load(placed.orderId);
    expect(page.request!.quote).toEqual({ amountRs: 4500, note: "Two tiers", expiresOn: "2026-11-15" });
    expect(page.events.map((e) => e.text)).toContainEqual(expect.stringMatching(/^Quote sent by Sabera, /));
  });

  test("AC3: past expiry, amount 0, over Rs 1,000,000 or a note over 1000: VALIDATION_FAILED with inline errors, nothing changes", async () => {
    const placed = await requestWithPhotos(0);
    const refused = body(await post(placed.orderId, { intent: "sendQuote", version: "1", amountRs: "0", note: "x".repeat(1001), expiresOn: "2026-11-09" }));
    expect(refused.error).toMatchObject({ code: "VALIDATION_FAILED", fields: { amountRs: "Enter a price from Rs 1 to Rs 1,000,000", note: "Keep the note under 1000 characters", expiresOn: "Choose today or a later date" } });
    expect(refused.values).toMatchObject({ amountRs: "0", expiresOn: "2026-11-09" });
    expect(body(await post(placed.orderId, { intent: "sendQuote", version: "1", amountRs: "1000001", expiresOn: "2026-11-15" })).error?.fields).toHaveProperty("amountRs");
    expect((await database.client.query("select status from orders")).rows).toEqual([{ status: "quote_needed" }]);
  });

  test("S-161 AC1: a new quote while Quote sent replaces it", async () => {
    const placed = await requestWithPhotos(0);
    await post(placed.orderId, { intent: "sendQuote", version: "1", amountRs: "4500", expiresOn: "2026-11-15" });
    const second = body(await post(placed.orderId, { intent: "sendQuote", version: "2", amountRs: "5200", expiresOn: "2026-11-18" }));
    expect(second.order).toEqual({ status: "quote_sent", version: 3 });
  });

  test("S-156 AC6: a stale version is ORDER_CHANGED", async () => {
    const placed = await requestWithPhotos(0);
    expect(body(await post(placed.orderId, { intent: "sendQuote", version: "5", amountRs: "4500", expiresOn: "2026-11-15" })).error?.code).toBe("ORDER_CHANGED");
  });
});

describe("Refuse a request (S-157)", () => {
  test("AC1: Quote needed -> Declined with the reason and 'Request declined' (not the order email)", async () => {
    const placed = await requestWithPhotos(0);

    const result = body(await post(placed.orderId, { intent: "declineRequest", version: "1", reason: "Fully booked" }));

    expect(result).toMatchObject({ ok: true, intent: "declineRequest", order: { status: "declined" } });
    const templates = (await database.client.query<{ template: string }>("select template from email_outbox where order_id = $1", [placed.orderId])).rows.map((r) => r.template);
    expect(templates).toContain("request_declined");
    expect(templates).not.toContain("order_declined");
  });

  test("AC3: a reason over 500 characters is VALIDATION_FAILED", async () => {
    const placed = await requestWithPhotos(0);
    expect(body(await post(placed.orderId, { intent: "declineRequest", version: "1", reason: "x".repeat(501) })).error?.code).toBe("VALIDATION_FAILED");
  });

  test("AC4: Quote sent cannot be refused (INVALID_TRANSITION)", async () => {
    const placed = await requestWithPhotos(0);
    await post(placed.orderId, { intent: "sendQuote", version: "1", amountRs: "4500", expiresOn: "2026-11-15" });
    expect(body(await post(placed.orderId, { intent: "declineRequest", version: "2" })).error?.code).toBe("INVALID_TRANSITION");
  });
});
