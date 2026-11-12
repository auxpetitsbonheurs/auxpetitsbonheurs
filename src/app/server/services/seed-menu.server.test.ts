// S-241: the Owner's real menu on staging (insert-only by slug; Storage in memory).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { SAMPLE_PRODUCT } from "~/db/sample-data";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { listMenuProducts } from "~/server/repos/catalogue.server";
import { MemoryStorage } from "~/server/testing/memory-storage";
import type { PreparedPhoto } from "./menu-photos.server";
import { SeedMenuRefused, seedMenu } from "./seed-menu.server";

let database: TestDatabase;
let storage: MemoryStorage;
const now = new Date("2026-11-12T08:00:00Z");
/** The smallest WebP header the upload check accepts (the real resize is tested in menu-photos). */
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20, 1, 2, 3]);
const prepared: PreparedPhoto = { bytes: WEBP, width: 943, height: 1142, contentType: "image/webp" };

beforeEach(async () => {
  database = await createTestDatabase();
  storage = new MemoryStorage();
}, 60_000);

afterEach(async () => {
  await database.close();
});

let runs = 0;
const seed = (appEnv: string | undefined = "staging") => seedAs(appEnv);
const seedAs = (appEnv: string | undefined) =>
  seedMenu(database.db, {
    appEnv,
    now,
    runId: `5f0c3a52-7b1e-4c3d-9a8b-0c1d2e3f4a${String(runs++).padStart(2, "0")}`,
    uploads: storage.gateway,
    storage: storage.gateway,
    photo: async () => prepared,
  });

type Row = Record<string, unknown>;
const products = async () => (await database.client.query<Row>("select * from product order by type, sort_order")).rows;
const bySlug = async (slug: string) => (await database.client.query<Row>("select * from product where slug = $1", [slug])).rows[0]!;
const groupsOf = async (id: unknown) =>
  (
    await database.client.query<Row>(
      `select g.name_en as group_en, g.name_fr as group_fr, g.kind, g.required, c.name_en, c.name_fr, c.price_delta_rs
       from option_group g join option_choice c on c.group_id = g.id where g.product_id = $1 order by g.sort_order, c.sort_order`,
      [id],
    )
  ).rows;
const photosOf = async (id: unknown) => (await database.client.query<Row>("select storage_path, width, height, sort_order from product_photo where product_id = $1", [id])).rows;

const CAKES = ["Signature Red Velvet Cake", "Black Forest Cake", "Génoise aux pêches", "Chocolate Cake", "Vanilla Cake", "Pistachio Cake"];

describe("AC1: the 7 products from the menu source", () => {
  test("exist with English names and descriptions, no emoji, French empty", async () => {
    await seed();

    const rows = await products();
    expect(rows.map((r) => r.name_en).sort()).toEqual(["Chocolate chip cookies", ...CAKES].sort());
    expect(rows.every((r) => r.name_fr === null && r.description_fr === null)).toBe(true);
    expect(rows.every((r) => !/\p{Extended_Pictographic}/u.test(String(r.name_en)))).toBe(true);
    expect((await bySlug("black-forest-cake")).description_en).toBe("Soft chocolate génoise with cherries and cream");
    expect((await bySlug("vanilla-cake")).description_en).toBeNull();
  });
});

describe("AC2: cookies", () => {
  test("dessert at Rs 420, available, one required Box group: 6 / 12 / 18 at +0 / +360 / +660", async () => {
    await seed();

    const cookies = await bySlug("chocolate-chip-cookies");
    expect(cookies).toMatchObject({ type: "dessert", base_price_rs: 420, status: "available" });
    expect(await groupsOf(cookies.id)).toEqual([
      { group_en: "Box", group_fr: "Boîte", kind: "single", required: true, name_en: "Box of 6", name_fr: "Boîte de 6", price_delta_rs: 0 },
      { group_en: "Box", group_fr: "Boîte", kind: "single", required: true, name_en: "Box of 12", name_fr: "Boîte de 12", price_delta_rs: 360 },
      { group_en: "Box", group_fr: "Boîte", kind: "single", required: true, name_en: "Box of 18", name_fr: "Boîte de 18", price_delta_rs: 660 },
    ]);
    const menu = await listMenuProducts(database.db);
    const listed = menu.find((p) => p.slug === "chocolate-chip-cookies")!;
    expect(listed.optionGroups[0]!.choices.map((c) => listed.basePriceRs + c.priceDeltaRs)).toEqual([420, 780, 1080]);
  });
});

describe("AC3: each cake has its own card with a required Size group", () => {
  test.each(CAKES)("%s: type cake, sizes 6 / 7 / 8 inch in order, in both languages", async (name) => {
    await seed();

    const cake = (await products()).find((r) => r.name_en === name)!;
    expect(cake.type).toBe("cake");
    expect((await groupsOf(cake.id)).map((g) => [g.group_en, g.group_fr, g.kind, g.required, g.name_en, g.name_fr])).toEqual([
      ["Size", "Taille", "single", true, "6 inch (5–10 people)", "6 pouces (5 à 10 personnes)"],
      ["Size", "Taille", "single", true, "7 inch (10–15 people)", "7 pouces (10 à 15 personnes)"],
      ["Size", "Taille", "single", true, "8 inch (15–20 people)", "8 pouces (15 à 20 personnes)"],
    ]);
  });
});

