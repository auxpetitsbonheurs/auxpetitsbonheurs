// `admin/product-preview` (S-051): the customer product page for any status, admins only.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { ADMIN_PAGE_HEADERS, adminMiddleware } from "~/server/admin-page.server";
import { signedInAdmin } from "~/server/testing/admin-session";
import { insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { routeArgs } from "~/server/testing/route-context";
import { productView } from "~/components/site/product-article";
import { loader as customerLoader } from "../site/product";
import { loader, middleware } from "./product-preview";

let database: TestDatabase;
let session: Awaited<ReturnType<typeof signedInAdmin>>;

beforeEach(async () => {
  database = await createTestDatabase();
  session = await signedInAdmin(database, { name: "Sarah" });
}, 60_000);

afterEach(async () => {
  await database.close();
});

type Session = { auth: FakeAuth; cookie?: string };
const preview = (id: string, query = "", s: Session = session) =>
  loader(routeArgs(database, { path: `/admin/menu/${id}/preview${query}`, params: { id }, auth: s.auth, cookie: s.cookie }) as never);

async function thrown(run: () => Promise<unknown>): Promise<{ status?: number; location?: string | null; body?: unknown }> {
  try {
    await run();
  } catch (error) {
    if (error instanceof Response) return { status: error.status, location: error.headers.get("location"), body: await error.text() };
    const envelope = error as { init?: { status?: number }; data?: unknown };
    return { status: envelope.init?.status, body: envelope.data };
  }
  throw new Error("expected the loader to throw");
}

describe("preview of a saved product (AC1)", () => {
  test("a hidden product shows the customer page data, with no way to order", async () => {
    const id = await insertProduct(database.db, { status: "hidden" });

    const page = await preview(id);

    expect(page.status).toBe("hidden");
    expect(page.editUrl).toBe(`/admin/menu/${id}`);
    expect(productView(page.product, page.lang)).toMatchObject({ name: "Chocolate cake", description: "A rich chocolate sponge with ganache.", price: "Rs 850" });
  });

  test("has the same product shape as the live page, so the two cannot drift", async () => {
    const id = await insertProduct(database.db);

    const live = await customerLoader(routeArgs(database, { path: "/menu/chocolate-cake", params: { slug: "chocolate-cake" } }) as never);

    expect((await preview(id)).product).toEqual(live.product);
  });
});

describe("statuses the public page would refuse (AC2)", () => {
  test.each(["sold_out", "hidden"] as const)("%s still renders", async (status) => {
    const id = await insertProduct(database.db, { status });

    expect((await preview(id)).status).toBe(status);
  });

  test("an out-of-season product still renders, and says so", async () => {
    const id = await insertProduct(database.db, { seasonalStartsOn: "2026-12-01", seasonalEndsOn: "2026-12-31" });

    const page = await preview(id);

    expect(page.season).toBe("scheduled");
    expect(page.product.id).toBe(id);
  });
});

describe("language (AC3)", () => {
  test("?lang=fr shows French, with English where there is no French", async () => {
    const id = await insertProduct(database.db, { nameFr: null, descriptionFr: "Une génoise au chocolat." });

    const page = await preview(id, "?lang=fr");

    expect(page.lang).toBe("fr");
    expect(productView(page.product, page.lang)).toMatchObject({ name: "Chocolate cake", description: "Une génoise au chocolat." });
  });

  test("anything else is English", async () => {
    const id = await insertProduct(database.db);

    expect((await preview(id, "?lang=de")).lang).toBe("en");
  });
});

describe("access and headers (AC5)", () => {
  test("an anonymous visitor is sent to sign in, with no product data", async () => {
    const id = await insertProduct(database.db, { status: "hidden" });

    const refused = await thrown(() => preview(id, "", { auth: new FakeAuth() }));

    expect(refused.status).toBe(302);
    expect(refused.location).toMatch(/^\/admin\/login/);
    expect(String(refused.body)).not.toContain("Chocolate");
  });

  test("a customer session is sent to sign in too", async () => {
    const id = await insertProduct(database.db, { status: "hidden" });
    const auth = new FakeAuth();
    const customer = await insertCustomerAccount(database, auth);
    const cookie = auth.sessionCookie(customer.id, new Date("2026-11-09T08:00:00Z"));

    const refused = await thrown(() => preview(id, "", { auth, cookie }));

    expect(refused.location).toMatch(/^\/admin\/login/);
  });

  test("every response is no-store and noindex (the admin page middleware)", () => {
    expect(middleware).toBe(adminMiddleware);
    expect(ADMIN_PAGE_HEADERS).toMatchObject({ "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" });
  });
});

describe("unknown product (AC6)", () => {
  test.each(["7d1f0c9e-1111-4222-8333-944455566677", "not-a-uuid"])("%s is NOT_FOUND (404)", async (id) => {
    expect((await thrown(() => preview(id))).status).toBe(404);
  });
});
