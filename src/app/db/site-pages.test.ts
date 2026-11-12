// E-13 S-245 AC1, AC2, AC7: the brand page tables, their placeholder seed, the per-page photo
// limits held by the database, and row-level security (anonymous reads and writes refused).
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { sitePage, sitePagePhoto } from "./schema";
import { type TestDatabase, createTestDatabase, migrationsFolder } from "./testing/pglite";

let database: TestDatabase;
const query = <T>(text: string, params: unknown[] = []) => database.client.query<T>(text, params).then((r) => r.rows);

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

afterAll(async () => {
  await database.close();
});

const photo = (key: string, slot: number, role = "page") =>
  query("insert into site_page_photo (page_key, role, storage_path, width, height, alt_en, sort_order) values ($1, $2, $3, 800, 600, 'A cake', $4)", [key, role, `site/pages/${key}/${role}-${slot}-${Math.random()}.webp`, slot]);

describe("S-245 AC1: one row per page, typed fields and flags", () => {
  test("the schema has RLS on both tables and no public write path", () => {
    expect(getTableConfig(sitePage).enableRLS).toBe(true);
    expect(getTableConfig(sitePagePhoto).enableRLS).toBe(true);
  });

  test("exactly the five page keys exist; another key is refused", async () => {
    const rows = await query<{ key: string }>("select key from site_page order by key");

    expect(rows.map((r) => r.key)).toEqual(["contact", "custom_order", "gallery", "our_story", "workshops"]);
    await expect(query("insert into site_page (key) values ('home')")).rejects.toThrow(/site_page_key_ck/);
  });

  test("each page holds its own EN/FR text fields, placeholder flag, version and edit stamp", async () => {
    const rows = await query<{ key: string; fields: string[]; is_placeholder: boolean; version: number; updated_by: string | null }>(
      "select key, array(select jsonb_object_keys(content) order by 1) as fields, is_placeholder, version, updated_by from site_page order by key",
    );

    expect(Object.fromEntries(rows.map((r) => [r.key, r.fields]))).toEqual({
      contact: ["hours", "intro", "pickup_note"],
      custom_order: ["body", "intro"],
      gallery: ["intro"],
      our_story: ["body", "intro"],
      workshops: ["body", "intro"],
    });
    expect(rows.every((r) => r.is_placeholder && r.version === 1 && r.updated_by === null)).toBe(true);
  });

  test("photo limits are enforced by the database: our_story 4, custom_order 3, workshops 6 + 1 event photo, none elsewhere", async () => {
    for (let slot = 0; slot < 4; slot += 1) await photo("our_story", slot);
    await expect(photo("our_story", 4)).rejects.toThrow(/site_page_photo_slot_ck/);
    await expect(photo("our_story", 3)).rejects.toThrow(/site_page_photo_slot_key/);
    await expect(photo("custom_order", 3)).rejects.toThrow(/site_page_photo_slot_ck/);
    await expect(photo("workshops", 6)).rejects.toThrow(/site_page_photo_slot_ck/);
    await photo("workshops", 0, "event");
    await expect(photo("our_story", 0, "event")).rejects.toThrow(/site_page_photo_slot_ck/);
    await expect(photo("gallery", 0)).rejects.toThrow(/site_page_photo_slot_ck/);
    await expect(photo("contact", 0)).rejects.toThrow(/site_page_photo_slot_ck/);
    await query("delete from site_page_photo");
  });
});

describe("S-245 AC2: neutral placeholder seed", () => {
  test("every field has English and French sample text with no prices or dates", async () => {
    const rows = await query<{ key: string; content: Record<string, { en: string; fr?: string }> }>("select key, content from site_page");

    for (const row of rows) {
      for (const [field, text] of Object.entries(row.content)) {
        expect(text.en, `${row.key}.${field}`).toMatch(/^Sample text/);
        expect(text.fr, `${row.key}.${field}`).toMatch(/^Texte d'exemple/);
        expect(`${text.en} ${text.fr}`).not.toMatch(/Rs\s?\d|\d{1,2}[/:]\d{2}|20\d\d/);
      }
    }
  });

  test("re-running the seed creates no duplicate and changes nothing", async () => {
    const migration = readFileSync(`${migrationsFolder}/0008_site_pages.sql`, "utf8");
    const seed = migration.slice(migration.indexOf('INSERT INTO "site_page"'));
    await query("update site_page set content = '{\"intro\":{\"en\":\"Edited\"}}', is_placeholder = false where key = 'gallery'");

    await database.client.exec(seed);

    expect(await query("select key from site_page")).toHaveLength(5);
    expect(await query("select content, is_placeholder from site_page where key = 'gallery'")).toEqual([{ content: { intro: { en: "Edited" } }, is_placeholder: false }]);
  });
});

describe("S-245 AC7: only the server writes (RLS on, no policies)", () => {
  test.each(["site_page", "site_page_photo"])("the anon role reads no rows from %s", async (table) => {
    const rows = await database.client.transaction(async (tx) => {
      await tx.exec("set local role anon");
      return (await tx.query(`select * from ${table}`)).rows;
    });

    expect(rows).toEqual([]);
  });

  test.each(["anon", "authenticated"])("the %s role cannot change page text", async (role) => {
    await expect(
      database.client.transaction(async (tx) => {
        await tx.exec(`set local role ${role}`);
        await tx.query("insert into site_page_photo (page_key, storage_path, width, height, alt_en, sort_order) values ('our_story', 'x.webp', 1, 1, 'x', 0)");
      }),
    ).rejects.toThrow(/row-level security/);
    const updated = await database.client.transaction(async (tx) => {
      await tx.exec(`set local role ${role}`);
      return (await tx.query("update site_page set is_placeholder = false where key = 'our_story' returning key")).rows;
    });
    expect(updated).toEqual([]);
  });
});
