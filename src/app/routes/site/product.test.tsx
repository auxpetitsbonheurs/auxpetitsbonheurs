// S-066 AC1, AC2, AC11 (markup): the product page ordering area, server-rendered from loader
// data. Interaction (live price changes, focus, sticky bar, axe) runs in the browser:
// src/tests/e2e/product-options.spec.ts.
import { beforeAll, describe, expect, test } from "vitest";
import { type PricingGroup, priceLine } from "~/domain/pricing";
import { formatRupees } from "~/lib/locale";
import { renderInSite } from "~/server/testing/render-in-site";
import Product from "./product";

const group = (id: string, kind: string, required: boolean, choices: [string, number][], extra: Partial<PricingGroup> = {}): PricingGroup => ({
  id,
  name: { en: id === "size" ? "Size" : id === "addons" ? "Add-ons" : id === "extra" ? "Extra cupcakes" : "Name", fr: id === "size" ? "Taille" : null },
  kind,
  required,
  textMaxLength: null,
  quantityMin: null,
  quantityMax: null,
  choices: choices.map(([choiceId, priceDeltaRs]) => ({ id: choiceId, name: { en: choiceId, fr: null }, priceDeltaRs })),
  ...extra,
});

const base = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "chocolate-cake",
  type: "cake" as const,
  name: { en: "Chocolate cake", fr: "Gâteau au chocolat" },
  description: null,
  allergens: [],
  photos: [],
  status: "available" as const,
  minQuantity: null,
  basePriceRs: 1200,
};

function render(optionGroups: PricingGroup[], path = "/menu/chocolate-cake", overrides: Partial<typeof base> = {}) {
  const loaderData = { product: { ...base, ...overrides, optionGroups }, cakeMessageMax: 40 };
  return renderInSite(<Product {...({ loaderData, actionData: undefined } as never)} />, path);
}

// The ordering area is a lazy chunk: render once to start loading it, then every render has it.
beforeAll(async () => {
  render([]);
  await import("~/components/product/order-form");
  await new Promise((done) => setTimeout(done, 0));
});

const OPTIONS = [
  group("size", "single", true, [["6 inch", 0], ["8 inch", 600]]),
  group("addons", "multiple", false, [["Candles", 150]]),
  group("extra", "quantity", false, [["Cupcake", 50]], { quantityMin: 0, quantityMax: 12 }),
  group("name", "text", false, [], { textMaxLength: 20 }),
];

describe("option pickers (S-066 AC1)", () => {
  test("one picker per group with choice names and price changes; required and optional are marked in words", () => {
    const html = render(OPTIONS);

    expect([...html.matchAll(/<legend[^>]*>(.*?)<\/legend>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, ""))).toEqual(["Size (Required)", "Add-ons (Optional)", "Extra cupcakes (Optional)"]);
    expect(html).toContain('type="radio"');
    expect(html).toContain("+Rs 600");
    expect(html).toContain("+Rs 150");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('name="optionQty.extra"');
    expect(html).toMatch(/<label for="optionText.name"[^>]*>Name/);
  });

  test("a cake without a text group gets the message field; with one, only the group's field", () => {
    expect(render(OPTIONS.slice(0, 1))).toContain('name="cakeMessage"');
    expect(render(OPTIONS)).not.toContain('name="cakeMessage"');
    expect(render(OPTIONS.slice(0, 1), undefined, { type: "dessert" as never })).not.toContain('name="cakeMessage"');
  });

  test("French labels", () => {
    const html = render(OPTIONS.slice(0, 1), "/fr/menu/chocolate-cake");

    expect(html).toMatch(/<legend[^>]*>Taille <span[^>]*>\(Obligatoire\)/);
  });
});

describe("price (S-066 AC2)", () => {
  test("with a required size not chosen yet, the heading and the bar say From Rs 1,200", () => {
    const html = render(OPTIONS);

    expect(html.match(/From Rs\s1,200/gu)).toHaveLength(2);
  });

  test("with nothing to choose the bar shows the exact priceLine price", () => {
    const html = render([]);
    const expected = formatRupees(priceLine({ ...base, optionGroups: [] }, { productId: base.id, options: [], quantity: 1 }, null, { cakeMessageMax: 40 }).lineTotalRs);

    expect(html).toMatch(new RegExp(`data-testid="live-price"[^>]*>${expected.replace(" ", "\\s")}<`, "u"));
  });
});

describe("stepper names (S-066 AC11)", () => {
  test("the quantity buttons have distinct names that say the product", () => {
    const html = render(OPTIONS);

    expect(html).toContain('aria-label="Decrease quantity of Chocolate cake"');
    expect(html).toContain('aria-label="Increase quantity of Chocolate cake"');
    expect(html).toContain('aria-label="Fewer: Extra cupcakes"');
    expect(html).toContain('aria-label="More: Extra cupcakes"');
    expect(html).toContain('<label for="quantity"');
  });

  test("Add to basket is never disabled", () => {
    expect(render(OPTIONS)).toMatch(/<button[^>]*type="submit"(?![^>]*disabled)[^>]*>Add to basket/);
  });
});

describe("sold out (S-065 AC4)", () => {
  test("says Sold out this week in words, and shows no options, quantity or Add bar", () => {
    const html = render(OPTIONS, undefined, { status: "sold_out" as never });

    expect(html).toContain("Sold out this week");
    expect(html).not.toContain('type="radio"');
    expect(html).not.toContain('name="quantity"');
    expect(html).not.toContain("Add to basket");
    expect(html).not.toContain("data-add-bar");
  });

  test("in French", () => {
    expect(render(OPTIONS, "/fr/menu/chocolate-cake", { status: "sold_out" as never })).toContain("Épuisé cette semaine");
  });
});
