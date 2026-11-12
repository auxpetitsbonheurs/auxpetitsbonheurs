// S-242 AC1-AC4, AC7; S-244 AC9: the header's site navigation, server-rendered.
import { describe, expect, test } from "vitest";
import { SiteHeader } from "~/components/shell/site-header";
import { links, renderInSite } from "~/server/testing/render-in-site";
import { SiteNav } from "./site-nav";

const EN = ["Home", "Our story", "Our collection", "Custom order", "Workshops", "Gallery", "Contact us"];
const FR = ["Accueil", "Notre histoire", "Notre collection", "Gâteau sur mesure", "Ateliers", "Galerie", "Contact"];
const PATHS = ["/", "/our-story", "/menu", "/custom-cake", "/workshops", "/gallery", "/contact"];

/** The 7 site links of the laptop nav (inside `<nav aria-label="Main">` with the bar classes). */
function navLinks(path: string) {
  return links(renderInSite(<SiteNav />, path));
}

describe("laptop site navigation (S-242)", () => {
  test("AC1: a labelled nav with the 7 links in the Owner's order and their routes", () => {
    const html = renderInSite(<SiteNav />, "/");

    expect(html).toMatch(/^<nav aria-label="Main"/);
    expect(navLinks("/").map((l) => [l.text, l.href])).toEqual(EN.map((text, i) => [text, PATHS[i]]));
  });

  test("AC2: French labels and /fr links; labels never wrap (nowrap)", () => {
    const fr = navLinks("/fr/menu");

    expect(fr.map((l) => l.text)).toEqual(FR);
    // Home is "/fr/", like the logo link (localePath).
    expect(fr.map((l) => l.href)).toEqual(PATHS.map((p) => `/fr${p}`));
    expect(fr.every((l) => l.attrs.includes("whitespace-nowrap"))).toBe(true);
  });

  test("AC3, S-244 AC9: the current page has aria-current=page and a gold underline; /menu/:slug marks Our collection", () => {
    for (const [path, label] of [["/", "Home"], ["/contact", "Contact us"], ["/menu", "Our collection"], ["/menu/chocolate-cake", "Our collection"]] as const) {
      const current = navLinks(path).filter((l) => l.current);
      expect(current.map((l) => l.text)).toEqual([label]);
      expect(current[0]?.attrs).toContain("aria-[current=page]:underline");
      expect(current[0]?.attrs).toContain("decoration-band-gold");
    }
    expect(navLinks("/basket").some((l) => l.current)).toBe(false);
  });

  test("AC7: hidden below 1024 px (display none, so not read twice)", () => {
    expect(renderInSite(<SiteNav />, "/")).toMatch(/^<nav [^>]*class="hidden [^"]*lg:block/);
  });
});

describe("header account icon (S-242 AC4)", () => {
  test("no account icon while customer accounts are not live", () => {
    const html = renderInSite(<SiteHeader basketCount={0} />, "/");

    expect(html).not.toContain("My account");
  });

  test("once the account route exists: a 44 px 'My account' link between language and basket", () => {
    const html = renderInSite(<SiteHeader basketCount={0} languageSwitch={<a href="/fr">Français</a>} accountHref="/account" />, "/");
    const order = links(html).map((l) => l.attrs.match(/aria-label="([^"]+)"/)?.[1] ?? l.text);

    const account = links(html).find((l) => l.href === "/account");
    expect(account?.attrs).toContain('aria-label="My account"');
    expect(account?.attrs).toContain("size-11");
    // Phone switch first (hidden from 1024 px), then logo, 7 links, laptop switch, account, basket, menu.
    expect(order.slice(-4)).toEqual(["Français", "My account", "Basket, 0 items", "Menu"]);
  });
});
