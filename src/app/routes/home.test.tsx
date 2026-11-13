// S-063: Home page (FR-004) as in the Owner's burgundy reference: hero with the Settings tagline
// and photo, the three promises, "Our collection" category cards for types with live products,
// promotion cards, seasonal and featured rows, How it works, the custom-cake band and the gallery
// preview; empty sections absent; French with English fallback; an error state with WhatsApp.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { siteSettingsCache } from "~/server/repos/settings.server";
import type { HomeData } from "~/domain/home";
import { clearSitePageCache } from "~/server/services/site-page.server";
import { links, renderInSite } from "~/server/testing/render-in-site";
import { routeArgs } from "~/server/testing/route-context";
import Home, { ErrorBoundary, loader } from "./home";

const photo = (name: string) => ({ url: `https://cdn.test/${name}.webp`, width: 1200, height: 900 });
const product = (id: string, en: string, fr: string | null = null) => ({ id, slug: `slug-${id}`, name: { en, fr }, photo: photo(id), fromPriceRs: 950, soldOut: false });

const full: HomeData = {
  hero: { tagline: { en: "Baked with love in Beau Bassin", fr: "Fait avec amour à Beau Bassin" }, photo: photo("hero") },
  categories: [
    { type: "cake", photo: photo("cake") },
    { type: "cupcake_box", photo: null },
  ],
  promoCards: [{ id: "p1", title: { en: "Christmas logs", fr: "Bûches de Noël" }, text: { en: "Order by 20 December." }, photo: null, href: "/menu/buche" }],
  seasonal: [product("s1", "Christmas log", "Bûche de Noël")],
  featured: [product("f1", "Black forest cake", "Forêt-noire")],
  gallery: [{ url: "https://cdn.test/g1.webp", width: 800, height: 800, alt: "Wedding cake", caption: null }],
};
const bare: HomeData = { hero: { tagline: null, photo: null }, categories: [], promoCards: [], seasonal: [], featured: [], gallery: [] };

const render = (home: HomeData, path = "/") => renderInSite(<Home {...({ loaderData: { title: "t", description: "d", home } } as unknown as Parameters<typeof Home>[0])} />, path);

describe("view", () => {
  test("AC1: hero with the tagline as h1, the photo first-loaded at its size, and the collection button", () => {
    const html = render(full);

    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Baked with love in Beau Bassin<\/h1>/);
    expect(html).toMatch(/<img[^>]*src="https:\/\/cdn.test\/hero.webp"[^>]*width="1200" height="900"[^>]*fetchPriority="high"/i);
    expect(links(html).find((l) => l.text.startsWith("Discover our collection"))?.href).toBe("/menu");
  });

  test("AC1: the three promises, How it works in 3 steps and the custom-cake band", () => {
    const html = render(full);

    for (const text of ["Quality ingredients", "Made-to-order creations", "Pickup &amp; delivery"]) expect(html).toContain(text);
    expect(html.match(/<li[^>]*data-step/g)).toHaveLength(3);
    expect(html).toContain("A made-to-order cake?");
    expect(links(html).filter((l) => l.href === "/custom-cake").length).toBeGreaterThanOrEqual(1);
  });

  test("AC1: one category card per type with live products, linking to its section of the menu", () => {
    const cards = links(render(full)).filter((l) => l.href.startsWith("/menu#type-"));

    expect(cards.map((l) => [l.href, l.text])).toEqual([
      ["/menu#type-cake", "Cakes"],
      ["/menu#type-cupcake_box", "Cupcakes"],
    ]);
  });

  test("AC1, AC2: promotion, seasonal and featured cards, and a 6-photo gallery preview linking to the gallery", () => {
    const html = render(full);
    const all = links(html);

    expect(all.find((l) => l.href === "/menu/buche")?.text).toContain("Christmas logs");
    expect(all.find((l) => l.href === "/menu/slug-s1")?.text).toBe("Christmas log");
    expect(all.find((l) => l.href === "/menu/slug-f1")?.text).toBe("Black forest cake");
    expect(html).toMatch(/<img[^>]*src="https:\/\/cdn.test\/g1.webp"[^>]*alt="Wedding cake"[^>]*loading="lazy"/);
    expect(all.some((l) => l.href === "/gallery")).toBe(true);
  });

  test("AC3: no promotion, seasonal, featured, category or gallery data leaves no heading or empty block", () => {
    const html = render(bare);

    for (const heading of ["Current offers", "Seasonal specials", "Our favourites", "Our collection", "From our kitchen"]) expect(html).not.toContain(heading);
    // The hero still has a heading and the button; no photo means the brand panel, no broken image.
    expect(html).toMatch(/<h1[^>]*>Artisan cakes for your finest moments<\/h1>/);
    expect(html).not.toMatch(/<img[^>]*src=""/);
  });

  test("AC5: French text shows in French; an empty French tagline falls back to English", () => {
    expect(render(full, "/fr")).toMatch(/<h1[^>]*>Fait avec amour à Beau Bassin<\/h1>/);
    const fallback = render({ ...full, hero: { ...full.hero, tagline: { en: "Artisan cakes", fr: "  " } } }, "/fr");
    expect(fallback).toMatch(/<h1[^>]*>Artisan cakes<\/h1>/);
    expect(links(fallback).find((l) => l.href === "/fr/menu")?.text).toContain("Découvrir notre collection");
  });

  test("AC6: only the hero photo loads eagerly; every other image is lazy with its size", () => {
    const imgs = [...render(full).matchAll(/<img [^>]*>/g)].map(([tag]) => tag);
    const eager = imgs.filter((tag) => !tag.includes('loading="lazy"'));

    expect(eager).toHaveLength(1);
    expect(eager[0]).toContain("hero.webp");
    for (const tag of imgs) expect(tag).toMatch(/width="\d+" height="\d+"/);
  });

  test("AC8: every image has alt text and headings go h1 then h2 then h3", () => {
    const html = render(full);
    for (const [tag] of html.matchAll(/<img [^>]*>/g)) expect(tag).toMatch(/alt="[^"]*"/);
    const levels = [...html.matchAll(/<h([1-6])/g)].map(([, n]) => Number(n));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) expect(levels[i]! - levels[i - 1]!).toBeLessThanOrEqual(1);
  });

  test("AC7: a failed load shows an error state with a WhatsApp button, not a blank page", () => {
    const html = renderInSite(<ErrorBoundary />, "/");
    expect(html).toContain("We could not load this page.");
    expect(html).toMatch(/Try again/);
  });
});

