// Shared `apb_basket` format (ADR-0004): the browser checks lines exactly as the server's
// zod schema does, and writes the same cookie string the server writes.
import { describe, expect, test } from "vitest";
import { BasketLine as BasketLineSchema } from "~/server/contracts/shared";
import { BASKET_MAX_LINES, type BasketLine } from "./basket";
import { BASKET_COOKIE, basketCookie, basketCookieValue, basketLineFrom, clearBasketCookie, decodeBasket, newLineId } from "./basket-cookie";

const PRODUCT = "11111111-1111-4111-8111-111111111111";
const GROUP = "22222222-2222-4222-8222-222222222222";
const valid = { lineId: "abc", productId: PRODUCT, options: [], quantity: 2 };

const corpus: unknown[] = [
  valid,
  { ...valid, quantity: "3" },
  { ...valid, quantity: 0 },
  { ...valid, quantity: 51 },
  { ...valid, quantity: 1.5 },
  { ...valid, quantity: "x" },
  { ...valid, lineId: "" },
  { ...valid, lineId: "x".repeat(17) },
  { ...valid, lineId: 7 },
  { ...valid, productId: "not-a-uuid" },
  { ...valid, productId: PRODUCT.toUpperCase() },
  { ...valid, options: "none" },
  { ...valid, options: [{ groupId: GROUP }] },
  { ...valid, options: [{ groupId: GROUP, choiceIds: [PRODUCT], text: "Pink", quantity: "4" }] },
  { ...valid, options: [{ groupId: GROUP, choiceIds: ["nope"] }] },
  { ...valid, options: [{ groupId: GROUP, quantity: 100 }] },
  { ...valid, options: [{ groupId: GROUP, text: "x".repeat(201) }] },
  { ...valid, options: Array.from({ length: 21 }, () => ({ groupId: GROUP })) },
  { ...valid, cakeMessage: "Happy birthday" },
  { ...valid, cakeMessage: "x".repeat(201) },
  { ...valid, cakeMessage: 12 },
  { ...valid, unitPriceRs: 1, extra: true },
  { ...valid, quantity: undefined },
  null,
  "line",
  [valid],
];

describe("basketLineFrom matches the server's zod BasketLine", () => {
  test.each(corpus.map((item, i) => [i, item]))("corpus item %i", (_i, item) => {
    const zod = BasketLineSchema.safeParse(item);
    expect(basketLineFrom(item)).toEqual(zod.success ? zod.data : undefined);
  });

  test("never keeps a price or unknown field", () => {
    expect(basketLineFrom({ ...valid, unitPriceRs: 1 })).toEqual(valid);
  });
});

describe("cookie string", () => {
  test("not HttpOnly, SameSite=Lax, Secure, 30 days, no prices", () => {
    const cookie = basketCookie([valid as BasketLine]);
    expect(cookie.startsWith(`${BASKET_COOKIE}=`)).toBe(true);
    expect(cookie).not.toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain(`Max-Age=${30 * 24 * 60 * 60}`);
    expect(decodeBasket(basketCookieValue(cookie))).toEqual([valid]);
  });

  test("an empty basket clears the cookie", () => {
    expect(basketCookie([])).toBe(clearBasketCookie());
  });

  test("over 4000 bytes is BASKET_FULL", () => {
    const long = Array.from({ length: 10 }, (_, i) => ({ ...valid, lineId: `l${i}`, cakeMessage: "é".repeat(60) })) as BasketLine[];
    expect(() => basketCookie(long)).toThrow(expect.objectContaining({ code: "BASKET_FULL" }));
  });

  test("decoding drops invalid and duplicate lines and keeps at most 10", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...valid, lineId: `l${i}` }));
    const raw = encodeURIComponent(JSON.stringify([{ ...valid, quantity: 0 }, valid, valid, ...many]));
    const lines = decodeBasket(raw);
    expect(lines).toHaveLength(BASKET_MAX_LINES);
    expect(lines[0]!.lineId).toBe("abc");
    expect(decodeBasket("%E0%A4%A")).toEqual([]);
    expect(decodeBasket(undefined)).toEqual([]);
  });

  test("reads the basket among other cookies", () => {
    expect(basketCookieValue(`apb_locale=fr; ${BASKET_COOKIE}=abc; x=1`)).toBe("abc");
    expect(basketCookieValue("")).toBeUndefined();
  });

  test("line ids are 12 base64url characters", () => {
    expect(newLineId()).toMatch(/^[A-Za-z0-9_-]{12}$/);
  });
});
