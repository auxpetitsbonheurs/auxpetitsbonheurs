// E-08 submitCustomRequest and requestUploadUrls against PGlite (S-151 AC1 AC3-AC6, S-153
// AC1-AC5, S-154 AC2, S-162 AC1-AC3), with an in-memory private bucket and a fixed clock.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertAdmin } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { REQUEST_NOW, requestContext, requestForm, submitTestRequest } from "~/server/testing/custom-requests";
import { JPEG_BYTES, MemoryRequestPhotos, PDF_BYTES } from "~/server/testing/request-photos";
import type { TurnstileCheck } from "~/server/turnstile.server";
import { requestUploadUrls, submitCustomRequest } from "./custom-request.server";

let database: TestDatabase;
let photos: MemoryRequestPhotos;

beforeEach(async () => {
  database = await createTestDatabase();
  photos = new MemoryRequestPhotos();
}, 60_000);

afterEach(async () => {
  await database.close();
});

const query = async <T>(text: string, params: unknown[] = []) => (await database.client.query<T>(text, params)).rows;
const orderCount = async () => Number((await query<{ n: string }>("select count(*) as n from orders"))[0]!.n);

/** Issues `n` upload URLs for a session and "uploads" each (WebP unless told otherwise). */
async function uploaded(session: string, n: number, ip = "198.51.100.9"): Promise<string[]> {
  const result = await requestUploadUrls({ uploadSessionId: session, files: Array.from({ length: n }, () => ({ type: "image/webp", size: 2000 })) }, requestContext(database, { photos: photos.gateway, ip }));
  if (!result.ok) throw new Error(result.code);
  for (const u of result.uploads) photos.put(u.path);
  return result.uploads.map((u) => u.path);
}

