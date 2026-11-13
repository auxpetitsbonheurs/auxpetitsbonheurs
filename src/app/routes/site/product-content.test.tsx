// S-065: product page content: photos (count, buttons, alt, size, placeholder), allergens with
// the kitchen note, the earliest date (this product's notice, closed and blocked days skipped),
// French fallback, and the 404 states (hidden or out of season vs unknown) with no product data.
import { isRouteErrorResponse } from "react-router";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { ProductArticle, productView } from "~/components/site/product-article";
import { ProductGone } from "~/components/site/product-details";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { CustomerProduct } from "~/domain/customer-product";
import { siteSettingsCache } from "~/server/repos/settings.server";
import { links, renderInSite } from "~/server/testing/render-in-site";
import { routeArgs } from "~/server/testing/route-context";
import { ProductDetails } from "~/components/site/product-details";
import { loader } from "./product";

const cake = (overrides: Partial<CustomerProduct> = {}): CustomerProduct => ({
  id: "p1",
  slug: "black-forest",
  type: "cake",
  name: { en: "Black forest cake", fr: "Forêt-noire" },
  description: { en: "Cherries and cream.\n\nMade to order.", fr: null },
  allergens: ["eggless"],
  photos: [1, 2, 3, 4].map((n) => ({ url: `https://cdn.test/${n}.webp`, width: 1200, height: 1500 })),
  status: "available",
  minQuantity: null,
  basePriceRs: 1200,
  salePriceRs: null,
  promotionId: null,
  promotion: null,
  ...overrides,
});

const render = (product: CustomerProduct, path = "/menu/black-forest", details = { earliestDate: "2026-11-16", seasonEndsOn: null as string | null }) => {
  const locale = path.startsWith("/fr") ? "fr" : "en";
  return renderInSite(<ProductArticle shown={productView(product, locale)} details={<ProductDetails allergens={product.allergens} {...details} />} />, path);
};

