// `admin/product` save (S-046 basics, S-047 photos, S-048 option groups).
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { parseProductForm } from "~/server/contracts/admin";
import type { StorageGateway, StoredObject, UploadGateway } from "~/server/storage.server";
import { signedInAdmin } from "~/server/testing/admin-session";
import { findAdminProduct } from "~/server/repos/admin-menu.server";
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

// ---------------------------------------------------------------------------
// S-047 photos on save: the posted list replaces the stored one after the upload checks.

const SESSION = "5f0c3a52-7b1e-4c3d-9a8b-0c1d2e3f4a5b";
const WEBP_HEAD = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);
const JPEG_HEAD = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);
const PDF_HEAD = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0, 0, 0, 0, 0, 0, 0, 0]);

/** Storage double: objects by path; `removed` records removals after commit. */
function fakeStorage() {
  const objects = new Map<string, StoredObject>();
  const removed: string[][] = [];
  const uploads: UploadGateway = {
    signUpload: async (_bucket, path) => ({ path, signedUrl: `https://storage.test/upload/${path}?token=t`, token: "t" }),
    inspect: async (_bucket, path) => objects.get(path) ?? null,
  };
  const storage: StorageGateway = { remove: async (_bucket, paths) => void removed.push([...paths]) };
  return { objects, removed, uploads, storage };
}

let files: ReturnType<typeof fakeStorage>;
beforeEach(() => {
  files = fakeStorage();
});

/** A path issued to `admin` in this test's editor session, with a stored WebP of `size` bytes. */
function uploaded(size = 200_000, head = WEBP_HEAD, contentType = "image/webp", admin = adminId) {
  const path = `products/${admin}/${SESSION}/${randomUUID()}.webp`;
  files.objects.set(path, { size, contentType, head });
  return path;
}

const photo = (path: string, width = 1600, height = 1200) => ({ path, width, height });

async function saveWithPhotos(fields: Record<string, string>, photos: { path: string; width: number; height: number }[], session = SESSION) {
  const data = form({ ...fields, photos: JSON.stringify(photos), uploadSessionId: session });
  const parsed = parseProductForm(data);
  if (!parsed.ok) return { ok: false as const, code: "VALIDATION_FAILED" as const, fields: parsed.problems };
  return saveProduct(database.db, parsed.input, { adminId, now, uploads: files.uploads, storage: files.storage });
}

const storedPaths = async (id: string) =>
  (await database.client.query<{ storage_path: string; sort_order: number }>("select storage_path, sort_order from product_photo where product_id = $1 order by sort_order", [id])).rows.map((r) => r.storage_path);

