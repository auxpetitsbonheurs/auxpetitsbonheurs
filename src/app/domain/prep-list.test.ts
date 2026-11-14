// Prep list grouping and share text (S-139 AC1-AC5, AC9, AC12; S-140 AC3).
import { describe, expect, test } from "vitest";
import type { OrderItemOption } from "~/db/schema";
import { type PrepItem, PREP_STATUSES, buildPrepList, prepShareText } from "./prep-list";

const size = (en: string, fr: string): OrderItemOption => ({ groupId: "g-size", group: { en: "Size", fr: "Taille" }, kind: "single", choiceId: en, choice: { en, fr }, priceDeltaRs: 0 });
const flavour = (en: string, fr: string): OrderItemOption => ({ groupId: "g-flav", group: { en: "Flavour", fr: "Parfum" }, kind: "single", choiceId: en, choice: { en, fr }, priceDeltaRs: 0 });

let n = 0;
function item(overrides: Partial<PrepItem> = {}): PrepItem {
  n += 1;
  return {
    orderId: `o${n}`,
    productId: "p-cake",
    productSort: 1,
    name: { en: "Chocolate cake", fr: "Gâteau au chocolat" },
    options: [size("8 inch", "20 cm"), flavour("Vanilla", "Vanille")],
    cakeMessage: null,
    quantity: 1,
    ...overrides,
  };
}

describe("buildPrepList (S-139)", () => {
  test("two identical cakes across orders are one line x2 (AC1)", () => {
    const list = buildPrepList([item(), item()], "en");
    expect(list.groups).toEqual([{ product: "Chocolate cake", variants: [{ label: "8 inch · Vanilla", quantity: 2, orderCount: 2, messages: [] }] }]);
    expect(list.summary).toEqual({ orders: 2, items: 2 });
  });

  test("same variant with two messages: one line x2 with both messages (AC2)", () => {
    const list = buildPrepList([item({ cakeMessage: "Happy Bday Ana" }), item({ cakeMessage: "Joyeux anniversaire 🎂" })], "en");
    expect(list.groups[0]!.variants).toEqual([{ label: "8 inch · Vanilla", quantity: 2, orderCount: 2, messages: ["Happy Bday Ana", "Joyeux anniversaire 🎂"] }]);
  });

  test("text options read as messages, not part of the variant", () => {
    const text: OrderItemOption = { groupId: "g-name", group: { en: "Name", fr: "Prénom" }, kind: "text", text: "Zoé", priceDeltaRs: 0 };
    const list = buildPrepList([item({ options: [size("8 inch", "20 cm"), text] })], "fr");
    expect(list.groups[0]!.variants[0]).toMatchObject({ label: "20 cm", messages: ["Prénom : Zoé"] });
  });

  test("free-text manual items group under Other with their text, last (AC3)", () => {
    const list = buildPrepList([item({ productId: null, productSort: null, name: { en: "Gift box" }, options: [], quantity: 2 }), item()], "en");
    expect(list.groups.map((g) => g.product)).toEqual(["Chocolate cake", "Other"]);
    expect(list.groups[1]!.variants).toEqual([{ label: "Gift box", quantity: 2, orderCount: 1, messages: [] }]);
    expect(buildPrepList([item({ productId: null, productSort: null, name: { en: "Gift box" }, options: [] })], "fr").groups[0]!.product).toBe("Autres");
  });

  test("groups follow menu order; labels in the admin's locale joined by ' · ' (AC5)", () => {
    const list = buildPrepList([item(), item({ productId: "p-tart", productSort: 0, name: { en: "Lemon tart", fr: "Tarte au citron" }, options: [] })], "fr");
    expect(list.groups.map((g) => g.product)).toEqual(["Tarte au citron", "Gâteau au chocolat"]);
    expect(list.groups[1]!.variants[0]!.label).toBe("20 cm · Vanille");
    expect(list.groups[0]!.variants[0]!.label).toBe("");
  });

  test("only the confirmed group counts (AC4)", () => {
    expect([...PREP_STATUSES]).toEqual(["approved", "in_preparation", "ready_for_pickup", "out_for_delivery", "completed"]);
  });

  test("an empty day has no groups (AC7)", () => {
    expect(buildPrepList([], "en")).toEqual({ summary: { orders: 0, items: 0 }, groups: [] });
  });
});

describe("prepShareText (S-140 AC1, AC3)", () => {
  test("plain text with the same grouping, quantities and quoted messages; no customer data", () => {
    const list = buildPrepList([item({ cakeMessage: "Happy Bday Ana" }), item(), item({ productId: null, productSort: null, name: { en: "Gift box" }, options: [] })], "en");
    const text = prepShareText(list, { dateLabel: "Saturday 12 December 2026", generatedLabel: "Generated 14:05", locale: "en" });
    expect(text).toBe(
      [
        "Prep list · Saturday 12 December 2026",
        "3 orders, 3 items",
        "",
        "Chocolate cake",
        "- 2 × 8 inch · Vanilla",
        '  "Happy Bday Ana"',
        "",
        "Other",
        "- 1 × Gift box",
        "",
        "Generated 14:05",
      ].join("\n"),
    );
  });

  test("French wording", () => {
    const list = buildPrepList([item({ productId: "p-tart", name: { en: "Lemon tart", fr: "Tarte au citron" }, options: [] })], "fr");
    expect(prepShareText(list, { dateLabel: "samedi 12 décembre 2026", generatedLabel: "Généré à 14:05", locale: "fr" }).split("\n").slice(0, 5)).toEqual([
      "Liste de préparation · samedi 12 décembre 2026",
      "1 commande, 1 article",
      "",
      "Tarte au citron",
      "- 1 ×",
    ]);
  });
});