describe("AC4: placeholder prices", () => {
  test("cakes are Rs 0 with Rs 0 sizes and hidden, and the run lists them under Prices to enter", async () => {
    const report = await seed();

    for (const name of CAKES) {
      const cake = (await products()).find((r) => r.name_en === name)!;
      expect(cake).toMatchObject({ base_price_rs: 0, status: "hidden" });
      expect((await groupsOf(cake.id)).every((g) => g.price_delta_rs === 0)).toBe(true);
    }
    expect(report.pricesToEnter).toEqual(CAKES);
    expect((await listMenuProducts(database.db)).map((p) => p.slug)).toEqual(["chocolate-chip-cookies"]);
  });

  test("a price the Owner typed drops off the list on the next run", async () => {
    await seed();
    await database.client.query("update product set base_price_rs = 1200 where slug = 'black-forest-cake'");

    expect((await seed()).pricesToEnter).not.toContain("Black Forest Cake");
  });
});

describe("AC5: photos", () => {
  test("the 5 photos are uploaded and linked first (slot 0) with their size; Vanilla and Pistachio have none and stay hidden", async () => {
    const report = await seed();

    for (const slug of ["chocolate-chip-cookies", "signature-red-velvet-cake", "black-forest-cake", "genoise-aux-peches", "chocolate-cake"]) {
      const photos = await photosOf((await bySlug(slug)).id);
      expect(photos).toEqual([{ storage_path: expect.stringMatching(/^products\/00000000-0000-4000-8000-000000000241\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/), width: 943, height: 1142, sort_order: 0 }]);
    }
    expect(storage.objects.size).toBe(5);
    for (const slug of ["vanilla-cake", "pistachio-cake"]) {
      expect(await photosOf((await bySlug(slug)).id)).toEqual([]);
      expect((await bySlug(slug)).status).toBe("hidden");
    }
    expect(report.missing).toEqual(["Vanilla Cake: description", "Vanilla Cake: photo", "Pistachio Cake: description", "Pistachio Cake: photo"]);
  });

  test("a photo that fails the upload check stops the run before its product is written", async () => {
    const bad = seedMenu(database.db, {
      appEnv: "staging",
      now,
      runId: "5f0c3a52-7b1e-4c3d-9a8b-0c1d2e3f4a99",
      uploads: storage.gateway,
      storage: storage.gateway,
      photo: async () => ({ ...prepared, bytes: new TextEncoder().encode("not an image at all") }),
    });

    await expect(bad).rejects.toThrow();
    expect(await products()).toEqual([]);
  });
});

describe("AC6: order and slugs", () => {
  test("cakes follow the menu-source order; slugs come from the English name", async () => {
    await seed();

    const cakes = (await products()).filter((r) => r.type === "cake");
    expect(cakes.map((r) => r.name_en)).toEqual(CAKES);
    expect(cakes.map((r) => r.slug)).toEqual(["signature-red-velvet-cake", "black-forest-cake", "genoise-aux-peches", "chocolate-cake", "vanilla-cake", "pistachio-cake"]);
  });
});

describe("AC7: re-runs", () => {
  test("nothing is duplicated, nothing re-uploaded, edits are kept; each product reports created or already present", async () => {
    const first = await seed();
    await database.client.query("update product set name_en = 'Red velvet (Owner)', base_price_rs = 1500 where slug = 'signature-red-velvet-cake'");

    const second = await seed();

    expect(first.lines.map((l) => l.outcome)).toEqual(Array(7).fill("created"));
    expect(second.lines.map((l) => l.outcome)).toEqual(Array(7).fill("already present"));
    expect(await products()).toHaveLength(7);
    expect(storage.signed).toBe(5);
    expect(await bySlug("signature-red-velvet-cake")).toMatchObject({ name_en: "Red velvet (Owner)", base_price_rs: 1500 });
  });

  test("a product the Owner renamed (its old slug in history) is not created again", async () => {
    await seed();
    const cookies = await bySlug("chocolate-chip-cookies");
    await database.client.query("update product set slug = 'cookies' where id = $1", [cookies.id]);
    await database.client.query("insert into product_slug_history (slug, product_id) values ('chocolate-chip-cookies', $1)", [cookies.id]);

    const again = await seed();

    expect(again.lines[0]).toMatchObject({ slug: "chocolate-chip-cookies", outcome: "already present" });
    expect(await products()).toHaveLength(7);
  });
});

describe("AC8: the S-011 sample cake", () => {
  test("still unedited, it becomes the real Chocolate Cake with the same id", async () => {
    const id = await insertProduct(database.db);

    const report = await seed();

    expect(report.lines.find((l) => l.slug === "chocolate-cake")?.outcome).toBe("sample replaced");
    const cake = await bySlug("chocolate-cake");
    expect(cake).toMatchObject({ id, name_en: "Chocolate Cake", name_fr: null, base_price_rs: 0, status: "hidden", description_fr: null });
    expect((await photosOf(id)).map((p) => p.storage_path)).toEqual([expect.stringMatching(/\.webp$/)]);
    expect(await groupsOf(id)).toHaveLength(3);
    expect((await products()).filter((r) => r.type === "cake").map((r) => r.name_en)).toEqual(CAKES);
  });

  test("edited by the Owner, it is left alone and reported", async () => {
    const id = await insertProduct(database.db, { basePriceRs: 950 });

    const report = await seed();

    expect(report.lines.find((l) => l.slug === "chocolate-cake")?.outcome).toBe("sample edited, left alone");
    expect(await bySlug("chocolate-cake")).toMatchObject({ id, name_en: SAMPLE_PRODUCT.nameEn, base_price_rs: 950 });
  });
});

describe("AC9: only staging", () => {
  test.each(["production", "development", undefined])("APP_ENV=%s is refused with a typed error and nothing is written", async (appEnv) => {
    await expect(seedAs(appEnv)).rejects.toBeInstanceOf(SeedMenuRefused);
    expect(await products()).toEqual([]);
    expect(storage.signed).toBe(0);
  });
});