describe("photos (S-047)", () => {
  test("a new product saves its uploaded photos in order and can be available at once", async () => {
    const [a, b] = [uploaded(), uploaded()];

    const result = (await saveWithPhotos({ ...BASE, status: "available" }, [photo(a!), photo(b!, 1200, 1600)])) as { ok: true; id: string };

    expect(result.ok).toBe(true);
    expect(await storedPaths(result.id)).toEqual([a, b]);
    const rows = await database.client.query("select width, height from product_photo where product_id = $1 order by sort_order", [result.id]);
    expect(rows.rows).toEqual([{ width: 1600, height: 1200 }, { width: 1200, height: 1600 }]);
  });

  test("AC3: an object over 1 MB is UPLOAD_REJECTED and the product keeps its previous photos", async () => {
    const created = (await saveWithPhotos(BASE, [photo(uploaded())])) as { id: string };
    const before = await storedPaths(created.id);

    const result = await saveWithPhotos({ ...BASE, id: created.id }, [photo(before[0]!), photo(uploaded(1_048_577))]);

    expect(result).toEqual({ ok: false, code: "UPLOAD_REJECTED", fields: { photos: "rejected" } });
    expect(await storedPaths(created.id)).toEqual(before);
  });

  test.each([
    ["a declared type outside JPEG, PNG and WebP", () => uploaded(1000, WEBP_HEAD, "image/gif")],
    ["bytes that are not the declared type (a PDF called WebP)", () => uploaded(1000, PDF_HEAD, "image/webp")],
    ["a JPEG declared as WebP", () => uploaded(1000, JPEG_HEAD, "image/webp")],
    ["an empty object", () => uploaded(0)],
    ["a path issued to another admin", () => uploaded(1000, WEBP_HEAD, "image/webp", "0b3c1f6e-2d4a-4b8c-9e0f-1a2b3c4d5e6f")],
    ["a path outside the products prefix", () => `gallery/${randomUUID()}.webp`],
    ["a path climbing out of the prefix", () => `products/${adminId}/${SESSION}/../../other/x.webp`],
    ["a path that was issued but never uploaded", () => `products/${adminId}/${SESSION}/${randomUUID()}.webp`],
  ])("AC3: %s is UPLOAD_REJECTED and nothing is saved", async (_label, make) => {
    const result = await saveWithPhotos(BASE, [photo(make())]);

    expect(result).toMatchObject({ ok: false, code: "UPLOAD_REJECTED" });
    expect((await database.client.query("select count(*)::int as n from product")).rows[0]).toEqual({ n: 0 });
  });

  test("AC3: a path from another editor session is refused", async () => {
    const path = uploaded();

    expect(await saveWithPhotos(BASE, [photo(path)], "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d")).toMatchObject({ code: "UPLOAD_REJECTED" });
  });

  test("AC3: another product's photo cannot be linked (deleting one would break the other)", async () => {
    const path = uploaded();
    await saveWithPhotos(BASE, [photo(path)]);

    expect(await saveWithPhotos({ ...BASE, "name.en": "Copy cat" }, [photo(path)])).toMatchObject({ code: "UPLOAD_REJECTED" });
  });

  test("AC4: a sixth photo forced through save is UPLOAD_REJECTED", async () => {
    const six = Array.from({ length: 6 }, () => photo(uploaded()));

    expect(await saveWithPhotos(BASE, six)).toEqual({ ok: false, code: "UPLOAD_REJECTED", fields: { photos: "rejected" } });
  });

  test("AC4: five photos are fine", async () => {
    const five = Array.from({ length: 5 }, () => photo(uploaded()));

    expect(await saveWithPhotos(BASE, five)).toMatchObject({ ok: true });
  });

  test("AC5: the posted order is saved (first = card image); removing one renumbers the rest and removes its file", async () => {
    const [a, b, c] = [uploaded(), uploaded(), uploaded()];
    const created = (await saveWithPhotos(BASE, [photo(a!), photo(b!), photo(c!)])) as { id: string };

    await saveWithPhotos({ ...BASE, id: created.id }, [photo(c!), photo(a!)]);

    const rows = await database.client.query("select storage_path, sort_order from product_photo where product_id = $1 order by sort_order", [created.id]);
    expect(rows.rows).toEqual([
      { storage_path: c, sort_order: 0 },
      { storage_path: a, sort_order: 1 },
    ]);
    expect(files.removed).toEqual([[b]]);
  });

  test("a kept photo keeps its stored size whatever is posted", async () => {
    const a = uploaded();
    const created = (await saveWithPhotos(BASE, [photo(a, 1600, 900)])) as { id: string };

    await saveWithPhotos({ ...BASE, id: created.id }, [photo(a, 1, 1)]);

    expect((await database.client.query("select width, height from product_photo where product_id = $1", [created.id])).rows).toEqual([{ width: 1600, height: 900 }]);
  });

  test("a removed file Storage cannot delete is queued for the hourly purge; the save still succeeds", async () => {
    const [a, b] = [uploaded(), uploaded()];
    const created = (await saveWithPhotos(BASE, [photo(a!), photo(b!)])) as { id: string };
    files.storage.remove = async () => Promise.reject(new Error("storage remove answered 503"));

    expect(await saveWithPhotos({ ...BASE, id: created.id }, [photo(a!)])).toMatchObject({ ok: true });
    expect((await database.client.query("select path from storage_purge")).rows).toEqual([{ path: b }]);
  });

  test("bundled sample images are never sent to Storage for removal", async () => {
    const id = await insertProduct(database.db, { slug: "sample-cake" });

    await saveWithPhotos({ ...BASE, id }, [photo(uploaded())]);

    expect(files.removed).toEqual([]);
  });

  test("AC7: no photo left refuses available with 'Add a photo first'; hidden is allowed", async () => {
    const created = (await saveWithPhotos(BASE, [photo(uploaded())])) as { id: string };

    expect(await saveWithPhotos({ ...BASE, id: created.id, status: "available" }, [])).toEqual({ ok: false, code: "VALIDATION_FAILED", fields: { status: "photo" } });
    expect(await saveWithPhotos({ ...BASE, id: created.id, status: "sold_out" }, [])).toMatchObject({ fields: { status: "photo" } });
    expect(await saveWithPhotos({ ...BASE, id: created.id, status: "hidden" }, [])).toMatchObject({ ok: true });
    expect(await storedPaths(created.id)).toEqual([]);
  });

  test("a malformed photo list is VALIDATION_FAILED on photos", async () => {
    const data = form({ ...BASE, photos: "[{" });
    expect(parseProductForm(data)).toEqual({ ok: false, problems: { photos: "invalid" } });
  });
});

