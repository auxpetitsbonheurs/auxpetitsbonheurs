// `admin/uploads` requestUploadUrls (S-047 AC11; AC2 server side: type and size limits).
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { UploadGateway } from "~/server/storage.server";
import { signedInAdmin } from "~/server/testing/admin-session";
import { insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { routeArgs } from "~/server/testing/route-context";
import { action } from "./uploads";

let database: TestDatabase;
let session: Awaited<ReturnType<typeof signedInAdmin>>;
const SESSION = "5f0c3a52-7b1e-4c3d-9a8b-0c1d2e3f4a5b";

beforeAll(async () => {
  database = await createTestDatabase();
  session = await signedInAdmin(database, { name: "Sarah" });
}, 60_000);

afterAll(async () => {
  await database.close();
});

function gateway(): UploadGateway & { signUpload: ReturnType<typeof vi.fn> } {
  return {
    signUpload: vi.fn(async (_bucket: string, path: string) => ({ path, signedUrl: `https://storage.test/storage/v1/object/upload/sign/public-images/${path}?token=t`, token: "t" })),
    inspect: async () => null,
  };
}

/** The action's Response, returned or thrown (guard refusals are thrown). */
const post = (form: Record<string, string | string[]>, s: { auth: FakeAuth; cookie?: string } = session, uploads: UploadGateway | null = gateway()) =>
  (action(routeArgs(database, { path: "/admin/uploads", auth: s.auth, cookie: s.cookie, form, uploads }) as never) as Promise<Response>).catch((error: unknown) => {
    if (error instanceof Response) return error;
    throw error;
  });

describe("AC11: signed upload URLs for an admin", () => {
  test("one URL per file, each a new path under products/<admin>/<editor session>/ in public-images", async () => {
    const uploads = gateway();

    const response = await post({ uploadSessionId: SESSION, type: ["image/webp", "image/jpeg"], size: ["200000", "150000"] }, session, uploads);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: true; uploads: { path: string; signedUrl: string; token: string }[] };
    expect(body.ok).toBe(true);
    expect(body.uploads).toHaveLength(2);
    const prefix = `products/${session.admin.id}/${SESSION}/`;
    expect(body.uploads[0]!.path).toMatch(new RegExp(`^${prefix}[0-9a-f-]{36}\\.webp$`));
    expect(body.uploads[1]!.path).toMatch(new RegExp(`^${prefix}[0-9a-f-]{36}\\.jpg$`));
    expect(body.uploads[0]!.path).not.toBe(body.uploads[1]!.path);
    expect(uploads.signUpload).toHaveBeenCalledWith("public-images", body.uploads[0]!.path);
  });

  test("a customer session is refused with FORBIDDEN and nothing is signed", async () => {
    const auth = new FakeAuth();
    const customer = await insertCustomerAccount(database, auth);
    const cookie = auth.sessionCookie(customer.id, new Date("2026-11-09T08:00:00Z"));
    const uploads = gateway();

    const response = await post({ uploadSessionId: SESSION, type: "image/webp", size: "1000" }, { auth, cookie }, uploads);

    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("FORBIDDEN");
    expect(uploads.signUpload).not.toHaveBeenCalled();
  });

  test("an anonymous visitor gets the login redirect and nothing is signed", async () => {
    const uploads = gateway();

    const response = await post({ uploadSessionId: SESSION, type: "image/webp", size: "1000" }, { auth: new FakeAuth() }, uploads);

    expect(response.headers.get("Location")).toBe("/admin/login?next=%2Fadmin%2Fuploads");
    expect(uploads.signUpload).not.toHaveBeenCalled();
  });
});

describe("refusals", () => {
  test.each([
    ["a file over 1 MB", { type: "image/webp", size: "1048577" }],
    ["a PDF", { type: "application/pdf", size: "1000" }],
    ["an SVG", { type: "image/svg+xml", size: "1000" }],
    ["an empty file", { type: "image/webp", size: "0" }],
    ["six files", { type: Array(6).fill("image/webp"), size: Array(6).fill("1000") }],
  ])("%s is UPLOAD_REJECTED (422)", async (_label, files) => {
    const uploads = gateway();

    const response = await post({ uploadSessionId: SESSION, ...files }, session, uploads);

    expect(response.status).toBe(422);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("UPLOAD_REJECTED");
    expect(uploads.signUpload).not.toHaveBeenCalled();
  });

  test("a malformed editor session id is VALIDATION_FAILED", async () => {
    const response = await post({ uploadSessionId: "../other", type: "image/webp", size: "1000" });

    expect(response.status).toBe(400);
  });

  test("Storage failing to sign is a calm INTERNAL, not a crash", async () => {
    const uploads = gateway();
    uploads.signUpload.mockRejectedValue(new Error("storage sign answered 503"));

    const response = await post({ uploadSessionId: SESSION, type: "image/webp", size: "1000" }, session, uploads);

    expect(response.status).toBe(500);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("INTERNAL");
  });
});

