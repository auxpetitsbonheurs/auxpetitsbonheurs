// E-13 S-246 AC3-AC5, AC7 and S-247 AC2, AC3, AC6, AC9: the admin Pages save through the
// route action (parse, guard, versioned write, photo checks like S-047, purge of removed files).
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { action } from "~/routes/admin/page-editor";
import type { Database } from "~/server/db.server";
import { signedInAdmin } from "~/server/testing/admin-session";
import { MemoryStorage } from "~/server/testing/memory-storage";
import { routeArgs } from "~/server/testing/route-context";
import { getSitePage } from "./site-page.server";

let database: TestDatabase;
let editor: Awaited<ReturnType<typeof signedInAdmin>>;
const SESSION = "5f0c3a52-7b1e-4c3d-9a8b-0c1d2e3f4a5b";
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0, 1, 2, 3]);
const db = () => database.db as unknown as Database;

beforeAll(async () => {
  database = await createTestDatabase();
  // An Admin, not an Owner: Pages is open to both (S-246 AC6).
  editor = await signedInAdmin(database, { role: "admin", name: "Sarah" });
}, 60_000);

afterAll(async () => {
  await database.close();
});

beforeEach(async () => {
  await database.client.exec("delete from site_page_photo; delete from storage_purge; update site_page set version = 1, is_placeholder = true, event = null;");
});

type Answer = { ok: true; version: number } | { data: { ok: false; error: { code: string; message: string; fields?: Record<string, string> } }; init: { status: number } };

async function save(key: string, form: Record<string, string | string[]>, storage?: MemoryStorage) {
  const args = routeArgs(database, { path: `/admin/pages/${key}`, params: { key }, auth: editor.auth, cookie: editor.cookie, form: { intent: "save", version: "1", ...form }, uploads: storage?.gateway ?? null, storage: storage?.gateway });
  const answer = (await action(args as never)) as unknown as Answer;
  await args.afterResponse.settled();
  return answer;
}

const refusal = (answer: Answer) => ("data" in answer ? answer : null);
const row = async (key: string) =>
  (await database.client.query<{ version: number; is_placeholder: boolean; content: Record<string, { en: string; fr?: string }>; updated_by: string }>("select version, is_placeholder, content, updated_by from site_page where key = $1", [key])).rows[0]!;

function issued(storage: MemoryStorage, key: string, n: number): string {
  const path = `site/pages/${key}/${editor.admin.id}/${SESSION}/00000000-0000-4000-8000-00000000000${n}.webp`;
  storage.objects.set(`public-images/${path}`, { bytes: WEBP, contentType: "image/webp" });
  return path;
}

const photoFields = (n: number, path: string, alt = "A chocolate cake") => ({ [`photos.${n}.path`]: path, [`photos.${n}.width`]: "1200", [`photos.${n}.height`]: "900", [`photos.${n}.alt.en`]: alt });

describe("S-246 AC3: Save stores the text, clears the sample flag and shows at once", () => {
  test("stored with version + 1, editor and time; placeholder off; the public read shows it in this isolate", async () => {
    await getSitePage(db(), "our_story", "en", "https://storage.test"); // warm the cache with the sample text

    const answer = await save("our_story", { "intro.en": "We bake in Beau Bassin.", "intro.fr": "", "body.en": "Line one\n\nLine two", "body.fr": "Ligne un" });

    expect(answer).toEqual({ ok: true, intent: "save", version: 2 });
    expect(await row("our_story")).toMatchObject({ version: 2, is_placeholder: false, updated_by: editor.admin.id, content: { intro: { en: "We bake in Beau Bassin." }, body: { en: "Line one\n\nLine two", fr: "Ligne un" } } });
    const read = await getSitePage(db(), "our_story", "en", "https://storage.test");
    expect(read.ok && read.page).toMatchObject({ isPlaceholder: false, text: { intro: "We bake in Beau Bassin." } });
  });
});

