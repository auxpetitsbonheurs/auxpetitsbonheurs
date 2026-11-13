// S-214 AC1, AC3..AC6: which lines go back into the basket and why the others are skipped.
import { describe, expect, test } from "vitest";
import type { BasketLine } from "./basket";
import { type ReorderItem, lineFromItem, reorderInto } from "./reorder";
import type { ProductProblem } from "./pricing-core";

const name = (en: string) => ({ en, fr: `${en} (fr)` });
const item = (productId: string | null, en: string, extra: Partial<ReorderItem> = {}): ReorderItem => ({ productId, name: name(en), options: [], cakeMessage: null, quantity: 1, ...extra });
let n = 0;
const nextId = () => `l${++n}`;

describe("reorderInto", () => {
  test("available items are added; a sold-out one is named as skipped (AC1)", () => {
    const problems: Record<string, ProductProblem | null> = { choc: null, vanilla: "sold_out", lemon: null };
    const result = reorderInto([], [item("choc", "Chocolate cake", { quantity: 2 }), item("vanilla", "Vanilla cake"), item("lemon", "Lemon tart")], (line) => problems[line.productId] ?? null, nextId);
    expect(result.lines.map((l) => [l.productId, l.quantity])).toEqual([
      ["choc", 2],
      ["lemon", 1],
    ]);
    expect(result.skipped).toEqual([{ name: name("Vanilla cake"), reason: "sold_out" }]);
  });

  test("hidden, out of season, a removed option and a free-text line carry their reasons (AC3, AC5)", () => {
    const problems: Record<string, ProductProblem> = { a: "hidden", b: "out_of_season", c: "options_changed" };
    const result = reorderInto([], [item("a", "A"), item("b", "B"), item("c", "C"), item(null, "Custom note")], (line) => problems[line.productId] ?? null, nextId);
    expect(result.skipped.map((s) => s.reason)).toEqual(["hidden", "out_of_season", "option_removed", "free_text"]);
    expect(result.added).toBe(0);
  });

  test("nothing available: the basket stays as it was (AC4)", () => {
    const existing: BasketLine[] = [{ lineId: "x", productId: "keep", options: [], quantity: 1 }];
    const result = reorderInto(existing, [item("gone", "Gone")], () => "hidden", nextId);
    expect(result.lines).toEqual(existing);
  });

  test("past 10 lines the rest are skipped as basket_full, never an error (AC6)", () => {
    const items = Array.from({ length: 12 }, (_, i) => item(`p${i}`, `Cake ${i}`));
    const result = reorderInto([], items, () => null, nextId);
    expect(result.lines).toHaveLength(10);
    expect(result.skipped.map((s) => s.reason)).toEqual(["basket_full", "basket_full"]);
  });
});

describe("lineFromItem", () => {
  test("regroups the stored options by group with their choices, text and quantity", () => {
    const line = lineFromItem({
      productId: "cake",
      name: name("Cake"),
      quantity: 1,
      cakeMessage: "Happy birthday",
      options: [
        { groupId: "size", choiceId: "big" },
        { groupId: "toppings", choiceId: "nuts" },
        { groupId: "toppings", choiceId: "fruit" },
      ],
    });
    expect(line).toEqual({
      productId: "cake",
      cakeMessage: "Happy birthday",
      quantity: 1,
      options: [
        { groupId: "size", choiceIds: ["big"] },
        { groupId: "toppings", choiceIds: ["nuts", "fruit"] },
      ],
    });
  });
});
