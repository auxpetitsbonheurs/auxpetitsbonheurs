// Browser basket store (ADR-0004): no network, the same cookie the server reads, caps kept.
import { describe, expect, test, vi } from "vitest";
import { BASKET_MAX_LINES } from "~/domain/basket";
import { BASKET_COOKIE, basketCookieValue, decodeBasket } from "~/domain/basket-cookie";
import { readBasket } from "~/server/basket.server";
import { type CookieJar, createBasketStore } from "./basket-store";

const CAKE = "11111111-1111-4111-8111-111111111111";
const TART = "22222222-2222-4222-8222-222222222222";

/** A document.cookie stand-in: `name=value; attrs` writes, `a=1; b=2` reads, Max-Age=0 deletes. */
function fakeJar(options: { httpOnlyBasket?: string } = {}): CookieJar & { writes: string[] } {
  const values = new Map<string, string>();
  const writes: string[] = [];
  return {
    writes,
    read: () => [...values].map(([k, v]) => `${k}=${v}`).join("; "),
    write(cookie) {
      writes.push(cookie);
      const [pair] = cookie.split(";");
      const at = pair!.indexOf("=");
      const name = pair!.slice(0, at);
      // A script cannot overwrite an HttpOnly cookie (it also cannot read it).
      if (options.httpOnlyBasket !== undefined && name === BASKET_COOKIE) return;
      if (/Max-Age=0/.test(cookie)) values.delete(name);
      else values.set(name, pair!.slice(at + 1));
    },
  };
}

let n = 0;
const ids = () => `id${(n += 1)}`;

describe("basket store", () => {
  test("add writes the server's cookie format and notifies subscribers", () => {
    const jar = fakeJar();
    const store = createBasketStore(jar, ids);
    const listener = vi.fn();
    store.subscribe(listener);

    store.add({ productId: CAKE, options: [], quantity: 1 });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(jar.writes[0]).toMatch(/^apb_basket=.*; Max-Age=2592000; Path=\/; SameSite=Lax; Secure$/);
    expect(jar.writes[0]).not.toContain("HttpOnly");
    const request = new Request("http://localhost/", { headers: { cookie: jar.read() } });
    expect(readBasket(request)).toEqual(store.lines());
  });

  test("the same product twice is one line of 2; quantity and remove update the cookie", () => {
    const jar = fakeJar();
    const store = createBasketStore(jar, ids);
    store.add({ productId: CAKE, options: [], quantity: 1 });
    store.add({ productId: CAKE, options: [], quantity: 1 });
    store.add({ productId: TART, options: [], quantity: 1 });
    expect(store.lines().map((l) => l.quantity)).toEqual([2, 1]);

    const [cake, tart] = store.lines();
    store.setQuantity(cake!.lineId, 5);
    store.remove(tart!.lineId);
    expect(decodeBasket(basketCookieValue(jar.read()))).toEqual([{ ...cake, quantity: 5 }]);

    store.remove(cake!.lineId);
    expect(store.lines()).toEqual([]);
    expect(jar.read()).not.toContain(BASKET_COOKIE);
  });

  test("an 11th line is BASKET_FULL and nothing is written", () => {
    const jar = fakeJar();
    const store = createBasketStore(jar, ids);
    for (let i = 0; i < BASKET_MAX_LINES; i += 1) store.add({ productId: CAKE, options: [], cakeMessage: `m${i}`, quantity: 1 });
    const before = jar.read();

    expect(() => store.add({ productId: TART, options: [], quantity: 1 })).toThrow(expect.objectContaining({ code: "BASKET_FULL" }));
    expect(jar.read()).toBe(before);
  });

  test("quantities outside 1..50 are refused", () => {
    const store = createBasketStore(fakeJar(), ids);
    const [line] = store.add({ productId: CAKE, options: [], quantity: 1 });
    expect(() => store.setQuantity(line!.lineId, 51)).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });

  test("the snapshot is stable until the cookie changes; refresh notices another tab", () => {
    const jar = fakeJar();
    const store = createBasketStore(jar, ids);
    expect(store.lines()).toBe(store.lines());
    const other = createBasketStore(jar, ids);
    const listener = vi.fn();
    store.subscribe(listener);

    other.add({ productId: CAKE, options: [], quantity: 1 });
    store.refresh();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.lines()).toHaveLength(1);
  });

  test("an old HttpOnly cookie the script cannot overwrite is reported, so the page falls back to the server", () => {
    const store = createBasketStore(fakeJar({ httpOnlyBasket: "x" }), ids);
    expect(() => store.add({ productId: CAKE, options: [], quantity: 1 })).toThrow("basket cookie not writable");
  });
});
