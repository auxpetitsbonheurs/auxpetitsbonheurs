// S-243 AC1, AC2, AC7, AC8, AC9: the phone menu button and panel rows, server-rendered. Opening,
// focus trap, Esc and focus return run in the browser (src/tests/e2e/site-navigation.spec.ts).
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { SiteHeader } from "~/components/shell/site-header";
import { links, renderInSite } from "~/server/testing/render-in-site";
import { SiteMenu } from "./site-menu";
import { SiteNavLinks } from "./site-nav";

describe("phone menu button (S-243)", () => {
  test("AC8: before hydration (or without JavaScript) it is a 44 px link named Menu to the menu page", () => {
    const [link] = links(renderInSite(<SiteMenu />, "/"));

    expect(link).toMatchObject({ href: "/menu-links" });
    expect(link?.attrs).toContain('aria-label="Menu"');
    expect(link?.attrs).toContain("size-11");
    expect(links(renderInSite(<SiteMenu />, "/fr/menu"))[0]?.href).toBe("/fr/menu-links");
  });

  test("AC1: below 1024 px the header keeps language, logo and basket, then the menu button", () => {
    const html = renderInSite(<SiteHeader basketCount={2} languageSwitch={<a href="/fr">Français</a>} />, "/");
    const order = links(html).map((l) => l.attrs.match(/aria-label="([^"]+)"/)?.[1] ?? l.text);

    expect(order[0]).toBe("Français");
    expect(order.slice(-2)).toEqual(["Basket, 2 items", "Menu"]);
    expect(html).toMatch(/<nav aria-label="Main" class="lg:hidden">/);
  });
});

describe("menu panel rows (S-243 AC2, AC7)", () => {
  test("the 7 links as rows of at least 48 px with 8 px between rows, the current one marked", () => {
    const html = renderInSite(<SiteNavLinks variant="panel" />, "/fr/menu/tarte");
    const rows = links(html);

    expect(html).toMatch(/^<ul class="flex flex-col gap-2"/);
    expect(rows.map((l) => l.text)).toEqual(["Accueil", "Notre histoire", "Notre collection", "Gâteau sur mesure", "Ateliers", "Galerie", "Contact"]);
    expect(rows.every((l) => l.attrs.includes("min-h-12") && !l.attrs.includes("nowrap") && !l.attrs.includes("truncate"))).toBe(true);
    expect(rows.filter((l) => l.current).map((l) => l.text)).toEqual(["Notre collection"]);
  });
});

describe("motion (S-243 AC9)", () => {
  test("a short fade only, and none under reduced motion", () => {
    const css = readFileSync(new URL("../../app.css", import.meta.url), "utf8");

    expect(css).toMatch(/dialog\[data-site-menu\]\[open\] \{\s*animation: site-menu-fade var\(--motion-fast\)/);
    expect(css).toMatch(/@keyframes site-menu-fade \{\s*from \{\s*opacity: 0;\s*\}\s*\}/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*dialog\[data-site-menu\]\[open\] \{\s*animation: none;/);
    expect(css).toMatch(/html:has\(dialog\[data-site-menu\]\[open\]\) \{\s*overflow: hidden;/);
  });
});