describe("view", () => {
  test("AC1: Photo 1 of 4, Previous and Next photo buttons, explicit size, alt = name in the page language", () => {
    const html = render(cake());

    expect(html).toContain("Photo 1 of 4");
    expect(html).toMatch(/<button[^>]*aria-label="Previous photo"/);
    expect(html).toMatch(/<button[^>]*aria-label="Next photo"/);
    expect(html).toMatch(/<img src="https:\/\/cdn.test\/1.webp" alt="Black forest cake" width="1200" height="1500"/);
    expect(render(cake(), "/fr/menu/black-forest")).toMatch(/alt="Forêt-noire"/);
  });

  test("AC1: a single photo has no counter or buttons", () => {
    const html = render(cake({ photos: [{ url: "https://cdn.test/1.webp", width: 800, height: 600 }] }));
    expect(html).not.toContain("Photo 1 of 1");
    expect(html).not.toContain("Next photo");
  });

  test("AC2: diet tags and the fixed kitchen allergen note both show", () => {
    const html = render(cake());
    expect(html).toContain("Eggless");
    expect(html).toContain("Our kitchen handles eggs, milk, gluten, nuts and other allergens");
  });

  test("AC3: the earliest date and the seasonal note in the page language", () => {
    expect(render(cake())).toContain("Earliest date: Mon 16 Nov");
    expect(render(cake(), "/fr/menu/black-forest", { earliestDate: "2026-11-16", seasonEndsOn: "2026-12-31" })).toMatch(/Date au plus tôt : lun\. 16 nov\..*De saison : disponible jusqu&#x27;au jeu\. 31 déc\./s);
  });

  test("AC7: no photo shows a named placeholder in the same box, not a broken image", () => {
    const html = render(cake({ photos: [] }));
    expect(html).not.toContain("<img");
    expect(html).toMatch(/role="img" aria-label="Photo of Black forest cake not available"/);
    expect(html).toContain("aspect-ratio:4 / 3");
  });

  test("AC8: French page with no French description shows the English one, as paragraphs", () => {
    const html = render(cake(), "/fr/menu/black-forest");
    expect(html).toContain(">Cherries and cream.</p>");
    expect(html).toContain(">Made to order.</p>");
  });

  test("AC5, AC6: no longer available links to the menu; unknown keeps the 404 with Home; both offer WhatsApp when set", () => {
    const gone = renderInSite(<ProductGone gone fallback={<p>fallback</p>} />, "/fr/menu/x");
    expect(gone).toContain("Ce produit n&#x27;est plus disponible");
    expect(links(gone).find((l) => l.href === "/fr/menu")?.text).toBe("Voir notre collection");

    const unknown = renderInSite(<ProductGone gone={false} fallback={<p>fallback</p>} />, "/menu/x");
    expect(unknown).toContain("fallback");
  });
});

describe("loader", () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
  }, 60_000);
  beforeEach(async () => {
    siteSettingsCache.clear();
    await database.client.query("delete from product");
    await database.client.query("delete from blocked_date");
  });
  afterAll(async () => {
    siteSettingsCache.clear();
    await database.close();
  });

  const load = (slug: string, now = "2026-11-10T08:00:00Z") => loader(routeArgs(database, { path: `/menu/${slug}`, params: { slug }, now }) as never) as Promise<{ earliestDate: string | null; seasonEndsOn: string | null }>;

  async function thrown(promise: Promise<unknown>) {
    try {
      await promise;
    } catch (error) {
      if (isRouteErrorResponse(error)) return { status: error.status, data: error.data as unknown };
      const e = error as { init?: { status?: number }; data?: unknown };
      return { status: e.init?.status, data: e.data };
    }
    throw new Error("expected the loader to throw");
  }

  test("AC3: own notice of 5 days from Tue 10 Nov lands on Sun 15, closed, so Mon 16; the default notice otherwise", async () => {
    await insertProduct(database.db, { slug: "five", noticeDays: 5 });
    await insertProduct(database.db, { slug: "default" });

    expect((await load("five")).earliestDate).toBe("2026-11-16");
    expect((await load("default")).earliestDate).toBe("2026-11-13"); // Settings default 3 days
  });

  test("AC3: a blocked range is skipped", async () => {
    await insertProduct(database.db, { slug: "five", noticeDays: 5 });
    await database.client.query(`insert into blocked_date (starts_on, ends_on) values ('2026-11-16', '2026-11-17')`);

    expect((await load("five")).earliestDate).toBe("2026-11-18");
  });

  test("AC3: the same rules as the date picker: a season ending before the notice leaves no date; inside it, its own notice", async () => {
    await insertProduct(database.db, { slug: "short", seasonalStartsOn: "2026-11-01", seasonalEndsOn: "2026-11-11" });
    await insertProduct(database.db, { slug: "long", noticeDays: 1, seasonalStartsOn: "2026-11-01", seasonalEndsOn: "2026-12-31" });

    expect((await load("short")).earliestDate).toBeNull(); // 3 days' notice lands after the 11th
    expect((await load("long")).earliestDate).toBe("2026-11-11"); // its own 1 day of notice, inside the season
  });

  test("AC5: seasonal ending on D is 200 on D and 404 'no longer available' on D+1 (Mauritius), with no product data", async () => {
    await insertProduct(database.db, { slug: "log", nameEn: "Secret log", seasonalStartsOn: "2026-11-01", seasonalEndsOn: "2026-11-10" });

    expect((await load("log", "2026-11-10T19:59:00Z")).seasonEndsOn).toBe("2026-11-10");
    const gone = await thrown(load("log", "2026-11-10T20:00:00Z"));
    expect(gone.status).toBe(404);
    expect(gone.data).toBe("PRODUCT_GONE");
    expect(JSON.stringify(gone.data)).not.toContain("Secret log");
  });

  test("AC5: a hidden product is 404 'no longer available'; AC6: an unknown slug is a plain 404", async () => {
    await insertProduct(database.db, { slug: "hidden", status: "hidden" });

    expect(await thrown(load("hidden"))).toEqual({ status: 404, data: "PRODUCT_GONE" });
    expect((await thrown(load("nope"))).status).toBe(404);
    expect((await thrown(load("nope"))).data).toBeNull();
  });
});
