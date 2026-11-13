// S-244 AC1, AC2, AC3, AC4: grouping, "from" price, required options and season rules (fixed date).
import { describe, expect, test } from "vitest";
import { COLLECTION_TYPE_ORDER, collectionSections, fromPriceRs, needsOptions } from "./collection";
import type { MenuOptionGroup } from "./menu";
import { PRODUCT_TYPES } from "./product";
import { menu, menuProduct } from "./testing/menu";

const group = (required: boolean, deltas: number[], kind = "single"): MenuOptionGroup => ({
  id: `g-${deltas.join("-")}`,
  name: { en: "Size", fr: "Taille" },
  kind,
  required,
  textMaxLength: null,
  quantityMin: null,
  quantityMax: null,
  choices: deltas.map((d, i) => ({ id: `c${i}`, name: { en: `C${i}`, fr: null }, priceDeltaRs: d })),
});

describe("collectionSections (S-244 AC1, AC4)", () => {
  test("the type order is the menu's (PRODUCT_TYPES)", () => {
    expect(COLLECTION_TYPE_ORDER).toEqual(PRODUCT_TYPES);
  });

  test("one section per type in type order, products in menu order", () => {
    const products = [
      menuProduct("d1", 300, { type: "dessert" }),
      menuProduct("c1", 900, { type: "cake" }),
      menuProduct("b1", 600, { type: "cupcake_box" }),
      menuProduct("c2", 850, { type: "cake" }),
    ];

    const sections = collectionSections(menu(products), "2026-11-20");

    expect(sections.map((s) => [s.type, s.products.map((p) => p.id)])).toEqual([
      ["cake", ["c1", "c2"]],
      ["cupcake_box", ["b1"]],
      ["dessert", ["d1"]],
    ]);
  });

  test("a seasonal product outside its window (Mauritius date) is absent; inside it, shown", () => {
    const xmas = menuProduct("s1", 1200, { type: "seasonal", season: { startsOn: "2026-12-01", endsOn: "2026-12-24" } });

    expect(collectionSections(menu([xmas]), "2026-11-30")).toEqual([]);
    expect(collectionSections(menu([xmas]), "2026-12-01")[0]?.products).toHaveLength(1);
    expect(collectionSections(menu([xmas]), "2026-12-24")[0]?.products).toHaveLength(1);
    expect(collectionSections(menu([xmas]), "2026-12-25")).toEqual([]);
  });

  test("a type with no visible product has no section; sold out products stay listed", () => {
    const sections = collectionSections(menu([menuProduct("c1", 900, { status: "sold_out" })]), "2026-11-20");

    expect(sections).toHaveLength(1);
    expect(sections[0]?.products[0]?.status).toBe("sold_out");
  });

  test("a menu cached before S-244 (no season field) shows every product", () => {
    const { season: _none, ...old } = menuProduct("c1", 900);

    expect(collectionSections(menu([old]), "2026-11-20")[0]?.products).toHaveLength(1);
  });
});

describe("fromPriceRs (S-244 AC2)", () => {
  test("base price when there is no required group", () => {
    expect(fromPriceRs(menuProduct("c1", 850, { optionGroups: [group(false, [300])] }))).toBe(850);
  });

  test("adds the cheapest choice of each required pick-one or pick-several group", () => {
    const product = menuProduct("c1", 0, { optionGroups: [group(true, [1200, 900, 1500]), group(true, [50, 0], "multiple"), group(false, [100])] });

    expect(fromPriceRs(product)).toBe(900);
  });

  test("S-081: the cheapest valid configuration, so an optional discount choice counts too", () => {
    const product = menuProduct("c1", 0, { optionGroups: [group(true, [1200, 900]), group(false, [-100])] });

    expect(fromPriceRs(product)).toBe(800);
  });

  test("real menu: cookies Box of 6/12/18 from Rs 420; a cake from its 6 inch price", () => {
    const box = { ...group(true, [0, 360, 660]), name: { en: "Box", fr: "Boîte" } };

    expect(fromPriceRs(menuProduct("k1", 420, { type: "dessert", optionGroups: [box] }))).toBe(420);
    expect(fromPriceRs(menuProduct("c1", 1200, { optionGroups: [group(true, [0, 300, 600])] }))).toBe(1200);
  });
});

describe("needsOptions (S-244 AC3)", () => {
  test("true with a required group, false otherwise", () => {
    expect(needsOptions(menuProduct("c1", 1, { optionGroups: [group(true, [0])] }))).toBe(true);
    expect(needsOptions(menuProduct("c1", 1, { optionGroups: [group(false, [0])] }))).toBe(false);
  });
});