describe("S-246 AC4: limits and HTML", () => {
  test("an intro over 300 or a body over 10,000 is VALIDATION_FAILED per field and nothing is saved", async () => {
    const answer = refusal(await save("workshops", { "intro.en": "x".repeat(301), "body.en": "ok", "body.fr": "y".repeat(10_001) }));

    expect(answer?.init.status).toBe(400);
    expect(answer?.data.error.code).toBe("VALIDATION_FAILED");
    expect(answer?.data.error.fields).toEqual({
      "intro.en": "Introduction (English): too long. Shorten it to 300 characters or fewer.",
      "body.fr": "Main text (French): too long. Shorten it to 10000 characters or fewer.",
    });
    expect((await row("workshops")).version).toBe(1);
  });

  test("French without English is refused for that field", async () => {
    const answer = refusal(await save("gallery", { "intro.en": "", "intro.fr": "Bonjour" }));

    expect(answer?.data.error.fields).toEqual({ "intro.en": "Introduction: write the English text first. French alone is not saved." });
  });

  test("HTML is stored as text, unchanged", async () => {
    await save("contact", { "intro.en": "<script>alert(1)</script>", "hours.en": "<b>Mon</b> 9-5", "pickup_note.en": "x" });

    expect((await row("contact")).content).toMatchObject({ intro: { en: "<script>alert(1)</script>" }, hours: { en: "<b>Mon</b> 9-5" } });
  });
});

describe("S-246 AC5: a stale version is PAGE_CHANGED and nothing is saved", () => {
  test("two editors: the second Save with the old version is refused with 409", async () => {
    await save("custom_order", { "intro.en": "First" });

    const answer = refusal(await save("custom_order", { "intro.en": "Second" }));

    expect(answer?.init.status).toBe(409);
    expect(answer?.data.error).toMatchObject({ code: "PAGE_CHANGED", message: "Someone changed this page. Reload." });
    expect((await row("custom_order")).content).toEqual({ intro: { en: "First" } });
  });
});

describe("S-246 AC6: unknown page", () => {
  test("a key that is not a page is NOT_FOUND", async () => {
    const answer = refusal(await save("home", { "intro.en": "x" }));

    expect(answer?.init.status).toBe(404);
  });
});

describe("S-247: photos", () => {
  test("AC1, AC4, AC6: issued, stored WebP photos are saved in the posted order with their alt texts", async () => {
    const storage = new MemoryStorage();
    const first = issued(storage, "our_story", 1);
    const second = issued(storage, "our_story", 2);

    const answer = await save("our_story", { "intro.en": "Hi", ...photoFields(0, second, "Second"), ...photoFields(1, first, "First"), "photos.1.alt.fr": "Premier", uploadSessionId: SESSION }, storage);

    expect(answer).toMatchObject({ ok: true });
    const photos = await database.client.query("select storage_path, alt_en, alt_fr, sort_order from site_page_photo order by sort_order");
    expect(photos.rows).toEqual([
      { storage_path: second, alt_en: "Second", alt_fr: null, sort_order: 0 },
      { storage_path: first, alt_en: "First", alt_fr: "Premier", sort_order: 1 },
    ]);
  });

  test("AC2: more photos than the page allows is refused (custom order: 3)", async () => {
    const storage = new MemoryStorage();
    const form = Object.assign({ "intro.en": "Hi", uploadSessionId: SESSION }, ...[1, 2, 3, 4].map((n) => photoFields(n - 1, issued(storage, "custom_order", n))));

    const answer = refusal(await save("custom_order", form, storage));

    expect(answer?.data.error.fields).toEqual({ photos: "Too many photos: this page can have 3. Remove one." });
    expect((await database.client.query("select 1 from site_page_photo")).rows).toEqual([]);
  });

  test("AC2: a page without photos (gallery) refuses any photo", async () => {
    const storage = new MemoryStorage();

    const answer = refusal(await save("gallery", { "intro.en": "Hi", ...photoFields(0, issued(storage, "gallery", 1)), uploadSessionId: SESSION }, storage));

    expect(answer?.data.error.code).toBe("VALIDATION_FAILED");
  });

  test("AC3: a photo without an English description is refused inline; French is optional", async () => {
    const storage = new MemoryStorage();

    const answer = refusal(await save("our_story", { "intro.en": "Hi", ...photoFields(0, issued(storage, "our_story", 1), ""), uploadSessionId: SESSION }, storage));

    expect(answer?.data.error.fields).toEqual({ "photos.0.alt.en": "Photo 1: describe what the photo shows (English)." });
  });

  test("AC6: a forged path, another page's path, another session or a non-image is UPLOAD_REJECTED", async () => {
    const storage = new MemoryStorage();
    const otherPage = issued(storage, "workshops", 1);
    const otherSession = `site/pages/our_story/${editor.admin.id}/6f0c3a52-7b1e-4c3d-9a8b-0c1d2e3f4a5b/00000000-0000-4000-8000-000000000002.webp`;
    storage.objects.set(`public-images/${otherSession}`, { bytes: WEBP, contentType: "image/webp" });
    const notImage = issued(storage, "our_story", 3);
    storage.objects.set(`public-images/${notImage}`, { bytes: new TextEncoder().encode("<html>"), contentType: "image/webp" });

    for (const path of ["products/x/y/z.webp", otherPage, otherSession, notImage]) {
      const answer = refusal(await save("our_story", { "intro.en": "Hi", ...photoFields(0, path), uploadSessionId: SESSION }, storage));
      expect(answer?.init.status, path).toBe(422);
      expect(answer?.data.error.code, path).toBe("UPLOAD_REJECTED");
    }
    expect((await database.client.query("select 1 from site_page_photo")).rows).toEqual([]);
  });

  test("AC4, AC9: a removed photo leaves the page and its file is removed from Storage after the save", async () => {
    const storage = new MemoryStorage();
    const keep = issued(storage, "our_story", 1);
    const drop = issued(storage, "our_story", 2);
    await save("our_story", { "intro.en": "Hi", ...photoFields(0, keep), ...photoFields(1, drop), uploadSessionId: SESSION }, storage);

    const answer = await save("our_story", { version: "2", "intro.en": "Hi", ...photoFields(0, keep) }, storage);

    expect(answer).toMatchObject({ ok: true, version: 3 });
    expect((await database.client.query("select storage_path from site_page_photo")).rows).toEqual([{ storage_path: keep }]);
    expect(storage.removed).toEqual([drop]);
  });

  test("AC9: when Storage refuses the removal, the file is queued in storage_purge", async () => {
    const storage = new MemoryStorage();
    const drop = issued(storage, "our_story", 1);
    await save("our_story", { "intro.en": "Hi", ...photoFields(0, drop), uploadSessionId: SESSION }, storage);
    const failing = { ...storage.gateway, remove: vi.fn(async () => Promise.reject(new Error("storage down"))) };
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const args = routeArgs(database, { path: "/admin/pages/our_story", params: { key: "our_story" }, auth: editor.auth, cookie: editor.cookie, form: { intent: "save", version: "2", "intro.en": "Hi" }, uploads: failing, storage: failing });
    await action(args as never);
    await args.afterResponse.settled();

    expect((await database.client.query("select path from storage_purge")).rows).toEqual([{ path: drop }]);
    log.mockRestore();
  });
});

