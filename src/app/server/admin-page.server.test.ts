// Every admin response: private no-store + noindex, auth cookies written back, CSRF
// refusal before any loader or action, and the admin UI language (S-009 AC7, AC8, AC12).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { ADMIN_PAGE_HEADERS, adminLocaleContext, adminMiddleware } from "./admin-page.server";
import { authContext } from "./auth-gateway.server";
import { insertAdmin } from "./testing/admins";
import { FakeAuth } from "./testing/fake-auth";
import { routeArgs } from "./testing/route-context";

let database: TestDatabase;
let auth: FakeAuth;

beforeEach(async () => {
  database = await createTestDatabase();
  auth = new FakeAuth();
}, 60_000);

afterEach(async () => {
  await database.close();
});

async function run(args: ReturnType<typeof routeArgs>, respond: () => Response = () => new Response("page")) {
  let reached = false;
  const chain = async (index: number): Promise<Response> => {
    const middleware = adminMiddleware[index];
    if (!middleware) {
      reached = true;
      return respond();
    }
    return (await middleware(args as never, () => chain(index + 1))) as Response;
  };
  return { response: await chain(0), reached };
}

describe("admin responses", () => {
  test("pages, redirects and errors are private, no-store and noindex (AC7)", async () => {
    for (const respond of [() => new Response("page"), () => new Response(null, { status: 302, headers: { Location: "/admin/login" } }), () => new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=60" } })]) {
      const { response } = await run(routeArgs(database, { path: "/admin", auth }), respond);
      expect(ADMIN_PAGE_HEADERS).toEqual({ "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" });
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    }
  });

  test("cookies the gateway produced during the request are written to the response", async () => {
    const args = routeArgs(database, { path: "/admin", auth });
    const { response } = await run(args, () => {
      void args.context.get(authContext).signOut();
      return new Response("page");
    });

    expect(response.headers.get("Set-Cookie")).toMatch(/apb_fake_session=; .*Max-Age=0/);
  });

  test("a cross-site POST is refused with 403 before any action runs (AC8)", async () => {
    const { response, reached } = await run(routeArgs(database, { path: "/admin/sign-out", auth, form: {}, origin: "https://evil.example" }));

    expect(response.status).toBe(403);
    expect(reached).toBe(false);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  test("a same-site POST goes through", async () => {
    const { reached } = await run(routeArgs(database, { path: "/admin/sign-out", auth, form: {} }));

    expect(reached).toBe(true);
  });
});

describe("admin language (AC12)", () => {
  test("a signed-in admin's language wins", async () => {
    const admin = await insertAdmin(database, auth, { locale: "fr" });
    const args = routeArgs(database, { path: "/admin", auth, cookie: auth.sessionCookie(admin.id, new Date("2026-11-09T00:00:00Z")) });

    await run(args);

    expect(args.context.get(adminLocaleContext)).toBe("fr");
  });

  test.each([
    ["the remembered language", { cookie: "apb_locale=fr" }, "fr"],
    ["a French browser", { headers: { "accept-language": "fr-MU,fr;q=0.9" } }, "fr"],
    ["an English browser", { headers: { "accept-language": "en-GB" } }, "en"],
  ] as const)("signed out, the login page follows %s", async (_label, options, expected) => {
    const args = routeArgs(database, { path: "/admin/login", auth, ...options });

    await run(args);

    expect(args.context.get(adminLocaleContext)).toBe(expected);
  });
});
