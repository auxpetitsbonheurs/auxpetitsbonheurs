// `admin/product` save (S-046): create and edit a product's basic details.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { parseProductForm } from "~/server/contracts/admin";
import { signedInAdmin } from "~/server/testing/admin-session";
import { saveProduct } from "./save-product.server";

let database: TestDatabase;
let adminId: string;
const now = new Date("2026-11-10T10:05:00Z"); // 14:05 in Mauritius

beforeEach(async () => {
  database = await createTestDatabase();
  adminId = (await signedInAdmin(database, { name: "Sarah" })).admin.id;
}, 60_000);

afterEach(async () => {
  await database.close();
});

const BASE = {
  "name.en": "Pistachio cake",
  "name.fr": "Gâteau pistache",
  "description.en": "Pistachio sponge.",
  "description.fr": "",
  basePriceRs: "850",
  noticeDays: "",
  type: "cake",
  category: "Birthday",
  status: "hidden",
};

function form(fields: Record<string, string>, allergens: string[] = []) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  for (const tag of allergens) data.append("allergens", tag);
  return data;
}

async function save(fields: Record<string, string>, allergens: string[] = [], by = adminId) {
  const parsed = parseProductForm(form(fields, allergens));
  if (!parsed.ok) return { ok: false as const, code: "VALIDATION_FAILED" as const, fields: parsed.problems };
  return saveProduct(database.db, parsed.input, { adminId: by, now });
}

const row = async (id: string) =>
  (await database.client.query<Record<string, unknown>>("select * from product where id = $1", [id])).rows[0]!;

describe("create (S-046 AC1)", () => {
  test("stores names, descriptions, price, type, category, allergens and status", async () => {
    const result = await save(BASE, ["eggless", "nut_free"]);

    expect(result).toMatchObject({ ok: true });
    const saved = await row((result as { id: string }).id);
    expect(saved).toMatchObject({
      name_en: "Pistachio cake",
      name_fr: "Gâteau pistache",
      description_en: "Pistachio sponge.",
      description_fr: null,
      base_price_rs: 850,
      type: "cake",
      category: "Birthday",
      allergens: ["eggless", "nut_free"],
      status: "hidden",
      slug: "pistachio-cake",
    });
  });

  test("a new product goes to the end of its type", async () => {
    await insertProduct(database.db, { slug: "a", sortOrder: 4 });

    const result = await save(BASE);

    expect((await row((result as { id: string }).id)).sort_order).toBe(5);
  });
});

describe("validation (S-046 AC3)", () => {
  test.each([
    ["an empty English name", { "name.en": "  " }, "name.en", "missing"],
    ["a name over 120 characters", { "name.en": "a".repeat(121) }, "name.en", "invalid"],
    ["a French name over 120 characters", { "name.fr": "a".repeat(121) }, "name.fr", "invalid"],
    ["a description over 2000 characters", { "description.en": "a".repeat(2001) }, "description.en", "invalid"],
    ["a negative price", { basePriceRs: "-1" }, "basePriceRs", "invalid"],
    ["a non-integer price", { basePriceRs: "850.5" }, "basePriceRs", "invalid"],
    ["a blank price", { basePriceRs: "" }, "basePriceRs", "invalid"],
    ["notice days over 60", { noticeDays: "61" }, "noticeDays", "invalid"],
    ["negative notice days", { noticeDays: "-1" }, "noticeDays", "invalid"],
    ["an unknown type", { type: "pie" }, "type", "invalid"],
    ["an unknown status", { status: "gone" }, "status", "invalid"],
    ["a slug outside [a-z0-9-]", { slug: "Gâteau!" }, "slug", "invalid"],
  ])("%s marks that field and saves nothing", async (_label, change, field, problem) => {
    const result = await save({ ...BASE, ...change });

    expect(result).toEqual({ ok: false, code: "VALIDATION_FAILED", fields: { [field]: problem } });
    expect((await database.client.query("select count(*)::int as n from product")).rows[0]).toEqual({ n: 0 });
  });

  test("every bad field is marked at once", async () => {
    const result = await save({ ...BASE, "name.en": "", basePriceRs: "abc", noticeDays: "99" });

    expect(result).toMatchObject({ ok: false, fields: { "name.en": "missing", basePriceRs: "invalid", noticeDays: "invalid" } });
  });

  test("an unknown allergen tag is refused", async () => {
    expect(await save(BASE, ["peanut_butter"])).toMatchObject({ ok: false, fields: { allergens: "invalid" } });
  });

  test("a status that offers the product needs a photo (none yet on a new product)", async () => {
    expect(await save({ ...BASE, status: "available" })).toEqual({ ok: false, code: "VALIDATION_FAILED", fields: { status: "photo" } });
  });
});