// ---------------------------------------------------------------------------
// S-048 option groups: posted as one JSON field; the list replaces the stored groups.

type PostedChoice = { id?: string; name: { en: string; fr?: string }; priceDeltaRs: number | string };
type PostedGroup = { id?: string; name: { en: string; fr?: string }; kind: string; required: boolean; textMaxLength?: number | string | null; quantityMin?: number | string | null; quantityMax?: number | string | null; choices: PostedChoice[] };

const choice = (en: string, priceDeltaRs: number | string = 0, fr?: string): PostedChoice => ({ name: { en, ...(fr ? { fr } : {}) }, priceDeltaRs });
const SIZE: PostedGroup = {
  name: { en: "Size", fr: "Taille" },
  kind: "single",
  required: true,
  choices: [choice("6 inch (5-10 people)", 0, "6 pouces (5-10 personnes)"), choice("7 inch (10-15 people)", 300), choice("8 inch (15-20 people)", 600)],
};

async function saveWithOptions(fields: Record<string, string>, groups: unknown) {
  return save({ ...fields, optionGroups: JSON.stringify(groups) });
}

async function storedOptions(id: string) {
  const product = await findAdminProduct(database.db, id, "https://storage.test");
  return product!.optionGroups;
}

describe("option groups (S-048)", () => {
  test("AC2, AC3: a cake card per flavour with a required Size group: names, kinds and per-size price changes are stored", async () => {
    const message: PostedGroup = { name: { en: "Message on the cake" }, kind: "text", required: false, textMaxLength: 25, choices: [] };

    const result = (await saveWithOptions(BASE, [SIZE, message])) as { ok: true; id: string };

    expect(result.ok).toBe(true);
    const groups = await storedOptions(result.id);
    expect(groups).toMatchObject([
      { name: { en: "Size", fr: "Taille" }, kind: "single", required: true, textMaxLength: null, choices: [{ name: { en: "6 inch (5-10 people)", fr: "6 pouces (5-10 personnes)" }, priceDeltaRs: 0 }, { priceDeltaRs: 300 }, { priceDeltaRs: 600 }] },
      { name: { en: "Message on the cake", fr: null }, kind: "text", required: false, textMaxLength: 25, choices: [] },
    ]);
  });

  test("AC2: quantity groups keep min and max; text max blank means the Settings default (null)", async () => {
    const box: PostedGroup = { name: { en: "Cookies in the box" }, kind: "quantity", required: true, quantityMin: "6", quantityMax: "12", choices: [choice("Chocolate chip"), choice("Double chocolate", 20)] };
    const note: PostedGroup = { name: { en: "Note" }, kind: "text", required: false, textMaxLength: "", choices: [] };

    const result = (await saveWithOptions(BASE, [box, note])) as { id: string };

    expect(await storedOptions(result.id)).toMatchObject([{ kind: "quantity", quantityMin: 6, quantityMax: 12 }, { kind: "text", textMaxLength: null }]);
  });

  test.each([
    ["a text max over 200", { name: { en: "Message" }, kind: "text", required: false, textMaxLength: 201, choices: [] }, "optionGroups.0.textMaxLength"],
    ["a quantity min above max", { name: { en: "Box" }, kind: "quantity", required: false, quantityMin: 7, quantityMax: 6, choices: [choice("A")] }, "optionGroups.0.quantity"],
    ["only one quantity limit", { name: { en: "Box" }, kind: "quantity", required: false, quantityMin: 2, quantityMax: "", choices: [choice("A")] }, "optionGroups.0.quantity"],
    ["an empty English group name", { name: { en: " " }, kind: "single", required: false, choices: [choice("A")] }, "optionGroups.0.name.en"],
    ["an unknown kind", { name: { en: "Odd" }, kind: "slider", required: false, choices: [choice("A")] }, "optionGroups.0.kind"],
    ["a price change over 100,000", { name: { en: "Size" }, kind: "single", required: false, choices: [choice("Huge", 100_001)] }, "optionGroups.0.choices.0.priceDeltaRs"],
    ["a price change with paise", { name: { en: "Size" }, kind: "single", required: false, choices: [choice("Odd", "10.5")] }, "optionGroups.0.choices.0.priceDeltaRs"],
    ["a choice without an English name", { name: { en: "Size" }, kind: "single", required: false, choices: [choice("")] }, "optionGroups.0.choices.0.name.en"],
  ])("AC2, AC3: %s is VALIDATION_FAILED on that field and nothing is saved", async (_label, group, field) => {
    const result = await saveWithOptions(BASE, [group]);

    expect(result).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    expect(Object.keys((result as { fields: object }).fields)).toEqual([field]);
    expect((await database.client.query("select count(*)::int as n from product")).rows[0]).toEqual({ n: 0 });
  });

  test("AC3: Rs 0, negative and plus or minus 100,000 price changes are allowed", async () => {
    const group: PostedGroup = { name: { en: "Size" }, kind: "single", required: true, choices: [choice("Same", 0), choice("Smaller", -100), choice("Far", 100_000), choice("Gift", -100_000)] };

    const result = (await saveWithOptions(BASE, [group])) as { id: string };

    expect((await storedOptions(result.id))[0]!.choices.map((c) => c.priceDeltaRs)).toEqual([0, -100, 100_000, -100_000]);
  });

  test.each([
    ["a required pick-one group with no choices", { name: { en: "Size" }, kind: "single", required: true, choices: [] }],
    ["an optional pick-one group with no choices", { name: { en: "Flavour" }, kind: "single", required: false, choices: [] }],
    ["a pick-several group with no choices", { name: { en: "Add-ons" }, kind: "multiple", required: false, choices: [] }],
  ])("AC4: %s is VALIDATION_FAILED on that group's choices and nothing is saved", async (_label, group) => {
    const result = await saveWithOptions(BASE, [SIZE, group]);

    expect(result).toEqual({ ok: false, code: "VALIDATION_FAILED", fields: { "optionGroups.1.choices": "none" } });
    expect((await database.client.query("select count(*)::int as n from option_group")).rows[0]).toEqual({ n: 0 });
  });

  test("AC4: a required text group needs no choices (a required message)", async () => {
    expect(await saveWithOptions(BASE, [{ name: { en: "Message" }, kind: "text", required: true, choices: [choice("ignored")] }])).toMatchObject({ ok: true });
  });

  test("AC5: 10 groups and 30 choices save; 11 groups or 31 choices are refused", async () => {
    const thirty = { ...SIZE, choices: Array.from({ length: 30 }, (_, i) => choice(`Choice ${i + 1}`, i)) };
    const ten = Array.from({ length: 10 }, (_, i) => ({ ...SIZE, name: { en: `Group ${i + 1}` } }));

    expect(await saveWithOptions(BASE, [thirty])).toMatchObject({ ok: true });
    expect(await saveWithOptions({ ...BASE, "name.en": "Ten groups" }, ten)).toMatchObject({ ok: true });
    expect(await saveWithOptions({ ...BASE, "name.en": "Eleven" }, [...ten, SIZE])).toEqual({ ok: false, code: "VALIDATION_FAILED", fields: { optionGroups: "too_many" } });
    const tooMany = { ...SIZE, choices: [...thirty.choices, choice("One more")] };
    expect(await saveWithOptions({ ...BASE, "name.en": "Thirty-one" }, [tooMany])).toMatchObject({ ok: false, fields: { "optionGroups.0.choices": "too_many" } });
  });

  test("AC6: groups and choices come back in the posted order; reordering keeps their ids", async () => {
    const flavour: PostedGroup = { name: { en: "Flavour" }, kind: "single", required: false, choices: [choice("Chocolate"), choice("Vanilla"), choice("Pistachio", 50)] };
    const created = (await saveWithOptions(BASE, [SIZE, flavour])) as { id: string };
    const [size, flav] = await storedOptions(created.id);

    const reordered = [
      { ...flavour, id: flav!.id, choices: [flav!.choices[2], flav!.choices[0], flav!.choices[1]].map((c) => ({ id: c!.id, name: { en: c!.name.en }, priceDeltaRs: c!.priceDeltaRs })) },
      { ...SIZE, id: size!.id, choices: size!.choices.map((c) => ({ id: c.id, name: { en: c.name.en }, priceDeltaRs: c.priceDeltaRs })) },
    ];
    await saveWithOptions({ ...BASE, id: created.id }, reordered);

    const after = await storedOptions(created.id);
    expect(after.map((g) => g.id)).toEqual([flav!.id, size!.id]);
    expect(after[0]!.choices.map((c) => c.name.en)).toEqual(["Pistachio", "Chocolate", "Vanilla"]);
    expect(after[0]!.choices.map((c) => c.id)).toEqual([flav!.choices[2]!.id, flav!.choices[0]!.id, flav!.choices[1]!.id]);
  });

  test("removing groups and choices deletes them; ids of another product are never reused", async () => {
    const other = (await saveWithOptions({ ...BASE, "name.en": "Other cake" }, [SIZE])) as { id: string };
    const [otherSize] = await storedOptions(other.id);
    const created = (await saveWithOptions(BASE, [SIZE])) as { id: string };
    const [size] = await storedOptions(created.id);

    await saveWithOptions({ ...BASE, id: created.id }, [{ ...SIZE, id: size!.id, choices: [{ id: otherSize!.choices[0]!.id, name: { en: "Stolen" }, priceDeltaRs: 0 }] }]);

    const [after] = await storedOptions(created.id);
    expect(after!.choices).toHaveLength(1);
    expect(after!.choices[0]!.id).not.toBe(otherSize!.choices[0]!.id);
    expect((await storedOptions(other.id))[0]!.choices.map((c) => c.name.en)).toEqual(SIZE.choices.map((c) => c.name.en));
    await saveWithOptions({ ...BASE, id: created.id }, []);
    expect(await storedOptions(created.id)).toEqual([]);
  });

  test("a form without optionGroups keeps the stored groups", async () => {
    const created = (await saveWithOptions(BASE, [SIZE])) as { id: string };

    await save({ ...BASE, id: created.id, basePriceRs: "900" });

    expect(await storedOptions(created.id)).toHaveLength(1);
  });

  test("minimum quantity: blank is none, 1 to 50 is stored, anything else is refused", async () => {
    const none = (await save(BASE)) as { id: string };
    expect((await row(none.id)).min_quantity).toBeNull();
    const six = (await save({ ...BASE, "name.en": "Dessert cups", minQuantity: "6" })) as { id: string };
    expect((await row(six.id)).min_quantity).toBe(6);
    expect(await save({ ...BASE, "name.en": "Too many", minQuantity: "51" })).toMatchObject({ fields: { minQuantity: "invalid" } });
  });
});