describe("Settings images (S-059 AC6, AC8): scope site", () => {
  test("an Owner gets paths under site/<owner>/<page session>/", async () => {
    const owner = await signedInAdmin(database, { role: "owner" });
    const uploads = gateway();

    const response = await post({ uploadSessionId: SESSION, scope: "site", type: "image/webp", size: "1000" }, owner, uploads);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { uploads: { path: string }[] };
    expect(body.uploads[0]!.path).toMatch(new RegExp(`^site/${owner.admin.id}/${SESSION}/[0-9a-f-]{36}\\.webp$`));
  });

  test("an Admin asking for site images gets FORBIDDEN and nothing is signed", async () => {
    const helper = await signedInAdmin(database, { role: "admin" });
    const uploads = gateway();

    const response = await post({ uploadSessionId: SESSION, scope: "site", type: "image/webp", size: "1000" }, helper, uploads);

    expect(response.status).toBe(403);
    expect(uploads.signUpload).not.toHaveBeenCalled();
  });

  test("an unknown scope is VALIDATION_FAILED", async () => {
    const response = await post({ uploadSessionId: SESSION, scope: "../x", type: "image/webp", size: "1000" });

    expect(response.status).toBe(400);
  });
});

describe("Promotion images (S-053 AC8): scope promotions", () => {
  test("an Admin (promotions are Admin and Owner work) gets paths under promotions/<admin>/<editor session>/", async () => {
    const helper = await signedInAdmin(database, { role: "admin" });
    const uploads = gateway();

    const response = await post({ uploadSessionId: SESSION, scope: "promotions", type: "image/webp", size: "1000" }, helper, uploads);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { uploads: { path: string }[] };
    expect(body.uploads[0]!.path).toMatch(new RegExp(`^promotions/${helper.admin.id}/${SESSION}/[0-9a-f-]{36}\\.webp$`));
  });

  test("a non-image type or an over-limit size is UPLOAD_REJECTED, as for product photos", async () => {
    const helper = await signedInAdmin(database, { role: "admin" });
    const uploads = gateway();

    expect((await post({ uploadSessionId: SESSION, scope: "promotions", type: "application/pdf", size: "1000" }, helper, uploads)).status).toBe(422);
    expect((await post({ uploadSessionId: SESSION, scope: "promotions", type: "image/webp", size: String(50 * 1024 * 1024) }, helper, uploads)).status).toBe(422);
    expect(uploads.signUpload).not.toHaveBeenCalled();
  });
});

describe("Brand page photos (E-13 S-247 AC6, AC8): scope page:<key>", () => {
  test("an Admin (not only an Owner) gets paths under site/pages/<key>/<admin>/<editor session>/", async () => {
    const helper = await signedInAdmin(database, { role: "admin" });
    const uploads = gateway();

    const response = await post({ uploadSessionId: SESSION, scope: "page:our_story", type: "image/webp", size: "1000" }, helper, uploads);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { uploads: { path: string }[] };
    expect(body.uploads[0]!.path).toMatch(new RegExp(`^site/pages/our_story/${helper.admin.id}/${SESSION}/[0-9a-f-]{36}\\.webp$`));
  });

  test("a customer is refused and nothing is signed", async () => {
    const auth = new FakeAuth();
    const customer = await insertCustomerAccount(database, auth);
    const uploads = gateway();

    const response = await post({ uploadSessionId: SESSION, scope: "page:our_story", type: "image/webp", size: "1000" }, { auth, cookie: auth.sessionCookie(customer.id, new Date("2026-11-09T08:00:00Z")) }, uploads);

    expect(response.status).toBe(403);
    expect(uploads.signUpload).not.toHaveBeenCalled();
  });

  test("a page without photos (gallery, contact) is UPLOAD_REJECTED; an unknown page is VALIDATION_FAILED", async () => {
    const uploads = gateway();

    expect((await post({ uploadSessionId: SESSION, scope: "page:gallery", type: "image/webp", size: "1000" }, session, uploads)).status).toBe(422);
    expect((await post({ uploadSessionId: SESSION, scope: "page:contact", type: "image/webp", size: "1000" }, session, uploads)).status).toBe(422);
    expect((await post({ uploadSessionId: SESSION, scope: "page:home", type: "image/webp", size: "1000" }, session, uploads)).status).toBe(400);
    expect(uploads.signUpload).not.toHaveBeenCalled();
  });
});

