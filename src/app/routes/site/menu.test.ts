// S-244 AC1, AC4, AC5: the `site/menu` loader (PGlite, fixed clock) and the cached client load.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { collectionSections } from "~/domain/collection";
import { menuStore } from "~/lib/menu-cache";
import { siteSettingsCache } from "~/server/repos/settings.server";
import { routeArgs } from "~/server/testing/route-context";
import { loader as apiMenu } from "../hooks/menu";
import { clientLoader, loader } from "./menu";

let database: TestDatabase;

beforeEach(async () => {
  siteSettingsCache.clear();
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  vi.restoreAllMocks();
  await database.close();
});

/** The clock is 2026-11-10 08:00 UTC = 12:00 in Mauritius. */
const load = (path = "/menu") => loader(routeArgs(database, { path }) as never);

describe("site/menu loader (S-244)", () => {
  test("AC1: localised title and the public menu, types in order, products in sort order", async () => {
    await insertProduct(database.db, { slug: "box", nameEn: "Cupcake box", type: "cupcake_box", sortOrder: 0 });
    await insertProduct(database.db, { slug: "b-cake", nameEn: "Second cake", sortOrder: 2 });
    await insertProduct(database.db, { slug: "a-cake", nameEn: "First cake", sortOrder: 1 });

    const data = await load("/fr/menu");

    expect(data.title).toBe("Notre collection");
    expect(data.description).toMatch(/Beau Bassin/);
    const sections = collectionSections(data.menu.data, data.menu.data.today);
    expect(sections.map((s) => [s.type, s.products.map((p) => p.slug)])).toEqual([
      ["cake", ["a-cake", "b-cake"]],
      ["cupcake_box", ["box"]],
    ]);
  });

  test("AC4: hidden products and seasonal products outside their window (Mauritius date) are absent", async () => {
    await insertProduct(database.db, { slug: "shown", nameEn: "Shown cake" });
    await insertProduct(database.db, { slug: "secret", nameEn: "Secret cake", status: "hidden" });
    await insertProduct(database.db, { slug: "xmas", nameEn: "Christmas log", type: "seasonal", seasonalStartsOn: "2026-12-01", seasonalEndsOn: "2026-12-24" });
    await insertProduct(database.db, { slug: "diwali", nameEn: "Diwali box", type: "seasonal", seasonalStartsOn: "2026-11-01", seasonalEndsOn: "2026-11-10" });

    const data = await load();
    const slugs = collectionSections(data.menu.data, data.menu.data.today).flatMap((s) => s.products.map((p) => p.slug));

    expect(data.menu.data.today).toBe("2026-11-10");
    expect(slugs).toEqual(["shown", "diwali"]);
    expect(JSON.stringify(data)).not.toContain("Secret cake");
  });

  test("AC5: the page reads the same menu as GET /api/menu (same version)", async () => {
    await insertProduct(database.db);

    const page = await load();
    const api = (await (await apiMenu(routeArgs(database, { path: "/api/menu" }) as never)).json()) as { v: string };

    expect(page.menu.v).toBe(api.v);
    expect(page.menu.data.products[0]?.season).toBeNull();
  });
});

describe("site/menu clientLoader (S-244 AC5)", () => {
  test("renders from the cached menu at once and revalidates it in the background", async () => {
    const entry = { v: "m-1", data: { products: [], checkout: {} as never, today: "2026-11-10", generatedAt: 1 } };
    vi.spyOn(menuStore, "state").mockReturnValue({ entry, notes: new Map(), goneNames: new Map() });
    const revalidate = vi.spyOn(menuStore, "revalidate").mockResolvedValue();
    const serverLoader = vi.fn();

    const data = await clientLoader({ serverLoader } as never);

    expect(data).toMatchObject({ menu: entry });
    expect(serverLoader).not.toHaveBeenCalled();
    expect(revalidate).toHaveBeenCalledOnce();
  });

  test("with no cache yet it asks the server", async () => {
    vi.spyOn(menuStore, "state").mockReturnValue({ entry: null, notes: new Map(), goneNames: new Map() });
    const serverLoader = vi.fn().mockResolvedValue("server");

    expect(await clientLoader({ serverLoader } as never)).toBe("server");
  });
});
