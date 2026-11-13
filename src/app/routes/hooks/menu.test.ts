// GET /api/menu (ADR-0004): public catalogue + checkout Settings, ETag, 304, Cache-Control.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { optionChoice, optionGroup } from "~/db/schema";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { isMenuEntry } from "~/domain/menu";
import { siteSettingsCache } from "~/server/repos/settings.server";
import { TEST_SUPABASE_URL, routeArgs } from "~/server/testing/route-context";
import { action as reissue } from "./basket-reissue";
import { MENU_CACHE_CONTROL, etagMatches, loader } from "./menu";

let database: TestDatabase;

beforeEach(async () => {
  siteSettingsCache.clear();
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

const get = (headers: Record<string, string> = {}) => loader(routeArgs(database, { path: "/api/menu", headers }) as never) as Promise<Response>;

describe("GET /api/menu", () => {
  test("200 with the public catalogue, checkout settings, an ETag and public caching", async () => {
    const cake = await insertProduct(database.db);
    const soldOut = await insertProduct(database.db, { slug: "tart", nameEn: "Lemon tart", basePriceRs: 400, status: "sold_out", sortOrder: 2 });
    await insertProduct(database.db, { slug: "secret", nameEn: "Secret cake", status: "hidden" });
    const [group] = await database.db.insert(optionGroup).values({ productId: cake, nameEn: "Size", kind: "single" }).returning({ id: optionGroup.id });
    await database.db.insert(optionChoice).values({ groupId: group!.id, nameEn: "Large", priceDeltaRs: 300 });

    const response = await get();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(MENU_CACHE_CONTROL);
    expect(response.headers.get("Cache-Control")).toMatch(/^public, max-age=60, stale-while-revalidate/);
    const body: unknown = await response.json();
    expect(isMenuEntry(body)).toBe(true);
    const menu = body as { v: string; data: { products: { id: string; status: string; basePriceRs: number; photos: { url: string }[]; optionGroups: { choices: { priceDeltaRs: number }[] }[] }[]; checkout: Record<string, unknown> } };
    expect(response.headers.get("ETag")).toBe(`"${menu.v}"`);
    expect(menu.data.products.map((p) => [p.id, p.status, p.basePriceRs])).toEqual([[cake, "available", 850], [soldOut, "sold_out", 400]]);
    expect(menu.data.products[0]!.photos[0]!.url).toBe("/images/sample/chocolate-cake.svg");
    expect(menu.data.products[0]!.optionGroups[0]!.choices[0]!.priceDeltaRs).toBe(300);
    expect(menu.data.checkout).toMatchObject({ deliveryFeeRs: 200, pickup: { address: "Beau Bassin" } });
    // S-277 AC4: the Juice details are shown only to a customer who has placed an order.
    expect(menu.data.checkout).not.toHaveProperty("payment");
    expect(JSON.stringify(body)).not.toContain("5000 0000");
    expect(menu.data.checkout).not.toHaveProperty("orderNumberPrefix");
    expect(JSON.stringify(body)).not.toContain("Secret cake");
    expect(JSON.stringify(body)).not.toContain(TEST_SUPABASE_URL.replace("https://", "x"));
  });

  test("S-083: the public date rules and each product's notice, blocks from today to the horizon without their private reason", async () => {
    await insertProduct(database.db, { noticeDays: 5 });
    // The route tests' clock is Tue 2026-11-10: the horizon ends before 2027-02-08.
    await database.client.query(
      `insert into blocked_date (starts_on, ends_on, reason) values
        ('2026-11-01', '2026-11-09', 'Past holiday'), ('2026-11-09', '2026-11-11', 'Oven repair'),
        ('2026-12-24', '2026-12-26', 'Family wedding'), ('2027-02-08', '2027-02-10', 'Too far to matter')`,
    );

    const menu = (await (await get()).json()) as { data: { products: { noticeDays: number | null }[]; checkout: { availability: unknown } } };

    expect(menu.data.products[0]!.noticeDays).toBe(5);
    expect(menu.data.checkout.availability).toEqual({
      defaultNoticeDays: 3,
      closedWeekdays: [7],
      blocked: [
        { startsOn: "2026-11-09", endsOn: "2026-11-11" },
        { startsOn: "2026-12-24", endsOn: "2026-12-26" },
      ],
    });
    expect(JSON.stringify(menu)).not.toMatch(/holiday|Oven|wedding|Too far/i);
  });

  test("If-None-Match with the current ETag answers 304 with no body; a changed price changes the ETag", async () => {
    await insertProduct(database.db);
    const etag = (await get()).headers.get("ETag")!;

    const unchanged = await get({ "if-none-match": etag });
    expect(unchanged.status).toBe(304);
    expect(await unchanged.text()).toBe("");
    expect(unchanged.headers.get("ETag")).toBe(etag);

    await database.client.query("update product set base_price_rs = 900");
    const changed = await get({ "if-none-match": etag });
    expect(changed.status).toBe(200);
    expect(changed.headers.get("ETag")).not.toBe(etag);
  });

  test("ETag matching accepts weak tags, lists and *", () => {
    expect(etagMatches('W/"m-1", "m-2"', '"m-2"')).toBe(true);
    expect(etagMatches("*", '"m-2"')).toBe(true);
    expect(etagMatches('"m-1"', '"m-2"')).toBe(false);
    expect(etagMatches(null, '"m-2"')).toBe(false);
  });

  test("one database query when Settings are cached", async () => {
    await insertProduct(database.db);
    await get();
    const query = vi.spyOn(database.client, "query");
    await get();
    expect(query.mock.calls.length).toBe(1);
  });
});

describe("POST /api/basket/reissue", () => {
  test("re-sets an existing basket without HttpOnly; no basket, no cookie", async () => {
    const line = { lineId: "a", productId: "11111111-1111-4111-8111-111111111111", options: [], quantity: 2 };
    const cookie = `apb_basket=${encodeURIComponent(JSON.stringify([line]))}`;
    const response = reissue(routeArgs(database, { path: "/api/basket/reissue", form: {}, cookie }) as never) as Response;

    expect(response.status).toBe(204);
    expect(response.headers.get("Set-Cookie")).toContain(encodeURIComponent(JSON.stringify([line])));
    expect(response.headers.get("Set-Cookie")).not.toContain("HttpOnly");

    const empty = reissue(routeArgs(database, { path: "/api/basket/reissue", form: {} }) as never) as Response;
    expect(empty.headers.get("Set-Cookie")).toBeNull();
  });
});
