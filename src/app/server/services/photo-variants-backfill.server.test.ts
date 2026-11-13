// S-276 AC8: the staging backfill makes missing copies of stored photos, idempotently.
// Storage is a memory double; resizing is a double that writes a small file of the right type
// (sharp runs in the real script). PGlite holds the rows.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { Database } from "~/server/db.server";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { variantPath } from "~/domain/upload";
import { MemoryStorage } from "~/server/testing/memory-storage";
import { BackfillRefused, type BackfillIo, backfillPhotoVariants } from "./photo-variants-backfill.server";

const WEBP = (size: number) => new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, ...new Array<number>(size).fill(1)]);
const JPEG = (size: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array<number>(size).fill(1)]);

let database: TestDatabase;
let storage: MemoryStorage;
let resized: { width: number; height: number; type: string }[];
const db = () => database.db as unknown as Database;

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);
afterAll(async () => {
  await database.close();
});
beforeEach(async () => {
  storage = new MemoryStorage();
  resized = [];
  await database.client.exec("delete from product; delete from gallery_photo; delete from site_page_photo; update settings set hero = null, about_image_path = null, hero_image_variants = '{}'");
});

function io(sizes: Record<string, { width: number; height: number }> = {}): BackfillIo {
  return {
    uploads: storage.gateway,
    download: async (path) => storage.objects.get(`public-images/${path}`)?.bytes ?? null,
    measure: async (bytes) => sizes[String(bytes.length)] ?? { width: 1600, height: 1200 },
    resize: async (_bytes, width, height, type) => {
      resized.push({ width, height, type });
      return type === "image/webp" ? WEBP(width / 10) : JPEG(width / 10);
    },
  };
}

const store = (path: string, bytes: Uint8Array, contentType: string) => storage.objects.set(`public-images/${path}`, { bytes, contentType });
const rows = async (sql: string) => (await database.client.query(sql)).rows;

describe("backfillPhotoVariants", () => {
  test("AC8: refuses any environment but staging before reading anything", async () => {
    for (const env of [undefined, "production", "development"]) {
      await expect(backfillPhotoVariants(db(), io(), env)).rejects.toBeInstanceOf(BackfillRefused);
    }
    expect(storage.signed).toBe(0);
  });

  test("makes each missing copy in the original's type and ratio, beside it, and records the widths", async () => {
    const productId = await insertProduct(db());
    const photo = "products/a/s/0b0f5d3e-2a4c-4e8b-9c1d-7e6f5a4b3c2d.jpg";
    store(photo, JPEG(500), "image/jpeg");
    await database.client.query("update product_photo set storage_path = $1, width = 1024, height = 1536 where product_id = $2", [photo, productId]);
    const tile = "site/pages/our_story/a/s/1c9f8d63-7b4a-4b2f-8e3d-6a5c4b3f2e1d.webp";
    store(tile, WEBP(400), "image/webp");
    await database.client.query("insert into site_page_photo (page_key, role, storage_path, width, height, alt_en, sort_order) values ('our_story', 'page', $1, 800, 600, 'Cake', 0)", [tile]);

    const report = await backfillPhotoVariants(db(), io({ "504": { width: 1024, height: 1536 }, "412": { width: 800, height: 600 } }), "staging");

    expect(report).toMatchObject({ made: 2, failed: 0 });
    expect(await rows("select variant_widths from product_photo")).toEqual([{ variant_widths: [480, 960] }]);
    expect(await rows("select variant_widths from site_page_photo")).toEqual([{ variant_widths: [480] }]);
    expect(resized).toEqual([
      { width: 480, height: 720, type: "image/jpeg" },
      { width: 960, height: 1440, type: "image/jpeg" },
      { width: 480, height: 360, type: "image/webp" },
    ]);
    expect(storage.objects.get(`public-images/${variantPath(photo, 960)}`)?.contentType).toBe("image/jpeg");
    expect(report.lines.map((l) => l.file)).toEqual(["0b0f5d3e-2a4c-4e8b-9c1d-7e6f5a4b3c2d.jpg", "1c9f8d63-7b4a-4b2f-8e3d-6a5c4b3f2e1d.webp"]);
  });

  test("idempotent: a second run changes nothing; a copy left by an interrupted run is reused, not uploaded again", async () => {
    const photo = "products/a/s/2d0a9e74-8c5b-4c3a-9f4e-7b6d5c4a3f2e.webp";
    store(photo, WEBP(500), "image/webp");
    store(variantPath(photo, 480), WEBP(48), "image/webp");
    await database.client.query("insert into gallery_photo (storage_path, width, height) values ($1, 1600, 1200)", [photo]);

    const first = await backfillPhotoVariants(db(), io(), "staging");
    const signedAfterFirst = storage.signed;
    const second = await backfillPhotoVariants(db(), io(), "staging");

    expect(resized.map((r) => r.width)).toEqual([960]);
    expect(first).toMatchObject({ made: 1 });
    expect(second).toMatchObject({ made: 0, upToDate: 1 });
    expect(storage.signed).toBe(signedAfterFirst);
    expect(await rows("select variant_widths from gallery_photo")).toEqual([{ variant_widths: [480, 960] }]);
  });

  test("the Settings hero (no stored size) is measured from its bytes", async () => {
    const hero = "site/a/s/3e1b0f85-9d6c-4d4b-8a5f-8c7e6d5b4a3f.webp";
    store(hero, WEBP(300), "image/webp");
    await database.client.query(`update settings set hero = $1::jsonb`, [JSON.stringify({ tagline: { en: "Hi" }, imagePath: hero })]);

    await backfillPhotoVariants(db(), io({ "312": { width: 900, height: 1200 } }), "staging");

    expect(await rows("select hero_image_variants from settings")).toEqual([{ hero_image_variants: [480] }]);
  });

  test("skips what it cannot fix and says why; bundled samples are not Storage objects", async () => {
    const missing = "products/a/s/4f2c1a96-ae7d-4e5c-9b6a-9d8f7e6c5b4a.webp";
    const lying = "products/a/s/5a3d2ba7-bf8e-4f6d-8c7b-ae9a8f7d6c5b.webp";
    store(lying, JPEG(100), "image/webp");
    await database.client.query("insert into gallery_photo (storage_path, width, height) values ($1, 1600, 1200), ($2, 1600, 1200), ('/images/sample/cake.svg', 800, 600)", [missing, lying]);

    const report = await backfillPhotoVariants(db(), io(), "staging");

    expect(report.lines.map((l) => [l.outcome, l.reason])).toEqual([
      ["skipped", "original not found"],
      ["skipped", "original is not the type its name says"],
    ]);
    expect(await rows("select variant_widths from gallery_photo order by storage_path")).toEqual([{ variant_widths: [] }, { variant_widths: [] }, { variant_widths: [] }]);
  });
});
