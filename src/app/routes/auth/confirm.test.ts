// S-026 AC1, AC6: the emailed recovery link lands on /auth/confirm.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertAdmin } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { routeArgs } from "~/server/testing/route-context";
import { loader } from "./confirm";

let database: TestDatabase;
let auth: FakeAuth;

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

beforeEach(() => {
  auth = new FakeAuth();
});

afterAll(async () => {
  await database.close();
});


async function open(query: string): Promise<Response> {
  try {
    await loader(routeArgs(database, { path: `/auth/confirm?${query}`, auth }) as never);
  } catch (thrown) {
    if (thrown instanceof Response) return thrown;
    throw thrown;
  }
  throw new Error("expected a redirect");
}

describe("a valid recovery link (AC1)", () => {
  test("verifies the token, sets the session cookie and lands on /admin/reset", async () => {
    const admin = await insertAdmin(database, auth);
    const token = auth.recoveryToken(admin.email);

    const response = await open(`token_hash=${token}&type=recovery&next=/admin/reset`);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/admin/reset");
    expect(response.headers.get("Set-Cookie")).toMatch(/~recovery; Path=\/; HttpOnly; Secure; SameSite=Lax/);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  test("a used link sets nothing and still lands on /admin/reset (which says it expired)", async () => {
    const admin = await insertAdmin(database, auth);
    const token = auth.recoveryToken(admin.email);
    await open(`token_hash=${token}&type=recovery&next=/admin/reset`);

    const again = await open(`token_hash=${token}&type=recovery&next=/admin/reset`);

    expect(again.headers.get("Location")).toBe("/admin/reset");
    expect(again.headers.get("Set-Cookie")).toBeNull();
  });

  test("a recovery token sent as another type is refused (E-11: customer links), nothing is set", async () => {
    const admin = await insertAdmin(database, auth);
    const token = auth.recoveryToken(admin.email);

    const response = await open(`token_hash=${token}&type=magiclink&next=/admin/reset`);

    expect(response.headers.get("Location")).toBe("/account/sign-in?link=expired");
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });
});

describe("next is never followed off the reset page (AC6)", () => {
  test.each(["https://evil.example", "//evil.example", "/admin/team", "", "/\\evil.example"])("next=%j redirects to /admin/reset", async (next) => {
    const admin = await insertAdmin(database, auth);
    const token = auth.recoveryToken(admin.email);

    const response = await open(`token_hash=${token}&type=recovery&next=${encodeURIComponent(next)}`);

    expect(response.headers.get("Location")).toBe("/admin/reset");
  });
});
