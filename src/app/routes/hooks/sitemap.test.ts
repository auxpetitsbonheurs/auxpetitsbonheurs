// S-253 AC4, AC5, AC6: /sitemap.xml and /robots.txt.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { sitemapXml } from "~/lib/sitemap";
import { indexablePaths } from "~/server/seo-pages.server";
import { routeArgs } from "~/server/testing/route-context";
import { loader as robots } from "./robots";
import { loader } from "./sitemap";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

const fetchSitemap = async () => {
  const response = await loader(routeArgs(database, { path: "/sitemap.xml" }) as never);
  return { response, xml: await response.text() };
};
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

describe("/sitemap.xml (S-253)", () => {
  test("AC4: XML with EN and FR URLs, each with en, fr and x-default alternates", async () => {
    const { response, xml } = await fetchSitemap();

    expect(response.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(locs(xml)).toEqual(["http://localhost/", "http://localhost/fr/", "http://localhost/menu", "http://localhost/fr/menu"]);
    const frMenu = xml.split("<url>").find((block) => block.includes("<loc>http://localhost/fr/menu</loc>"));
    expect(frMenu).toContain('<xhtml:link rel="alternate" hreflang="en" href="http://localhost/menu"/>');
    expect(frMenu).toContain('<xhtml:link rel="alternate" hreflang="fr" href="http://localhost/fr/menu"/>');
    expect(frMenu).toContain('<xhtml:link rel="alternate" hreflang="x-default" href="http://localhost/menu"/>');
  });

  test("AC5: content pages still holding placeholder text are left out; /menu is always in", async () => {
    const { xml } = await fetchSitemap();

    for (const path of ["/our-story", "/custom-cake", "/workshops", "/gallery", "/contact"]) expect(xml).not.toContain(path);
  });

  test("AC4, AC5: a page the client has edited joins, in both languages", async () => {
    const paths = indexablePaths({ our_story: false, custom_order: true, workshops: true, gallery: true, contact: false });

    expect(paths).toEqual(["/", "/menu", "/our-story", "/contact"]);
    expect(locs(sitemapXml("https://apb.test", paths))).toContain("https://apb.test/fr/our-story");
  });

  test("AC4, AC6: no admin, basket, order, tracking, account, menu-links or /about URL", async () => {
    const { xml } = await fetchSitemap();

    for (const part of ["/admin", "/basket", "/order/", "/t/", "/account", "/menu-links", "/about"]) expect(xml).not.toContain(part);
  });

  test("values are XML-escaped", () => {
    expect(sitemapXml("https://a.test", ["/x&y"])).toContain("<loc>https://a.test/x&amp;y</loc>");
  });
});

describe("/robots.txt", () => {
  test("points at the sitemap and keeps crawlers out of the admin app", async () => {
    const response = robots(routeArgs(database, { path: "/robots.txt" }) as never);
    const body = await response.text();

    expect(body).toContain("Sitemap: http://localhost/sitemap.xml");
    expect(body).toContain("Disallow: /admin");
    expect(body).not.toMatch(/Disallow: \/\s*$/m);
  });
});
