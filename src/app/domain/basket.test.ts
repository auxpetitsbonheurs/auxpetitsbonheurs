// Basket rules (FR-018) not covered through the store: putting a removed line back (UX audit M3).
import { describe, expect, test } from "vitest";
import { type BasketLine, BASKET_MAX_LINES, restoreLine } from "./basket";

const line = (lineId: string, quantity = 1): BasketLine => ({ lineId, productId: "11111111-1111-4111-8111-111111111111", options: [], quantity });

describe("restoreLine", () => {
  test("puts the line back at its old position, or at the end when the basket got shorter", () => {
    expect(restoreLine([line("a"), line("c")], line("b", 2), 1).map((l) => l.lineId)).toEqual(["a", "b", "c"]);
    expect(restoreLine([line("a")], line("b"), 5).map((l) => l.lineId)).toEqual(["a", "b"]);
  });

  test("a line already in the basket is not added twice", () => {
    const lines = [line("a"), line("b")];
    expect(restoreLine(lines, line("b"), 0)).toBe(lines);
  });

  test("a full basket refuses it with BASKET_FULL", () => {
    const full = Array.from({ length: BASKET_MAX_LINES }, (_, i) => line(`l${i}`));
    expect(() => restoreLine(full, line("x"), 0)).toThrow(expect.objectContaining({ code: "BASKET_FULL" }));
  });
});
