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
  facebookUrl: "https://www.facebook.com/auxpetitsbonheurs",
  mapUrl: "https://maps.example/beau-bassin",
};
const empty: FooterContacts = { whatsapp: null, phone: null, email: null, pickupAddress: null, instagramUrl: null, facebookUrl: null, mapUrl: null };

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

  test("S-283 AC3, AC4: Instagram and Facebook are icon links with the bakery's name, in a new tab with no opener", () => {
    const all = links(render(full));
    for (const [href, name] of [
      ["https://instagram.com/auxpetitsbonheurs", "Aux petits bonheurs on Instagram"],
      ["https://www.facebook.com/auxpetitsbonheurs", "Aux petits bonheurs on Facebook"],
    ]) {
      const link = all.filter((l) => l.href === href);
      expect(link).toHaveLength(1);
      expect(link[0]?.attrs).toContain(`aria-label="${name}"`);
      expect(link[0]?.attrs).toContain('target="_blank"');
      expect(link[0]?.attrs).toContain('rel="noopener noreferrer"');
      expect(link[0]?.attrs).toContain('aria-describedby="footer-new-tab"');
    }
    expect(render(full)).toMatch(/id="footer-new-tab"[^>]*>\(opens in a new tab\)</);
  });

  test("S-283 AC4: French names", () => {
    const attrs = links(render(full, "/fr")).map((l) => l.attrs).join(" ");
    expect(attrs).toContain('aria-label="Aux petits bonheurs sur Instagram"');
    expect(attrs).toContain('aria-label="Aux petits bonheurs sur Facebook"');
  });

  test("S-283 AC3: only the icons whose link is set", () => {
    const onlyFacebook = links(render({ ...empty, facebookUrl: "https://fb.com/apb" })).map((l) => l.href);
    expect(onlyFacebook).toContain("https://fb.com/apb");
    expect(onlyFacebook.some((h) => h.includes("instagram"))).toBe(false);
    const none = render(empty);
    expect(none).not.toContain("footer-social");
    expect(none).not.toContain("footer-new-tab");
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
    const names = links(html).map((l) => /aria-label="([^"]*)"/.exec(l.attrs)?.[1] ?? (l.text || (/<img [^>]*alt="([^"]*)"/.exec(html.slice(html.indexOf(l.attrs)))?.[1] ?? "")));
    expect(names.every((n) => n.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  test("AC6: HTML in Settings text is shown as text, never markup", () => {
    const html = render({ ...full, pickupAddress: "<img src=x onerror=alert(1)>Beau Bassin" });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;Beau Bassin");
  });
});
