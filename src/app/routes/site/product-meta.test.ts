// S-224 AC1, AC6 (NFR-010): the product page's own title, description, canonical and share
// preview, in the page language; a product without a usable photo shares the brand image.
import { eq } from "drizzle-orm";
import type { MetaDescriptor } from "react-router";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { productPhoto } from "~/db/schema";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { DESCRIPTION_LENGTH, handlesOwnShareImage } from "~/lib/seo";
import { TEST_SUPABASE_URL, routeArgs } from "~/server/testing/route-context";
import { handle, loader, meta } from "./product";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

const ORIGIN = "https://bakery.example";

async function pageMeta(path: string): Promise<MetaDescriptor[]> {
  const loaderData = await loader(routeArgs(database, { path, params: { slug: "chocolate-cake" } }) as never);
  const matches = [{ id: "root", loaderData: { origin: ORIGIN } }];
  return meta({ loaderData, matches, location: { pathname: path } } as never) as MetaDescriptor[];
}
const content = (tags: MetaDescriptor[], key: string) =>
  (tags.find((t) => (t as Record<string, string>).property === key || (t as Record<string, string>).name === key) as { content?: string } | undefined)?.content;
const canonical = (tags: MetaDescriptor[]) => (tags.find((t) => (t as Record<string, string>).rel === "canonical") as { href?: string } | undefined)?.href;
const title = (tags: MetaDescriptor[]) => (tags.find((t) => "title" in t) as { title?: string } | undefined)?.title;

describe("product page meta (S-224)", () => {
  test("AC1: English page: own title, description, canonical and Open Graph/Twitter tags", async () => {
    await insertProduct(database.db, { descriptionEn: "A rich chocolate sponge layered with dark ganache, baked to order for birthdays and family days." });

    const tags = await pageMeta("/menu/chocolate-cake");

    expect(title(tags)).toBe("Chocolate cake | Aux petits bonheurs");
    expect(content(tags, "description")).toBe("A rich chocolate sponge layered with dark ganache, baked to order for birthdays and family days.");
    expect(canonical(tags)).toBe(`${ORIGIN}/menu/chocolate-cake`);
    expect(content(tags, "og:url")).toBe(`${ORIGIN}/menu/chocolate-cake`);
    expect(content(tags, "og:title")).toBe("Chocolate cake | Aux petits bonheurs");
    expect(content(tags, "og:locale")).toBe("en_MU");
    expect(content(tags, "twitter:card")).toBe("summary_large_image");
    expect(content(tags, "robots")).toBeUndefined();
  });

  test("AC1: French page: French name, description, canonical and locale", async () => {
    await insertProduct(database.db, { descriptionFr: "Une génoise au chocolat garnie de ganache noire, préparée sur commande pour les anniversaires." });

    const tags = await pageMeta("/fr/menu/chocolate-cake");

    expect(title(tags)).toBe("Gâteau au chocolat | Aux petits bonheurs");
    expect(content(tags, "description")).toBe("Une génoise au chocolat garnie de ganache noire, préparée sur commande pour les anniversaires.");
    expect(canonical(tags)).toBe(`${ORIGIN}/fr/menu/chocolate-cake`);
    expect(content(tags, "og:locale")).toBe("fr_MU");
  });

  test("a short or missing description is replaced by a sentence naming the product, within search-engine length", async () => {
    await insertProduct(database.db, { descriptionEn: "Rich.", descriptionFr: null });

    for (const path of ["/menu/chocolate-cake", "/fr/menu/chocolate-cake"]) {
      const description = content(await pageMeta(path), "description")!;
      expect(description).toMatch(path.startsWith("/fr") ? /Gâteau au chocolat/ : /Chocolate cake/);
      expect(description.length).toBeGreaterThanOrEqual(DESCRIPTION_LENGTH.min);
      expect(description.length).toBeLessThanOrEqual(DESCRIPTION_LENGTH.max);
    }
  });

  test("a long description is cut on a word, within 160 characters", async () => {
    await insertProduct(database.db, { descriptionEn: "Layers of moist sponge ".repeat(15) });

    const description = content(await pageMeta("/menu/chocolate-cake"), "description")!;

    expect(description.length).toBeLessThanOrEqual(DESCRIPTION_LENGTH.max);
    expect(description).toMatch(/sponge…$|moist…$|Layers…$|of…$/);
  });

  test("AC1: the share image is the product photo, at most 1200 px wide when smaller copies exist", async () => {
    const id = await insertProduct(database.db);
    await database.db.update(productPhoto).set({ storagePath: "products/p1/a.webp", width: 2000, height: 1500, variantWidths: [480, 960] }).where(eq(productPhoto.productId, id));

    const tags = await pageMeta("/menu/chocolate-cake");

    // The 2000 px original is too big for previews; the 960 px copy is the widest under 1200.
    expect(content(tags, "og:image")).toBe(`${TEST_SUPABASE_URL}/storage/v1/object/public/public-images/products/p1/a-960w.webp`);
    expect(content(tags, "twitter:image")).toBe(content(tags, "og:image"));
    expect(content(tags, "og:image:alt")).toBe("Chocolate cake");
    expect(handlesOwnShareImage(handle)).toBe(true);
  });

  test("AC6: no photo, or a photo previews cannot show (SVG), shares the brand image and no broken tag", async () => {
    await insertProduct(database.db); // the sample photo is a bundled SVG

    const tags = await pageMeta("/menu/chocolate-cake");

    expect(content(tags, "og:image")).toBe(`${ORIGIN}/brand/og-image.png`);
    expect(content(tags, "og:image:width")).toBe("1200");
    expect(tags.filter((t) => (t as Record<string, string>).property === "og:image")).toHaveLength(1);
    expect(tags.every((t) => Object.values(t as Record<string, unknown>).every((v) => v !== "" && v !== undefined && v !== null))).toBe(true);
  });
});
