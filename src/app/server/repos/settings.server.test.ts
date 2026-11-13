import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { getCheckoutSettings, getFooterContacts, getSiteSettings, siteSettingsCache } from "./settings.server";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
  siteSettingsCache.clear();
}, 60_000);

afterEach(async () => {
  siteSettingsCache.clear();
  await database.close();
});

describe("getFooterContacts (S-007, S-061 footer from Settings)", () => {
  test("returns the seeded values, with empty ones as null", async () => {
    expect(await getFooterContacts(database.db)).toEqual({
      whatsapp: null,
      phone: null,
      email: null,
      pickupAddress: "Beau Bassin",
      instagramUrl: null,
      mapUrl: null,
    });
  });

  test("treats blank values as missing so the footer omits them", async () => {
    await database.client.query(
      `update settings set contact_whatsapp = '+230 5000 0000', contact_phone = '  ', contact_email = 'hello@example.com', instagram_url = ' '`,
    );

    expect(await getFooterContacts(database.db)).toEqual({
      whatsapp: "+230 5000 0000",
      phone: null,
      email: "hello@example.com",
      pickupAddress: "Beau Bassin",
      instagramUrl: null,
      mapUrl: null,
    });
  });

  test("S-061 AC1, AC6: Instagram and map links only when http or https", async () => {
    await database.client.query(`update settings set instagram_url = 'https://instagram.com/apb', pickup_map_url = 'javascript:alert(1)'`);
    expect(await getFooterContacts(database.db)).toMatchObject({ instagramUrl: "https://instagram.com/apb", mapUrl: null });

    await database.client.query(`update settings set instagram_url = 'data:text/html,x', pickup_map_url = 'https://maps.example/beau-bassin'`);
    expect(await getFooterContacts(database.db)).toMatchObject({ instagramUrl: null, mapUrl: "https://maps.example/beau-bassin" });
  });
});

describe("getSiteSettings (cached for display)", () => {
  test("footer and checkout values from one query, then from the isolate cache", async () => {
    const query = vi.spyOn(database.client, "query");

    const first = await getSiteSettings(database.db);
    const second = await getSiteSettings(database.db);

    expect(query).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(first.footer).toEqual(await getFooterContacts(database.db));
    expect(first.checkout).toEqual(await getCheckoutSettings(database.db));
    expect(first.noticeDays).toBe(3); // S-252 AC5: the Settings default, shown on Custom order
  });

  test("S-063: the home tagline, hero photo and featured products; a blank tagline is none", async () => {
    await database.client.query(
      `update settings set hero = '{"tagline":{"en":"Baked with love","fr":"Fait avec amour"},"imagePath":"site/hero.webp"}'::jsonb,
         featured_product_ids = '{11111111-1111-4111-8111-111111111111}'`,
    );
    expect((await getSiteSettings(database.db)).home).toEqual({
      tagline: { en: "Baked with love", fr: "Fait avec amour" },
      heroImagePath: "site/hero.webp",
      heroImageVariants: [],
      featuredProductIds: ["11111111-1111-4111-8111-111111111111"],
    });

    siteSettingsCache.clear();
    await database.client.query(`update settings set hero = '{"tagline":{"en":"  "},"imagePath":null}'::jsonb`);
    expect((await getSiteSettings(database.db)).home).toMatchObject({ tagline: null, heroImagePath: null });
  });

  test("S-083: the public date rules come in the same query, blocks as ranges without the private reason", async () => {
    siteSettingsCache.clear();
    await database.client.query("insert into blocked_date (starts_on, ends_on, reason) values ('2026-12-24', '2026-12-26', 'Family wedding'), ('2026-11-20', '2026-11-20', null)");
    const query = vi.spyOn(database.client, "query");

    const { availability } = await getSiteSettings(database.db);

    expect(query).toHaveBeenCalledTimes(1);
    expect(availability).toEqual({
      defaultNoticeDays: 3,
      closedWeekdays: [7],
      blocked: [
        { startsOn: "2026-11-20", endsOn: "2026-11-20" },
        { startsOn: "2026-12-24", endsOn: "2026-12-26" },
      ],
    });
    expect(JSON.stringify(availability)).not.toContain("Family wedding");
    siteSettingsCache.clear();
  });
});
