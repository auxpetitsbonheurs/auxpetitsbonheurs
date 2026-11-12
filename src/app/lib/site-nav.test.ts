// S-242 AC1, AC3; S-244 AC9: the nav items, their order and the current-page rule.
import { describe, expect, test } from "vitest";
import { PLACEHOLDER_PAGES, SITE_NAV_ITEMS, currentNavKey } from "./site-nav";

describe("siteNavItems (S-242 AC1)", () => {
  test("seven items in the Owner's order with their routes", () => {
    expect(SITE_NAV_ITEMS.map((i) => [i.key, i.path])).toEqual([
      ["home", "/"],
      ["ourStory", "/our-story"],
      ["collection", "/menu"],
      ["customOrder", "/custom-cake"],
      ["workshops", "/workshops"],
      ["gallery", "/gallery"],
      ["contact", "/contact"],
    ]);
  });

  test("every page not built yet has a placeholder", () => {
    expect([...PLACEHOLDER_PAGES]).toEqual(["ourStory", "customOrder", "workshops", "gallery", "contact"]);
  });
});

describe("currentNavKey (S-242 AC3, S-244 AC9)", () => {
  test.each([
    ["/", "home"],
    ["/fr", "home"],
    ["/fr/", "home"],
    ["/menu", "collection"],
    ["/fr/menu", "collection"],
    ["/menu/chocolate-cake", "collection"],
    ["/fr/menu/chocolate-cake", "collection"],
    ["/our-story", "ourStory"],
    ["/custom-cake/", "customOrder"],
    ["/fr/contact", "contact"],
  ])("%s -> %s", (path, key) => {
    expect(currentNavKey(path)).toBe(key);
  });

  test("pages outside the nav have no current item", () => {
    for (const path of ["/basket", "/fr/basket", "/t/abc", "/menu-links", "/menus", "/frx"]) expect(currentNavKey(path)).toBeNull();
  });
});
