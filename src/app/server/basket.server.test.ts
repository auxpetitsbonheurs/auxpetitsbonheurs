import { describe, expect, test } from "vitest";
import { BASKET_MAX_LINES, LINE_MAX_QUANTITY, type BasketLine, addLine } from "~/domain/basket";
import { DomainError } from "~/domain/errors";
import { BASKET_COOKIE, basketCookie, clearBasketCookie, readBasket, readBasketCount } from "./basket.server";

const PRODUCT_A = "11111111-1111-4111-8111-111111111111";
const PRODUCT_B = "22222222-2222-4222-8222-222222222222";

const request = (value?: string) =>
  new Request("http://localhost/", value === undefined ? undefined : { headers: { cookie: `${BASKET_COOKIE}=${value}` } });
const encoded = (value: unknown) => encodeURIComponent(JSON.stringify(value));
const line = (lineId: string, productId: string, quantity = 1): BasketLine => ({ lineId, productId, options: [], quantity });

/** The cookie value a Set-Cookie header carries, as a request would send it back. */
function valueOf(setCookie: string): string {
  return setCookie.slice(`${BASKET_COOKIE}=`.length, setCookie.indexOf(";"));
}

let counter = 0;
const nextId = () => `line${(counter += 1)}`;

describe("basket cookie (S-011 AC4)", () => {
  test("is HttpOnly, SameSite=Lax and holds product id and quantity but no prices", () => {
    const header = basketCookie([line("abc", PRODUCT_A, 1)]);

    expect(header.startsWith(`${BASKET_COOKIE}=`)).toBe(true);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
    const stored = JSON.parse(decodeURIComponent(valueOf(header))) as Record<string, unknown>[];
    expect(stored).toEqual([{ lineId: "abc", productId: PRODUCT_A, options: [], quantity: 1 }]);
    expect(JSON.stringify(stored)).not.toMatch(/price|Rs/i);
  });

  test("round-trips through a request, and the header count is the sum of quantities", () => {
    const header = basketCookie([line("a", PRODUCT_A, 2), line("b", PRODUCT_B, 1)]);
    const sent = request(valueOf(header));

    expect(readBasket(sent).map((l) => l.lineId)).toEqual(["a", "b"]);
    expect(readBasketCount(sent)).toBe(3);
  });

  test("an empty basket clears the cookie", () => {
    expect(basketCookie([])).toBe(clearBasketCookie());
    expect(clearBasketCookie()).toContain("Max-Age=0");
  });
});

describe("adding to the basket (S-011 AC5)", () => {
  test("the same product added twice becomes one line with quantity 2", () => {
    const once = addLine([], { productId: PRODUCT_A, options: [], quantity: 1 }, nextId);
    const twice = addLine(once, { productId: PRODUCT_A, options: [], quantity: 1 }, nextId);

    expect(twice).toHaveLength(1);
    expect(twice[0]).toMatchObject({ productId: PRODUCT_A, quantity: 2, lineId: once[0]!.lineId });
  });

  test("merging caps the quantity at 50", () => {
    const lines = [line("a", PRODUCT_A, 49)];

    expect(addLine(lines, { productId: PRODUCT_A, options: [], quantity: 5 }, nextId)[0]!.quantity).toBe(LINE_MAX_QUANTITY);
  });

  test("a different configuration (cake message) is a new line", () => {
    const lines = [line("a", PRODUCT_A, 1)];

    expect(addLine(lines, { productId: PRODUCT_A, options: [], cakeMessage: "Happy birthday", quantity: 1 }, nextId)).toHaveLength(2);
  });

  test("an 11th distinct line is refused with BASKET_FULL and the basket is unchanged", () => {
    const full = Array.from({ length: BASKET_MAX_LINES }, (_, i) =>
      line(`l${i}`, `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`),
    );
    const before = JSON.stringify(full);

    expect(() => addLine(full, { productId: PRODUCT_A, options: [], quantity: 1 }, nextId)).toThrow(
      expect.objectContaining({ code: "BASKET_FULL" }),
    );
    expect(JSON.stringify(full)).toBe(before);
  });

  test("adding to a full basket still merges into an existing line", () => {
    const full = Array.from({ length: BASKET_MAX_LINES }, (_, i) =>
      line(`l${i}`, `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`),
    );

    const merged = addLine(full, { productId: full[3]!.productId, options: [], quantity: 1 }, nextId);
    expect(merged[3]!.quantity).toBe(2);
  });
});

describe("tampered or unparseable cookie (S-011 AC6)", () => {
  test("no cookie is an empty basket", () => {
    expect(readBasket(request())).toEqual([]);
    expect(readBasketCount(request())).toBe(0);
  });

  test("drops invalid lines and keeps valid ones", () => {
    const value = encoded([
      line("ok1", PRODUCT_A, 2),
      { lineId: "bad-qty", productId: PRODUCT_B, options: [], quantity: 0 },
      { lineId: "too-many", productId: PRODUCT_B, options: [], quantity: 51 },
      { lineId: "not-uuid", productId: "sample", options: [], quantity: 1 },
      { lineId: "priced", productId: PRODUCT_B, options: [], quantity: 1, priceRs: 1 },
      "x",
      { quantity: 5 },
      line("ok2", PRODUCT_B, 1),
    ]);

    const lines = readBasket(request(value));
    expect(lines.map((l) => l.lineId)).toEqual(["ok1", "priced", "ok2"]);
    expect(lines[1]).not.toHaveProperty("priceRs");
    expect(readBasketCount(request(value))).toBe(4);
  });

  test("drops a repeated line id", () => {
    const value = encoded([line("same", PRODUCT_A, 1), line("same", PRODUCT_B, 3)]);

    expect(readBasket(request(value))).toEqual([line("same", PRODUCT_A, 1)]);
  });

  test("an unparseable cookie is an empty basket", () => {
    expect(readBasket(request("%7Bnot-json"))).toEqual([]);
    expect(readBasket(request("%E0%A4%A"))).toEqual([]);
    expect(readBasket(request(encoded({ productId: PRODUCT_A, quantity: 2 })))).toEqual([]);
  });

  test("reads at most 10 lines", () => {
    const many = Array.from({ length: 12 }, (_, i) => line(`p${i}`, PRODUCT_A, 1));

    expect(readBasketCount(request(encoded(many)))).toBe(BASKET_MAX_LINES);
  });

  test("a full basket of 10 lines at quantity 50 stays under 4 kB", () => {
    const full = Array.from({ length: BASKET_MAX_LINES }, (_, i) =>
      line(`line-${String(i).padStart(10, "0")}`, `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`, 50),
    );

    expect(basketCookie(full).length).toBeLessThan(4096);
  });

  test("a basket whose cookie would exceed 4 kB is refused with BASKET_FULL", () => {
    const heavy = Array.from({ length: BASKET_MAX_LINES }, (_, i) => ({
      ...line(`l${i}`, PRODUCT_A, 1),
      cakeMessage: "é".repeat(200),
    }));

    expect(() => basketCookie(heavy)).toThrow(DomainError);
    expect(() => basketCookie(heavy)).toThrow(expect.objectContaining({ code: "BASKET_FULL" }));
  });
});