describe("submitCustomRequest (S-151)", () => {
  test("AC1: a valid request without photos is a Quote needed order with number, token and a created event", async () => {
    const placed = await submitTestRequest(database);

    expect(placed).toMatchObject({ ok: true, orderNumber: "APB-0001", replayed: false, locale: "en" });
    expect(placed.trackingToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [order] = await query<Record<string, unknown>>("select source, status, total_rs, fulfil_on::text, time_window->>'id' as window, contact_phone from orders");
    expect(order).toEqual({ source: "custom_request", status: "quote_needed", total_rs: 0, fulfil_on: "2026-11-12", window: "morning", contact_phone: "+23057123456" });
    const [request] = await query<Record<string, unknown>>("select occasion, servings, flavours, theme, cake_text, budget_rs, details, quote_amount_rs from custom_request");
    expect(request).toEqual({ occasion: "birthday", servings: 20, flavours: "Chocolate and passion fruit", theme: "Jungle, green and gold", cake_text: "Happy 5th birthday Zoé", budget_rs: 4000, details: "Two tiers, a lion on top.", quote_amount_rs: null });
    expect(await query("select actor_type, type, to_status from order_event")).toEqual([{ actor_type: "customer", type: "created", to_status: "quote_needed" }]);
  });

  test("AC6: 'Request received' is queued in the page language with the order; admins with email alerts get an alert", async () => {
    const auth = new FakeAuth();
    await insertAdmin(database, auth, { email: "owner@example.com", locale: "fr" });
    const off = await insertAdmin(database, auth, { email: "off@example.com", role: "admin" });
    await query("update admin set alert_email = false where id = $1", [off.id]);

    const placed = await submitTestRequest(database, {}, { locale: "fr" });

    const queued = await query<{ template: string; to_email: string; locale: string; dedupe_key: string }>("select template, to_email, locale, dedupe_key from email_outbox order by template");
    expect(queued).toEqual([
      { template: "admin_alert_new_request", to_email: "owner@example.com", locale: "fr", dedupe_key: expect.stringMatching(new RegExp(`^order:${placed.orderId}:admin_alert:new_request:`)) },
      { template: "request_received", to_email: "aisha@example.com", locale: "fr", dedupe_key: `order:${placed.orderId}:request_received` },
    ]);
    expect(await query("select locale from orders")).toEqual([{ locale: "fr" }]);
  });

  test("AC4: every invalid field is listed at once and nothing is created", async () => {
    const form = requestForm({
      servings: "501",
      cakeText: "x".repeat(201),
      details: "y".repeat(2001),
      budgetRs: "-5",
      "contact.name": undefined,
      "contact.phone": "12",
      "contact.email": "not-an-email",
      acceptPolicies: undefined,
      fulfilment: "delivery",
      "windowId.delivery": "morning",
    });

    const result = await submitCustomRequest(form, requestContext(database));

    expect(result).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    expect(new Set((result as { fields: string[] }).fields)).toEqual(new Set(["servings", "cakeText", "details", "budgetRs", "contact.name", "contact.phone", "contact.email", "acceptPolicies", "address"]));
    expect(await orderCount()).toBe(0);
  });

  test("AC4: servings 0 and an unknown occasion are refused", async () => {
    const result = await submitCustomRequest(requestForm({ servings: "0", occasion: "funeral" }), requestContext(database));
    expect((result as { fields: string[] }).fields).toEqual(expect.arrayContaining(["servings", "occasion"]));
  });

  test("AC3: a blocked date is DATE_UNAVAILABLE with the reason only and the public rules; nothing is created", async () => {
    await query("insert into blocked_date (starts_on, ends_on, reason) values ('2026-11-12', '2026-11-12', 'Private: family wedding')");

    const result = await submitCustomRequest(requestForm(), requestContext(database));

    expect(result).toMatchObject({ ok: false, code: "DATE_UNAVAILABLE", reason: "blocked" });
    expect(JSON.stringify(result)).not.toContain("family wedding");
    expect(await orderCount()).toBe(0);
  });

  test("AC3: a date inside the notice period is too_soon", async () => {
    const result = await submitCustomRequest(requestForm({ date: "2026-11-06" }), requestContext(database));
    expect(result).toMatchObject({ ok: false, code: "DATE_UNAVAILABLE", reason: "too_soon" });
  });

  test("a window that is not in Settings is refused with the fresh lists", async () => {
    const result = await submitCustomRequest(requestForm({ "windowId.pickup": "midnight" }), requestContext(database));
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_FAILED", fields: ["windowId"], windows: { pickup: expect.any(Array) } });
  });

  test("AC5: two submits with one key create one order; the replay returns the same redirect", async () => {
    const form = requestForm();
    const [first, second] = [await submitCustomRequest(form, requestContext(database)), await submitCustomRequest(form, requestContext(database))];

    expect(await orderCount()).toBe(1);
    expect(second).toMatchObject({ ok: true, replayed: true, trackingToken: (first as { trackingToken: string }).trackingToken });
  });

  test("AC5: the same key from another email reveals nothing", async () => {
    const form = requestForm();
    await submitCustomRequest(form, requestContext(database));

    const other = await submitCustomRequest({ ...form, "contact.email": "someone@example.com" }, requestContext(database));

    expect(other).toEqual({ ok: false, code: "VALIDATION_FAILED", fields: [], keyReused: true });
  });

  test("AC5: two simultaneous submits with one key still make one order", async () => {
    const form = requestForm();
    const results = await Promise.all([submitCustomRequest(form, requestContext(database)), submitCustomRequest(form, requestContext(database))]);

    expect(results.every((r) => r.ok)).toBe(true);
    expect(await orderCount()).toBe(1);
  });
});

describe("photos (S-153)", () => {
  test("AC1: upload URLs are signed under the session prefix in the private bucket and queued for 24 h", async () => {
    const session = randomUUID();
    const result = await requestUploadUrls({ uploadSessionId: session, files: [{ type: "image/webp", size: 300_000 }, { type: "image/jpeg", size: 1_048_576 }] }, requestContext(database, { photos: photos.gateway }));

    expect(result.ok).toBe(true);
    const paths = (result as { uploads: { path: string; signedUrl: string }[] }).uploads.map((u) => u.path);
    expect(paths[0]).toMatch(new RegExp(`^requests/${session}/[0-9a-f-]{36}\\.webp$`));
    expect(paths[1]).toMatch(/\.jpg$/);
    const queued = await query<{ bucket: string; due: string }>("select bucket, to_char(due_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI') as due from storage_purge");
    expect(queued).toEqual([{ bucket: "request-photos", due: "2026-11-06T08:00" }, { bucket: "request-photos", due: "2026-11-06T08:00" }]);
  });

  test("AC2: a PDF, a file over 1 MB or six files is UPLOAD_REJECTED with nothing signed", async () => {
    const ctx = requestContext(database, { photos: photos.gateway });
    const session = randomUUID();
    for (const files of [[{ type: "application/pdf", size: 10 }], [{ type: "image/webp", size: 1_048_577 }], Array.from({ length: 6 }, () => ({ type: "image/webp", size: 10 }))]) {
      expect(await requestUploadUrls({ uploadSessionId: session, files }, ctx)).toEqual({ ok: false, code: "UPLOAD_REJECTED" });
    }
    expect(photos.signed).toBe(0);
  });

  test("AC3: uploaded photos become photo rows 0..n with the order, and leave the purge queue", async () => {
    const session = randomUUID();
    const paths = await uploaded(session, 2);

    const placed = await submitTestRequest(database, { uploadSessionId: session, photoPaths: paths }, { photos: photos.gateway });

    const rows = await query<{ storage_path: string; sort_order: number }>("select storage_path, sort_order from custom_request_photo where order_id = $1 order by sort_order", [placed.orderId]);
    expect(rows).toEqual([{ storage_path: paths[0], sort_order: 0 }, { storage_path: paths[1], sort_order: 1 }]);
    expect(await query("select path from storage_purge")).toEqual([]);
  });

  test("AC4: a missing object, a PDF, an object over 1 MB, a path outside the session or a path never issued is UPLOAD_REJECTED", async () => {
    const session = randomUUID();
    const [missing, pdf, big] = await uploaded(session, 3);
    photos.objects.delete(`request-photos/${missing}`);
    photos.put(pdf!, PDF_BYTES, "image/webp");
    photos.put(big!, new Uint8Array([...JPEG_BYTES, ...new Uint8Array(1_048_576)]), "image/jpeg");
    const other = (await uploaded(randomUUID(), 1))[0]!;
    const neverIssued = `requests/${session}/${randomUUID()}.webp`;
    photos.put(neverIssued);

    for (const path of [missing, pdf, big, other, neverIssued]) {
      const result = await submitCustomRequest(requestForm({ uploadSessionId: session, photoPaths: [path!] }), requestContext(database, { photos: photos.gateway }));
      expect(result, path).toEqual({ ok: false, code: "UPLOAD_REJECTED" });
    }
    expect(await orderCount()).toBe(0);
  });

  test("AC5: six paths, or five paths plus a gallery photo, is UPLOAD_REJECTED", async () => {
    const session = randomUUID();
    const six = Array.from({ length: 6 }, () => `requests/${session}/${randomUUID()}.webp`);
    const ctx = requestContext(database, { photos: photos.gateway });
    expect(await submitCustomRequest(requestForm({ uploadSessionId: session, photoPaths: six }), ctx)).toMatchObject({ ok: false });
    expect(await submitCustomRequest(requestForm({ uploadSessionId: session, photoPaths: six.slice(0, 5), galleryPhotoId: randomUUID() }), ctx)).toEqual({ ok: false, code: "UPLOAD_REJECTED" });
    expect(await orderCount()).toBe(0);
  });

  test("S-154 AC2: a gallery photo is saved as photo 1 by reference, before the uploads", async () => {
    const [gallery] = await query<{ id: string }>("insert into gallery_photo (storage_path, width, height) values ('gallery/cake.webp', 1600, 1200) returning id");
    const session = randomUUID();
    const paths = await uploaded(session, 1);

    const placed = await submitTestRequest(database, { uploadSessionId: session, photoPaths: paths, galleryPhotoId: gallery!.id }, { photos: photos.gateway });

    const rows = await query("select storage_path, sort_order, source_gallery_photo_id from custom_request_photo where order_id = $1 order by sort_order", [placed.orderId]);
    expect(rows).toEqual([
      { storage_path: "gallery/cake.webp", sort_order: 0, source_gallery_photo_id: gallery!.id },
      { storage_path: paths[0], sort_order: 1, source_gallery_photo_id: null },
    ]);
  });
});

describe("spam protection (S-162)", () => {
  const refusing: TurnstileCheck = { siteKey: "site", verify: async () => "failed" };

  test("AC1: without a valid Turnstile token no order and no upload URL is created", async () => {
    expect(await submitCustomRequest(requestForm(), requestContext(database, { turnstile: refusing }))).toEqual({ ok: false, code: "BOT_CHECK_FAILED" });
    expect(await requestUploadUrls({ uploadSessionId: randomUUID(), files: [{ type: "image/webp", size: 10 }] }, requestContext(database, { turnstile: refusing, photos: photos.gateway }))).toEqual({ ok: false, code: "BOT_CHECK_FAILED" });
    expect(await orderCount()).toBe(0);
    expect(photos.signed).toBe(0);
  });

  test("AC2: the 4th request from one IP in 10 minutes is RATE_LIMITED with the seconds to wait", async () => {
    const ip = "203.0.113.44";
    for (let i = 0; i < 3; i += 1) await submitTestRequest(database, {}, { ip });

    const fourth = await submitCustomRequest(requestForm(), requestContext(database, { ip }));

    expect(fourth).toEqual({ ok: false, code: "RATE_LIMITED", retryAfterSeconds: expect.any(Number) });
    expect(await orderCount()).toBe(3);
    expect(REQUEST_NOW).toBe("2026-11-05T08:00:00Z");
  });

  test("AC3: the 21st upload URL request from one IP in 10 minutes is RATE_LIMITED", async () => {
    const ctx = requestContext(database, { photos: photos.gateway, ip: "203.0.113.45" });
    const results = [];
    for (let i = 0; i < 21; i += 1) results.push(await requestUploadUrls({ uploadSessionId: randomUUID(), files: [{ type: "image/webp", size: 10 }] }, ctx));
    expect(results.filter((r) => r.ok)).toHaveLength(20);
    expect(results[20]).toMatchObject({ ok: false, code: "RATE_LIMITED" });
  });
});
