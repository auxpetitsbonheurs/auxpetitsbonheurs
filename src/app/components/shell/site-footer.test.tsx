// S-061: the footer from Settings: every contact as a working link, empty values omitted,
// French labels and links under /fr, Settings text escaped, distinct visible names.
import { describe, expect, test } from "vitest";
import { links, renderInSite } from "~/server/testing/render-in-site";
import { type FooterContacts, SiteFooter } from "./site-footer";

const full: FooterContacts = {
  whatsapp: "+230 5000 0000",
  phone: "+230 5000 0001",
  email: "hello@example.com",
  pickupAddress: "Beau Bassin",
  instagramUrl: "https://instagram.com/auxpetitsbonheurs",
  mapUrl: "https://maps.example/beau-bassin",
};
const empty: FooterContacts = { whatsapp: null, phone: null, email: null, pickupAddress: null, instagramUrl: null, mapUrl: null };

const render = (contacts: FooterContacts, path = "/") => renderInSite(<SiteFooter contacts={contacts} year="2026" />, path);

describe("SiteFooter", () => {
  test("AC1: each Settings value is a working link (wa.me, tel, mailto, Instagram, map)", () => {
    const hrefs = links(render(full)).map((l) => l.href);

    expect(hrefs).toContain("https://wa.me/23050000000");
    expect(hrefs).toContain("tel:+23050000001");
    expect(hrefs).toContain("mailto:hello@example.com");
    expect(hrefs).toContain("https://instagram.com/auxpetitsbonheurs");
    expect(hrefs).toContain("https://maps.example/beau-bassin");
  });

  test("AC1: the site pages are linked from the footer (EN)", () => {
    const hrefs = links(render(full)).map((l) => l.href);
    for (const path of ["/our-story", "/menu", "/custom-cake", "/workshops", "/gallery", "/contact"]) expect(hrefs).toContain(path);
  });

  test("AC1: Instagram opens in a new tab with a screen-reader cue and no opener", () => {
    const instagram = links(render(full)).find((l) => l.href.startsWith("https://instagram.com"));
    expect(instagram?.attrs).toContain('target="_blank"');
    expect(instagram?.attrs).toContain('rel="noopener noreferrer"');
    expect(instagram?.text).toMatch(/Instagram.*opens in a new tab/);
  });

  test("AC3: empty values leave no row, heading or empty link", () => {
    const html = render(empty);
    const hrefs = links(html).map((l) => l.href);

    expect(hrefs.some((h) => /wa\.me|tel:|mailto:|instagram/.test(h))).toBe(false);
    expect(html).not.toContain("Contact the bakery");
    expect(html).not.toContain("Pickup in");
    expect(html).not.toContain('href=""');
    expect(html).not.toMatch(/<li[^>]*>\s*<\/li>/);
  });

  test("AC3: an address with no map link is plain text", () => {
    const html = render({ ...empty, pickupAddress: "Beau Bassin" });
    expect(html).toContain("Beau Bassin");
    expect(links(html).some((l) => l.text.includes("Beau Bassin"))).toBe(false);
  });

  test("AC4: French labels and /fr links", () => {
    const html = render(full, "/fr");
    const all = links(html);

    expect(html).toContain("Contacter la pâtisserie");
    expect(all.map((l) => l.href)).toContain("/fr/our-story");
    expect(all.map((l) => l.href)).toContain("/fr/menu");
    expect(all.find((l) => l.href.startsWith("tel:"))?.text).toContain("Téléphone");
  });

  test("AC5: every link has a distinct visible name", () => {
    // An image link's name is its alt (the logo badge links home).
    const html = render(full);
    const names = links(html).map((l) => l.text || (/<img [^>]*alt="([^"]*)"/.exec(html.slice(html.indexOf(l.attrs)))?.[1] ?? ""));
    expect(names.every((n) => n.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  test("AC6: HTML in Settings text is shown as text, never markup", () => {
    const html = render({ ...full, pickupAddress: "<img src=x onerror=alert(1)>Beau Bassin" });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;Beau Bassin");
  });
});
