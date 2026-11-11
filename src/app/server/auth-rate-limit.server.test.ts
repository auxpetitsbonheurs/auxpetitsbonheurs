// S-023 AC6: RL-auth also covers admin/forgot and admin/reset (their routes arrive with
// S-025 and S-026 and call this helper). The limit never looks the email up, so known and
// unknown emails get the same answer, and each action keeps its own count.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { TEST_PASSWORD, insertAdmin } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { routeArgs } from "~/server/testing/route-context";
import { AUTH_ACTIONS, clientIp, consumeAuthAttempt, rateLimitedResult } from "./auth-rate-limit.server";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

const args = (ip = "203.0.113.7") => routeArgs(database, { path: "/admin/forgot", headers: { "cf-connecting-ip": ip }, form: {} });

async function sixth(action: (typeof AUTH_ACTIONS)[keyof typeof AUTH_ACTIONS], email: string) {
  for (let i = 0; i < 5; i += 1) expect((await consumeAuthAttempt(args(), action, email)).ok).toBe(true);
  return consumeAuthAttempt(args(), action, email);
}

describe.each([AUTH_ACTIONS.forgot, AUTH_ACTIONS.reset])("%s", (action) => {
  test("the sixth request in 15 minutes is refused, the same for a known and an unknown email", async () => {
    const admin = await insertAdmin(database, new FakeAuth());

    const known = await sixth(action, admin.email);
    const unknown = await sixth(action, "nobody@example.com");

    expect(known).toEqual({ ok: false, retryAfterSeconds: 900 });
    expect(unknown).toEqual(known);
  });
});

test("each action keeps its own count", async () => {
  await sixth(AUTH_ACTIONS.signIn, "sarah@example.com");

  expect((await consumeAuthAttempt(args(), AUTH_ACTIONS.forgot, "sarah@example.com")).ok).toBe(true);
});

test("the limited envelope carries Retry-After and whole minutes, never the password", () => {
  const result = rateLimitedResult(61, "en", { values: { email: "sarah@example.com" } }) as unknown as {
    data: Record<string, unknown>;
    init: { status: number; headers: HeadersInit };
  };

  expect(result.init.status).toBe(429);
  expect(new Headers(result.init.headers).get("Retry-After")).toBe("61");
  expect(result.data).toEqual({
    ok: false,
    error: { code: "RATE_LIMITED", message: "Too many attempts, wait a few minutes." },
    values: { email: "sarah@example.com" },
    retryAfterMinutes: 2,
  });
  expect(JSON.stringify(result.data)).not.toContain(TEST_PASSWORD);
});

test("the IP comes from CF-Connecting-IP, else unknown", () => {
  expect(clientIp(new Request("http://localhost/", { headers: { "cf-connecting-ip": " 203.0.113.7 " } }))).toBe("203.0.113.7");
  expect(clientIp(new Request("http://localhost/"))).toBe("unknown");
});
