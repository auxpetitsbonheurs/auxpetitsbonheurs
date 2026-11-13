// S-251 AC1, AC2, AC3, AC4, AC6, AC9: the `site/contact` loader (PGlite) and its head.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { siteSettingsCache } from "~/server/repos/settings.server";
import { routeArgs } from "~/server/testing/route-context";
import { bakeryJsonLd, loader, meta } from "./contact";

let database: TestDatabase;

beforeEach(async () => {
  siteSettingsCache.clear();
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  siteSettingsCache.clear();
  await database.close();
});

const load = (path = "/contact") => loader(routeArgs(database, { path }) as never);
const setSettings = (sql: string) => database.client.query(`update settings set ${sql}`);

describe("site/contact loader (S-251)", () => {
  test("AC1: localised title, description and the page text in the visitor's language", async () => {
    const en = await load();
    siteSettingsCache.clear();
    const fr = await load("/fr/contact");

    expect(en.title).toBe("Contact us");
    expect(fr.title).toBe("Contact");
    expect(en.text.hours).toMatch(/opening hours/i);
    expect(fr.text.hours).toMatch(/horaires/i);
    expect(fr.text.intro).not.toBe(en.text.intro);
  });

  test("AC1, AC2: WhatsApp, phone, exact address and map from Settings", async () => {
    await setSettings(
      `contact_whatsapp = '+230 5000 0000', contact_phone = '+230 400 0000', pickup_address = '12 Royal Road, Beau Bassin', pickup_map_url = 'https://maps.example.test/apb'`,
    );

    const data = await load();

    expect(data).toMatchObject({
      whatsapp: "+230 5000 0000",
      phone: "+230 400 0000",
      address: "12 Royal Road, Beau Bassin",
      mapUrl: "https://maps.example.test/apb",
    });
  });

  test("AC2, AC6: no WhatsApp or phone in Settings, and only the area as address: those are omitted", async () => {
    const data = await load();

    expect(data.whatsapp).toBeNull();
    expect(data.phone).toBeNull();
    expect(data.address).toBeNull(); // the seed holds "Beau Bassin" only: the area line covers it
    expect(data.text.pickupNote).not.toBe("");
  });

  test("AC3: a map URL that is not http or https is dropped", async () => {
    await setSettings(`pickup_map_url = 'javascript:alert(1)'`);

    expect((await load()).mapUrl).toBeNull();
  });

  test("AC4 (amended): the email is the footer's Settings value, and omitted when blank", async () => {
    await setSettings(`contact_email = ' hello@example.com '`);
    expect((await load()).email).toBe("hello@example.com");

    await setSettings(`contact_email = ''`);
    siteSettingsCache.clear();
    expect((await load()).email).toBeNull();
  });

  test("AC6: Settings changes show on the next read after the cache window", async () => {
    await load();
    await setSettings(`contact_phone = '+230 400 1111'`);
    expect((await load()).phone).toBeNull(); // still the cached Settings (within 60 s)

    siteSettingsCache.clear(); // the window has passed
    expect((await load()).phone).toBe("+230 400 1111");
  });
});

describe("Contact page head (S-251 AC9, S-253 AC1, AC5, AC7)", () => {
  const origin = "https://apb.test";
  const matches = [{ id: "root", loaderData: { origin } }];

  test("placeholder text: noindex, canonical, and no LocalBusiness data", async () => {
    await setSettings(`pickup_address = '12 Royal Road, Beau Bassin'`);
    const loaderData = await load("/fr/contact");

    const tags = meta({ loaderData, matches, location: { pathname: "/fr/contact" } } as never);

    expect(loaderData.isPlaceholder).toBe(true);
    expect(tags).toContainEqual({ title: "Contact | Aux petits bonheurs" });
    expect(tags).toContainEqual({ name: "robots", content: "noindex" });
    expect(tags).toContainEqual({ tagName: "link", rel: "canonical", href: "https://apb.test/fr/contact" });
    expect(tags.some((t) => "script:ld+json" in t)).toBe(false);
  });

  test("real text and an exact address: valid Bakery JSON-LD, no rating", async () => {
    await setSettings(`pickup_address = '12 Royal Road, Beau Bassin', contact_phone = '+230 400 0000'`);
    const loaderData = { ...(await load()), isPlaceholder: false };

    const tags = meta({ loaderData, matches, location: { pathname: "/contact" } } as never);
    const ld = tags.find((t) => "script:ld+json" in t) as { "script:ld+json": Record<string, unknown> } | undefined;

    expect(tags).not.toContainEqual({ name: "robots", content: "noindex" });
    expect(ld?.["script:ld+json"]).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Bakery",
      name: "Aux petits bonheurs",
      telephone: "+230 400 0000",
      address: { "@type": "PostalAddress", streetAddress: "12 Royal Road, Beau Bassin", addressCountry: "MU" },
    });
    expect(JSON.stringify(ld)).not.toContain("aggregateRating");
  });

  test("real text but no exact address yet: no LocalBusiness data", async () => {
    const loaderData = { ...(await load()), isPlaceholder: false };

    expect(bakeryJsonLd(loaderData, origin, "en")).toBeNull();
  });
});
