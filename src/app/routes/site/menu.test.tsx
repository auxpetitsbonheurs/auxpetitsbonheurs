// S-244 AC1, AC2, AC3, AC6, AC7: the Our collection page, server-rendered from a menu.
import { describe, expect, test } from "vitest";
import { links, renderInSite } from "~/server/testing/render-in-site";
import type { MenuEntry, MenuOptionGroup, MenuProduct } from "~/domain/menu";
import { menu, menuProduct } from "~/domain/testing/menu";
import Collection, { ErrorBoundary } from "./menu";

const size: MenuOptionGroup = {
  id: "g1",
  name: { en: "Size", fr: "Taille" },
  kind: "single",
  required: true,
  textMaxLength: null,
  quantityMin: null,
  quantityMax: null,
  choices: [
    { id: "c1", name: { en: "6 inch", fr: null }, priceDeltaRs: 0 },
    { id: "c2", name: { en: "8 inch", fr: null }, priceDeltaRs: 600 },
  ],
};
const photo = { url: "/images/sample/chocolate-cake.svg", width: 800, height: 600 };

function page(products: MenuProduct[], path = "/menu") {
  const entry: MenuEntry = { v: "m-1", data: menu(products) };
  return renderInSite(<Collection {...({ loaderData: { menu: entry, title: null, description: null } } as never)} />, path);
}

const cake = (overrides: Partial<MenuProduct> = {}) =>
  menuProduct("11111111-aaaa", 1200, { slug: "chocolate-cake", name: { en: "Chocolate cake", fr: "Gâteau au chocolat" }, photos: [photo], optionGroups: [size], ...overrides });

describe("Our collection page (S-244)", () => {
  test("AC1: h1 and one h2 per type that has products, in type order", () => {
    const html = page([menuProduct("d1-x", 300, { type: "dessert", name: { en: "Cookie", fr: null } }), cake()]);

    expect(html).toMatch(/<h1[^>]*>Our collection<\/h1>/);
    expect([...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1])).toEqual(["Cakes", "Cookies &amp; desserts"]);
  });

  test("AC2: photo with size and alt, name, 'from Rs X' kept on one line, one link to the product page", () => {
    const html = page([cake()]);

    expect(html).toContain('<img src="/images/sample/chocolate-cake.svg" alt="Chocolate cake" width="800" height="600" loading="eager"');
    expect(html).toMatch(/whitespace-nowrap[^>]*>from Rs 1,200</);
    const cardLinks = links(html).filter((l) => l.href.startsWith("/menu/"));
    expect(cardLinks.map((l) => [l.href, l.text])).toEqual([["/menu/chocolate-cake", "Chocolate cake"]]);
    expect(cardLinks[0]?.attrs).toContain("after:inset-0");
  });

  test("AC2: in French the link keeps /fr, the alt and name are French", () => {
    const html = page([cake()], "/fr/menu");

    expect(html).toContain('alt="Gâteau au chocolat"');
    expect(links(html).find((l) => l.href.startsWith("/fr/menu/"))?.text).toBe("Gâteau au chocolat");
    expect(html).toContain("à partir de Rs 1,200");
    expect(html).toContain("Choisir les options");
  });

  test("S-276 AC3: a photo with smaller copies gets srcset and the card's sizes; the first card stays the eager, high-priority LCP image", () => {
    const srcSet = "https://cdn.test/p-480w.webp 480w, https://cdn.test/p-960w.webp 960w, https://cdn.test/p.webp 1600w";
    const html = page([cake({ photos: [{ url: "https://cdn.test/p.webp", width: 1600, height: 1200, srcSet }] })]);

    const img = html.match(/<img[^>]*cdn\.test\/p\.webp[^>]*>/)![0];
    expect(img).toMatch(new RegExp(`srcSet="${srcSet}"`, "i"));
    expect(img).toContain('sizes="(min-width: 64rem) 17rem, (min-width: 48rem) 31vw, (min-width: 20rem) 47vw, 100vw"');
    expect(img).toContain('width="1600" height="1200" loading="eager"');
    expect(img).toMatch(/fetchPriority="high"/i);
  });

  test("S-276 AC4: a photo without copies has no srcset or sizes (the original is used)", () => {
    const img = page([cake()]).match(/<img[^>]*chocolate-cake\.svg[^>]*>/)![0];

    expect(img).not.toMatch(/srcset|sizes=/i);
  });

  test("AC2: cards after the first row load lazily", () => {
    const products = Array.from({ length: 6 }, (_, i) => cake({ id: `p${i}-xxxx`, slug: `cake-${i}` }));

    const loading = [...page(products).matchAll(/loading="(\w+)"/g)].map((m) => m[1]);

    expect(loading).toEqual(["eager", "eager", "eager", "eager", "lazy", "lazy"]);
  });

  test("AC3: required options say 'Choose options'; sold out shows a label with an icon and still links", () => {
    const html = page([cake({ status: "sold_out" })]);

    expect(html).toContain("Choose options");
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"[^>]*>.*?<\/svg>Sold out/);
    const link = links(html).find((l) => l.href === "/menu/chocolate-cake");
    expect(link?.attrs).toMatch(/aria-describedby="price-11111111-aaaa status-11111111-aaaa"/);
  });

  test("AC6: no products: 'Our collection is being prepared.'", () => {
    const html = page([]);

    expect(html).toContain("Our collection is being prepared.");
    expect(html).not.toContain("<h2");
  });

  test("AC6: the menu cannot load: a section error with Retry, inside the page frame", () => {
    const html = renderInSite(<ErrorBoundary {...({ error: new Error("down") } as never)} />, "/menu");

    expect(html).toContain('role="alert"');
    expect(html).toContain("We could not load our collection.");
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>.*Try again<\/button>/);
  });

  test("AC7: 2 columns at 375 px, 3 at md, 4 at lg; type anchors when there are 2+ types", () => {
    const html = page([cake(), menuProduct("b1-x", 600, { type: "cupcake_box" })]);

    expect(html).toContain("grid-cols-2");
    expect(html).toContain("md:grid-cols-3");
    expect(html).toContain("lg:grid-cols-4");
    expect(links(html).filter((l) => l.href.startsWith("#type-")).map((l) => [l.href, l.text])).toEqual([
      ["#type-cake", "Cakes"],
      ["#type-cupcake_box", "Cupcakes"],
    ]);
  });
});