describe("S-276 AC2: URLs for a photo's smaller copies, beside it", () => {
  const OTHER = "6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
  const original = (adminId: string, session_ = SESSION) => `products/${adminId}/${session_}/0b0f5d3e-2a4c-4e8b-9c1d-7e6f5a4b3c2d.webp`;

  test("variantOf an issued photo: one URL per width, named <stem>-<width>w with the original's extension", async () => {
    const uploads = gateway();
    const path = original(session.admin.id);

    const response = await post({ uploadSessionId: SESSION, variantOf: path, type: ["image/webp", "image/webp"], size: ["30000", "90000"], width: ["480", "960"] }, session, uploads);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { uploads: { path: string }[] };
    expect(body.uploads.map((u) => u.path)).toEqual([path.replace(".webp", "-480w.webp"), path.replace(".webp", "-960w.webp")]);
    expect(uploads.signUpload).toHaveBeenCalledTimes(2);
  });

  test("a brand page photo's copies are signed under its page scope", async () => {
    const uploads = gateway();
    const path = `site/pages/our_story/${session.admin.id}/${SESSION}/0b0f5d3e-2a4c-4e8b-9c1d-7e6f5a4b3c2d.jpg`;

    const response = await post({ uploadSessionId: SESSION, scope: "page:our_story", variantOf: path, type: "image/jpeg", size: "30000", width: "480" }, session, uploads);

    expect(response.status).toBe(200);
    expect(((await response.json()) as { uploads: { path: string }[] }).uploads[0]!.path).toBe(path.replace(".jpg", "-480w.jpg"));
  });

  test.each<[string, (adminId: string) => Record<string, string | string[]>]>([
    ["another admin's photo", () => ({ variantOf: original(OTHER), type: "image/webp", size: "1000", width: "480" })],
    ["another editor session's photo", (id) => ({ variantOf: original(id, OTHER), type: "image/webp", size: "1000", width: "480" })],
    ["a path outside the scope's prefix", () => ({ variantOf: "site/hero.webp", type: "image/webp", size: "1000", width: "480" })],
    ["a path that already names a copy", (id) => ({ variantOf: original(id).replace(".webp", "-480w.webp"), type: "image/webp", size: "1000", width: "480" })],
    ["a width that is not 480 or 960", (id) => ({ variantOf: original(id), type: "image/webp", size: "1000", width: "1200" })],
    ["the same width twice", (id) => ({ variantOf: original(id), type: ["image/webp", "image/webp"], size: ["1000", "1000"], width: ["480", "480"] })],
    ["a type other than the original's", (id) => ({ variantOf: original(id), type: "image/jpeg", size: "1000", width: "480" })],
    ["a copy over 1 MB", (id) => ({ variantOf: original(id), type: "image/webp", size: "1048577", width: "480" })],
  ])("%s is UPLOAD_REJECTED and nothing is signed", async (_label, form) => {
    const uploads = gateway();

    const response = await post({ uploadSessionId: SESSION, ...form(session.admin.id) }, session, uploads);

    expect(response.status).toBe(422);
    expect(uploads.signUpload).not.toHaveBeenCalled();
  });

  test("widths without variantOf, or a width count that does not match the files, is VALIDATION_FAILED", async () => {
    const uploads = gateway();

    expect((await post({ uploadSessionId: SESSION, type: "image/webp", size: "1000", width: "480" }, session, uploads)).status).toBe(400);
    expect((await post({ uploadSessionId: SESSION, variantOf: original(session.admin.id), type: "image/webp", size: "1000" }, session, uploads)).status).toBe(400);
    expect(uploads.signUpload).not.toHaveBeenCalled();
  });
});
