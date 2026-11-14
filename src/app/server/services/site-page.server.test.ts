// E-13 S-245 AC3-AC7: the public page read (per-field English fallback, text as stored, one
// query cached like Settings, typed failure, photos in order with locale alt, published
// columns only) and the gallery photo read used by S-250.
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { Database } from "~/server/db.server";
import { clearSitePageCache, getGalleryPhotos, getSitePage } from "./site-page.server";

let database: TestDatabase;
const db = () => database.db as unknown as Database;
const SUPABASE = "https://storage.test";
const ADMIN = "00000000-0000-4000-8000-0000000000aa";

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

afterAll(async () => {
  await database.close();
});

afterEach(async () => {
  clearSitePageCache();
  vi.useRealTimers();
  await database.client.exec("delete from site_page_photo; delete from gallery_photo;");
});

const setContent = (key: string, content: unknown) => database.client.query("update site_page set content = $2, is_placeholder = false where key = $1", [key, JSON.stringify(content)]);

const addPhoto = (key: string, slot: number, path: string, altEn: string, altFr: string | null, role = "page") =>
  database.client.query("insert into site_page_photo (page_key, role, storage_path, width, height, alt_en, alt_fr, sort_order) values ($1, $2, $3, 1200, 900, $4, $5, $6)", [key, role, path, altEn, altFr, slot]);

const pagePath = (key: string, n: number) => `site/pages/${key}/${ADMIN}/00000000-0000-4000-8000-0000000000bb/00000000-0000-4000-8000-00000000000${n}.webp`;

describe("AC3: French falls back to English per field", () => {
  test("a blank French body shows the English body; a French intro stays French", async () => {
    await setContent("our_story", { intro: { en: "Hello", fr: "Bonjour" }, body: { en: "We bake.", fr: "  " } });

    const read = await getSitePage(db(), "our_story", "fr", SUPABASE);

    expect(read).toMatchObject({ ok: true, page: { text: { intro: "Bonjour", body: "We bake." } } });
  });

  test("a field with no text is left out (no empty block); fields of other pages are ignored", async () => {
    await setContent("gallery", { intro: { en: "" }, body: { en: "not a gallery field" } });

    const read = await getSitePage(db(), "gallery", "en", SUPABASE);

    expect(read.ok && read.page.text).toEqual({});
  });
});

describe("AC4: text is returned exactly as stored (escaped later by PlainText)", () => {
  test("HTML in the text is not stripped or interpreted here", async () => {
    await setContent("our_story", { intro: { en: "<script>alert(1)</script>\n\n<b>Hi</b>" } });

    const read = await getSitePage(db(), "our_story", "en", SUPABASE);

    expect(read.ok && read.page.text.intro).toBe("<script>alert(1)</script>\n\n<b>Hi</b>");
  });
});

describe("AC5: cached like Settings; failures are typed", () => {
  test("a second read within 60 s makes no query; after 60 s or a save in this isolate it reads again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-12T08:00:00Z"));
    await setContent("workshops", { intro: { en: "First" } });
    expect((await getSitePage(db(), "workshops", "en", SUPABASE)).ok).toBe(true);

    await setContent("workshops", { intro: { en: "Second" } });
    const cached = await getSitePage(db(), "workshops", "en", SUPABASE);
    vi.setSystemTime(new Date("2026-11-12T08:01:01Z"));
    const fresh = await getSitePage(db(), "workshops", "en", SUPABASE);

    expect(cached.ok && cached.page.text.intro).toBe("First");
    expect(fresh.ok && fresh.page.text.intro).toBe("Second");
    await setContent("workshops", { intro: { en: "Third" } });
    clearSitePageCache();
    const afterSave = await getSitePage(db(), "workshops", "en", SUPABASE);
    expect(afterSave.ok && afterSave.page.text.intro).toBe("Third");
  });

  test("text and photos come from one query", async () => {
    const select = vi.spyOn(db(), "select");

    await getSitePage(db(), "custom_order", "en", SUPABASE);

    expect(select).toHaveBeenCalledTimes(1);
    select.mockRestore();
  });

  test("a database failure is PAGE_UNAVAILABLE, not a thrown error", async () => {
    const broken = { select: () => ({ from: () => ({ leftJoin: () => ({ where: () => ({ orderBy: () => Promise.reject(new Error("connection lost")) }) }) }) }) } as unknown as Database;
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const read = await getSitePage(broken, "contact", "en", SUPABASE);

    expect(read).toEqual({ ok: false, code: "PAGE_UNAVAILABLE" });
    log.mockRestore();
  });
});

describe("AC6: photos in order, public URL, size, locale alt with English fallback", () => {
  test("photos are sorted by slot; French alt falls back to English", async () => {
    await addPhoto("workshops", 1, pagePath("workshops", 2), "Second", null);
    await addPhoto("workshops", 0, pagePath("workshops", 1), "First", "Premier");

    const read = await getSitePage(db(), "workshops", "fr", SUPABASE);

    expect(read.ok && read.page.photos).toEqual([
      { url: `${SUPABASE}/storage/v1/object/public/public-images/${pagePath("workshops", 1)}`, width: 1200, height: 900, alt: "Premier" },
      { url: `${SUPABASE}/storage/v1/object/public/public-images/${pagePath("workshops", 2)}`, width: 1200, height: 900, alt: "Second" },
    ]);
  });

  test("a row whose path is not a photo of this page is skipped, not shown broken", async () => {
    await addPhoto("our_story", 0, pagePath("custom_order", 1), "Wrong page", null);
    await addPhoto("our_story", 1, pagePath("our_story", 2), "Right", null);

    const read = await getSitePage(db(), "our_story", "en", SUPABASE);

    expect(read.ok && read.page.photos.map((p) => p.alt)).toEqual(["Right"]);
  });
});

describe("AC7: published columns only", () => {
  test("the page carries no updated_by, version or edit time", async () => {
    await database.client.query("update site_page set updated_at = now() where key = 'contact'");

    const read = await getSitePage(db(), "contact", "en", SUPABASE);

    expect(read.ok && Object.keys(read.page).sort()).toEqual(["isPlaceholder", "key", "photos", "text"]);
  });
});

describe("S-250: gallery photos", () => {
  test("in the admin's order, alt from the caption (locale), else the occasion, else a neutral name", async () => {
    await database.client.query(
      `insert into gallery_photo (storage_path, width, height, caption_en, caption_fr, occasion, sort_order) values
       ('gallery/b.webp', 800, 800, 'Wedding cake', 'Gâteau de mariage', 'wedding', 1),
       ('gallery/a.webp', 800, 600, null, null, 'birthday', 0),
       ('gallery/c.webp', 600, 800, null, null, null, 2)`,
    );

    const read = await getGalleryPhotos(db(), "fr", SUPABASE, "Un gâteau");

    expect(read.ok && read.photos.map((p) => [p.alt, p.caption])).toEqual([
      ["birthday", null],
      ["Gâteau de mariage", "Gâteau de mariage"],
      ["Un gâteau", null],
    ]);
  });
});