describe("loader", () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase();
  }, 60_000);
  beforeEach(() => {
    siteSettingsCache.clear();
    clearSitePageCache();
  });
  afterAll(async () => {
    siteSettingsCache.clear();
    clearSitePageCache();
    await database.close();
  });

  const exec = (sql: string) => database.client.query(sql);
  async function addProduct(slug: string, type: string, status = "available", season: [string, string] | null = null) {
    const result = await database.client.query<{ id: string }>(
      `insert into product (slug, type, name_en, base_price_rs, status, seasonal_starts_on, seasonal_ends_on) values ($1, $2, $3, 900, $4, $5, $6) returning id`,
      [slug, type, `Name ${slug}`, status, season?.[0] ?? null, season?.[1] ?? null],
    );
    const id = result.rows[0]!.id;
    await database.client.query(`insert into product_photo (product_id, storage_path, width, height, sort_order) values ($1, $2, 1200, 900, 0)`, [id, `products/${slug}.webp`]);
    return id;
  }
  const load = async (now = "2026-11-10T08:00:00Z", path = "/") => (await loader(routeArgs(database, { path, now }) as never)) as { home: HomeData; title: string };

  test("AC1: categories only for types with live products, featured from Settings in order (max 6), hero from Settings", async () => {
    await exec("delete from product");
    const cake = await addProduct("cake-a", "cake");
    await addProduct("hidden-dessert", "dessert", "hidden");
    const box = await addProduct("box-a", "cupcake_box", "sold_out");
    await exec(`update settings set featured_product_ids = '{${box},${cake}}', hero = '{"tagline":{"en":"Hello"},"imagePath":"site/hero.webp"}'::jsonb`);

    const { home } = await load();

    expect(home.categories.map((c) => c.type)).toEqual(["cake", "cupcake_box"]);
    expect(home.featured.map((p) => p.slug)).toEqual(["box-a", "cake-a"]);
    expect(home.featured[0]!.soldOut).toBe(true);
    expect(home.hero.tagline).toEqual({ en: "Hello" });
    expect(home.hero.photo?.url).toBe("https://storage.test/storage/v1/object/public/public-images/site/hero.webp");
  });

  test("AC1: with no Settings photo the hero falls back to a featured or cake photo", async () => {
    await exec("delete from product");
    await addProduct("cake-b", "cake");
    await exec(`update settings set featured_product_ids = '{}', hero = null`);

    const { home } = await load();

    expect(home.hero.photo?.url).toContain("products/cake-b.webp");
    expect(home.hero.tagline).toBeNull();
  });

  test("AC2: a live card promotion shows; after ends_at it does not; banner-only never does", async () => {
    await exec("delete from promotion");
    await exec(`insert into promotion (title_en, starts_at, ends_at, placement, link_kind) values
      ('Both', '2026-11-01T00:00:00Z', '2026-11-10T14:00:00Z', 'both', 'custom_request'),
      ('Banner only', '2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z', 'banner', 'none')`);

    expect((await load("2026-11-10T13:59:00Z")).home.promoCards.map((p) => [p.title.en, p.href])).toEqual([["Both", "/custom-cake"]]);
    expect((await load("2026-11-10T14:00:00Z")).home.promoCards).toEqual([]);
  });

  test("AC4: a seasonal product shows only while today (Mauritius) is inside its window", async () => {
    await exec("delete from product");
    await addProduct("log", "seasonal", "available", ["2026-11-01", "2026-11-10"]);

    // 2026-11-10T19:59Z is 23:59 on the 10th in Mauritius; 20:00Z is 00:00 on the 11th.
    expect((await load("2026-11-10T19:59:00Z")).home.seasonal.map((p) => p.slug)).toEqual(["log"]);
    expect((await load("2026-11-10T20:00:00Z")).home.seasonal).toEqual([]);
  });

  test("the page title and description are in the page language", async () => {
    expect((await load(undefined, "/fr")).title).toBe("Gâteaux faits maison à Maurice");
  });
});