describe("S-249: the next workshop", () => {
  test("title, date, seats and text are stored; all blank clears it", async () => {
    await save("workshops", { "intro.en": "Hi", "event.title.en": "Valentine's cake workshop", "event.title.fr": "Atelier Saint-Valentin", "event.date": "2027-02-14", "event.seats": "10", "event.text.en": "Decorate a cake together." });

    expect((await database.client.query("select event from site_page where key = 'workshops'")).rows[0]).toEqual({
      event: { title: { en: "Valentine's cake workshop", fr: "Atelier Saint-Valentin" }, date: "2027-02-14", seats: 10, text: { en: "Decorate a cake together." } },
    });

    await save("workshops", { version: "2", "intro.en": "Hi", "event.title.en": "", "event.date": "", "event.seats": "" });
    expect((await database.client.query("select event from site_page where key = 'workshops'")).rows[0]).toEqual({ event: null });
  });

  test("a title without a date, a bad date or seats out of range are named problems", async () => {
    const answer = refusal(await save("workshops", { "intro.en": "Hi", "event.title.en": "Workshop", "event.date": "2027-02-30", "event.seats": "0" }));

    expect(answer?.data.error.fields).toEqual({ "event.date": "Next workshop: choose a real date.", "event.seats": "Next workshop: seats must be a whole number from 1 to 500." });
  });

  test("a date without a title asks for the title", async () => {
    const answer = refusal(await save("workshops", { "intro.en": "Hi", "event.date": "2027-02-14" }));

    expect(answer?.data.error.fields).toEqual({ "event.title.en": "Next workshop: add a title, or clear the next workshop." });
  });

  test("the event block is ignored on other pages", async () => {
    await save("our_story", { "intro.en": "Hi", "event.title.en": "Nope", "event.date": "2027-02-14" });

    expect((await database.client.query("select event from site_page where key = 'our_story'")).rows[0]).toEqual({ event: null });
  });
});
