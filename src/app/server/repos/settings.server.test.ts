import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { getCheckoutSettings, getFooterContacts, getSiteSettings, siteSettingsCache } from "./settings.server";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

describe("getFooterContacts (S-007 footer from Settings)", () => {
  test("returns the seeded values, with empty ones as null", async () => {
    expect(await getFooterContacts(database.db)).toEqual({
      whatsapp: null,
      phone: null,
      email: null,
      pickupAddress: "Beau Bassin",
    });
  });

  test("treats blank values as missing so the footer omits them", async () => {
    await database.client.query(
      `update settings set contact_whatsapp = '+230 5000 0000', contact_phone = '  ', contact_email = 'hello@example.com'`,
    );

    expect(await getFooterContacts(database.db)).toEqual({
      whatsapp: "+230 5000 0000",
      phone: null,
      email: "hello@example.com",
      pickupAddress: "Beau Bassin",
    });
  });
});

describe("getSiteSettings (cached for display)", () => {
  test("footer and checkout values from one query, then from the isolate cache", async () => {
    siteSettingsCache.clear();
    const query = vi.spyOn(database.client, "query");

    const first = await getSiteSettings(database.db);
    const second = await getSiteSettings(database.db);

    expect(query).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(first.footer).toEqual(await getFooterContacts(database.db));
    expect(first.checkout).toEqual(await getCheckoutSettings(database.db));
    expect(first.noticeDays).toBe(3); // S-252 AC5: the Settings default, shown on Custom order
    siteSettingsCache.clear();
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
