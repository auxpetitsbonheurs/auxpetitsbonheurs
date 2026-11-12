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
