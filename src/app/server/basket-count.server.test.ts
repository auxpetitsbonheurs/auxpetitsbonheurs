import { describe, expect, test } from "vitest";
import { BASKET_COOKIE, readBasketCount } from "./basket-count.server";

const request = (value?: string) =>
  new Request("http://localhost/", value === undefined ? undefined : { headers: { cookie: `${BASKET_COOKIE}=${value}` } });
const lines = (value: unknown) => encodeURIComponent(JSON.stringify(value));

describe("readBasketCount (S-007 header count)", () => {
  test("no cookie is an empty basket", () => {
    expect(readBasketCount(request())).toBe(0);
  });

  test("sums the quantities of the lines", () => {
    expect(readBasketCount(request(lines([{ productId: "a", quantity: 2 }, { productId: "b", quantity: 1 }])))).toBe(3);
  });

  test("drops invalid lines and keeps valid ones", () => {
    const value = lines([{ productId: "a", quantity: 2 }, { productId: "b", quantity: 0 }, { quantity: 5 }, "x", { productId: "c", quantity: 51 }]);
    expect(readBasketCount(request(value))).toBe(2);
  });

  test("an unparseable cookie is an empty basket", () => {
    expect(readBasketCount(request("%7Bnot-json"))).toBe(0);
    expect(readBasketCount(request(lines({ productId: "a", quantity: 2 })))).toBe(0);
  });

  test("reads at most 10 lines", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ productId: `p${i}`, quantity: 1 }));
    expect(readBasketCount(request(lines(many)))).toBe(10);
  });
});
