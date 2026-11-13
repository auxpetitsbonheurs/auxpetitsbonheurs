// POST /api/custom-cake/uploads (E-08 S-153 AC1/AC2, S-162 AC1/AC3): the JSON resource route.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { MemoryRequestPhotos } from "~/server/testing/request-photos";
import { routeArgs } from "~/server/testing/route-context";
import type { TurnstileCheck } from "~/server/turnstile.server";
import { action, loader } from "./request-uploads";

let database: TestDatabase;
let photos: MemoryRequestPhotos;

beforeEach(async () => {
  database = await createTestDatabase();
  photos = new MemoryRequestPhotos();
}, 60_000);

afterEach(async () => {
  await database.close();
});

function post(body: unknown, options: { origin?: string; ip?: string; turnstile?: TurnstileCheck } = {}) {
  const args = routeArgs(database, { path: "/api/custom-cake/uploads", requestPhotos: photos.gateway, turnstile: options.turnstile });
  const request = new Request(args.request.url, {
    method: "POST",
    headers: { "content-type": "application/json", origin: options.origin ?? "http://localhost", "cf-connecting-ip": options.ip ?? "198.51.100.30" },
    body: JSON.stringify(body),
  });
  return action({ ...args, request } as never);
}

const one = (session = randomUUID()) => ({ uploadSessionId: session, files: [{ type: "image/webp", size: 1000 }] });

describe("request photo upload URLs", () => {
  test("S-153 AC1: answers the signed URL for the session prefix, never cached", async () => {
    const session = randomUUID();
    const response = await post(one(session));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = (await response.json()) as { ok: boolean; uploads: { path: string; signedUrl: string }[] };
    expect(body.ok).toBe(true);
    expect(body.uploads[0]!.path.startsWith(`requests/${session}/`)).toBe(true);
    expect(body.uploads[0]!.signedUrl).toContain("/upload/request-photos/");
  });

  test("S-153 AC2: a PDF is 422 UPLOAD_REJECTED", async () => {
    const response = await post({ uploadSessionId: randomUUID(), files: [{ type: "application/pdf", size: 10 }] });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ ok: false, error: { code: "UPLOAD_REJECTED" } });
  });

  test("S-162 AC1: a failed bot check is 400 BOT_CHECK_FAILED", async () => {
    const response = await post(one(), { turnstile: { siteKey: "s", verify: async () => "failed" } });
    expect(response.status).toBe(400);
    expect(photos.signed).toBe(0);
  });

  test("S-162 AC3: the 21st call from one IP is 429 with Retry-After", async () => {
    let last: Response | undefined;
    for (let i = 0; i < 21; i += 1) last = await post(one(), { ip: "203.0.113.60" });
    expect(last!.status).toBe(429);
    expect(last!.headers.get("Retry-After")).toMatch(/^\d+$/);
  });

  test("another site's page cannot spend the visitor's quota; GET is 405", async () => {
    expect((await post(one(), { origin: "https://evil.example" })).status).toBe(403);
    expect(loader().status).toBe(405);
  });
});
