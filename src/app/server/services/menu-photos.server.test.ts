// S-241 AC5: the real source photos are resized and re-encoded, then uploaded and checked
// exactly as an editor save checks them (Storage mocked in memory).
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { MENU_PHOTOS_DIR, MENU_PRODUCTS } from "~/db/menu-data";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { PHOTO_MAX_EDGE, UPLOAD_TARGET_BYTES, isIssuedPhotoPath, sniffImageType } from "~/domain/upload";
import { MemoryStorage } from "~/server/testing/memory-storage";
import { MenuPhotoError, SEED_UPLOADER_ID, prepareMenuPhoto, signedPut, uploadMenuPhoto } from "./menu-photos.server";

const photosDir = fileURLToPath(new URL(`../../../../${MENU_PHOTOS_DIR}/`, import.meta.url));
const sources = readdirSync(photosDir).filter((f) => f.endsWith(".jpg"));
const RUN = "5f0c3a52-7b1e-4c3d-9a8b-0c1d2e3f4a5b";

describe("prepareMenuPhoto (AC5)", () => {
  test("the menu data names exactly the 5 source photos", () => {
    expect(MENU_PRODUCTS.flatMap((p) => (p.photo ? [p.photo] : [])).sort()).toEqual([...sources].sort());
    expect(sources).toHaveLength(5);
  });

  test.each(sources)("%s becomes a WebP within 1600 px and 300 kB, with its real size and no metadata", async (file) => {
    const prepared = await prepareMenuPhoto(readFileSync(`${photosDir}${file}`));

    expect(sniffImageType(prepared.bytes.slice(0, 16))).toBe("image/webp");
    expect(prepared.bytes.length).toBeLessThanOrEqual(UPLOAD_TARGET_BYTES);
    expect(Math.max(prepared.width, prepared.height)).toBeLessThanOrEqual(PHOTO_MAX_EDGE);
    const meta = await sharp(prepared.bytes).metadata();
    expect({ width: meta.width, height: meta.height }).toEqual({ width: prepared.width, height: prepared.height });
    expect(meta.exif).toBeUndefined();
  });

  test("a large photo is shrunk to 1600 px on the long edge", async () => {
    const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#c96" } }).jpeg().toBuffer();

    const prepared = await prepareMenuPhoto(big);

    expect([prepared.width, prepared.height]).toEqual([1600, 1200]);
  });
});

describe("signedPut", () => {
  test("PUTs the bytes with their type; a refusal names the status, never the signed URL", async () => {
    const calls: { url: string; method?: string; type: string | null }[] = [];
    const answer = (status: number) => (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, type: new Headers(init?.headers).get("content-type") });
      return new Response(null, { status });
    }) as typeof fetch;

    await signedPut(answer(200))("https://storage.test/upload?token=secret-token", new Uint8Array([1]), "image/webp");
    expect(calls).toEqual([{ url: "https://storage.test/upload?token=secret-token", method: "PUT", type: "image/webp" }]);

    const refused = signedPut(answer(409))("https://storage.test/upload?token=secret-token", new Uint8Array([1]), "image/webp");
    await expect(refused).rejects.toThrow("storage upload answered 409");
    await expect(refused).rejects.not.toThrow(/secret-token/);
  });
});

describe("uploadMenuPhoto (AC5, same checks as an editor save)", () => {
  let database: TestDatabase;
  beforeEach(async () => {
    database = await createTestDatabase();
  }, 60_000);
  afterEach(async () => {
    await database.close();
  });

  test("uploads to an issued path under the seed's prefix for this run and returns its size", async () => {
    const storage = new MemoryStorage();
    const prepared = await prepareMenuPhoto(readFileSync(`${photosDir}${sources[0]}`));

    const photo = await uploadMenuPhoto(database.db, storage.gateway, RUN, prepared);

    expect(isIssuedPhotoPath(photo.path, SEED_UPLOADER_ID, RUN)).toBe(true);
    expect(photo).toMatchObject({ width: prepared.width, height: prepared.height });
    expect(storage.objects.get(`public-images/${photo.path}`)?.contentType).toBe("image/webp");
  });

  test("a stored object that is not really an image is refused", async () => {
    const storage = new MemoryStorage();
    const fake = { bytes: new TextEncoder().encode("%PDF-1.7 not an image"), width: 10, height: 10, contentType: "image/webp" as const };

    await expect(uploadMenuPhoto(database.db, storage.gateway, RUN, fake)).rejects.toBeInstanceOf(MenuPhotoError);
  });
});
