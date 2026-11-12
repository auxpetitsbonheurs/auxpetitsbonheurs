// S-252 AC1, AC4, AC5 and S-253 AC1, AC5: the `site/custom-order` loader (PGlite) and its head.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { siteSettingsCache } from "~/server/repos/settings.server";
import { routeArgs } from "~/server/testing/route-context";
import { loader, meta } from "./custom-order";

let database: TestDatabase;

beforeEach(async () => {
  siteSettingsCache.clear();
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  siteSettingsCache.clear();
  await database.close();
});

const load = (path = "/custom-cake") => loader(routeArgs(database, { path }) as never);

describe("site/custom-order loader (S-252)", () => {
  test("AC1: localised title and text; contacts from Settings", async () => {
    await database.client.query(`update settings set contact_whatsapp = '+230 5000 0000'`);

    const data = await load("/fr/custom-cake");

    expect(data.title).toBe("Gâteau sur mesure");
    expect(data.text.intro).toMatch(/gâteau/i);
    expect(data.whatsapp).toBe("+230 5000 0000");
  });

  test("AC4: ?fromGallery= is ignored safely: the same content", async () => {
    const plain = await load();
    const fromGallery = await load("/custom-cake?fromGallery=%3Cscript%3E");

    expect(fromGallery).toEqual(plain);
  });

  test("AC5: the notice period is the Settings default notice days", async () => {
    await database.client.query(`update settings set default_notice_days = 5`);

    expect((await load()).noticeDays).toBe(5);
  });
});

describe("Custom order head (S-253 AC1, AC3, AC5)", () => {
  test("placeholder: noindex; canonical has no query; share tags carry title and description", async () => {
    const loaderData = await load("/custom-cake?fromGallery=abc");

    const tags = meta({ loaderData, matches: [{ id: "root", loaderData: { origin: "https://apb.test" } }], location: { pathname: "/custom-cake" } } as never);

    expect(tags).toContainEqual({ title: "Custom order | Aux petits bonheurs" });
    expect(tags).toContainEqual({ name: "robots", content: "noindex" });
    expect(tags).toContainEqual({ tagName: "link", rel: "canonical", href: "https://apb.test/custom-cake" });
    expect(tags).toContainEqual({ property: "og:title", content: "Custom order | Aux petits bonheurs" });
    expect(tags).toContainEqual({ property: "og:description", content: loaderData.description });
  });
});