describe("notice days (S-046 AC4)", () => {
  test("blank stores no notice (the Settings default applies)", async () => {
    const result = await save(BASE);

    expect((await row((result as { id: string }).id)).notice_days).toBeNull();
  });

  test.each(["0", "60", "5"])("a value (%s) is stored", async (days) => {
    const result = await save({ ...BASE, noticeDays: days });

    expect((await row((result as { id: string }).id)).notice_days).toBe(Number(days));
  });
});

describe("slug (S-046 AC5)", () => {
  test("is generated from the English name with [a-z0-9-] only", async () => {
    const result = await save({ ...BASE, "name.en": "Crème brûlée & co" });

    expect((await row((result as { id: string }).id)).slug).toBe("creme-brulee-co");
  });

  test("a slug used by another product is SLUG_TAKEN on fields.slug and nothing is saved", async () => {
    await insertProduct(database.db, { slug: "pistachio-cake" });

    expect(await save(BASE)).toEqual({ ok: false, code: "SLUG_TAKEN", fields: { slug: "taken" } });
    expect((await database.client.query("select count(*)::int as n from product")).rows[0]).toEqual({ n: 1 });
  });

  test("a slug in another product's history is refused the same way", async () => {
    const other = await insertProduct(database.db, { slug: "new-name" });
    await database.client.query("insert into product_slug_history (slug, product_id) values ('pistachio-cake', $1)", [other]);

    expect(await save(BASE)).toMatchObject({ ok: false, code: "SLUG_TAKEN", fields: { slug: "taken" } });
  });

  test("editing keeps the slug unless one is posted; a changed slug keeps the old one in history", async () => {
    const created = (await save(BASE)) as { id: string };
    await save({ ...BASE, id: created.id, "name.en": "Pistachio delight" });
    expect((await row(created.id)).slug).toBe("pistachio-cake");

    await save({ ...BASE, id: created.id, slug: "pistachio-delight" });

    expect((await row(created.id)).slug).toBe("pistachio-delight");
    const history = await database.client.query("select slug, product_id from product_slug_history");
    expect(history.rows).toEqual([{ slug: "pistachio-cake", product_id: created.id }]);
  });

  test("an unknown id is NOT_FOUND", async () => {
    expect(await save({ ...BASE, id: "7d1f0c9e-1111-4222-8333-944455566677" })).toEqual({ ok: false, code: "NOT_FOUND" });
  });
});

describe("two admins (S-046 AC7)", () => {
  test("the last write wins and records who saved and when", async () => {
    const created = (await save(BASE)) as { id: string };
    const other = (await signedInAdmin(database, { name: "Priya" })).admin.id;

    await save({ ...BASE, id: created.id, basePriceRs: "900" }, [], adminId);
    await save({ ...BASE, id: created.id, basePriceRs: "950" }, [], other);

    const saved = await row(created.id);
    expect(saved.base_price_rs).toBe(950);
    expect(saved.updated_by).toBe(other);
    expect((saved.updated_at as Date).toISOString()).toBe(now.toISOString());
  });
});

describe("editing an existing product with a photo", () => {
  test("can set it available; photos are left untouched", async () => {
    const id = await insertProduct(database.db, { slug: "choc", status: "hidden" });

    expect(await save({ ...BASE, id, status: "available" })).toMatchObject({ ok: true, id });
    expect((await database.client.query("select count(*)::int as n from product_photo where product_id = $1", [id])).rows[0]).toEqual({ n: 1 });
  });
});
