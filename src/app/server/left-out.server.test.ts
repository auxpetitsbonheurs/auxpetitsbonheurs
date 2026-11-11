// Left-out lines named on the confirmation page (UX audit H1, checkout spec AC41): a
// short-lived cookie scoped to that one confirmation path, holding product ids only.
import { describe, expect, test } from "vitest";
import { LEFT_OUT_COOKIE, leftOutCookie, readLeftOut } from "./left-out.server";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const PATH = "/fr/order/abc/confirmed";

const request = (cookie?: string) => new Request(`http://localhost${PATH}`, cookie ? { headers: { cookie } } : {});

describe("left-out cookie", () => {
  test("holds the product ids only, for that confirmation path, for 15 minutes, out of reach of scripts", () => {
    const cookie = leftOutCookie([A, B], PATH);

    expect(cookie).toBe(`${LEFT_OUT_COOKIE}=${A}.${B}; Max-Age=900; Path=${PATH}; HttpOnly; SameSite=Lax; Secure`);
  });

  test("reads back the ids it wrote", () => {
    const cookie = leftOutCookie([A, B], PATH);
    expect(readLeftOut(request(cookie.slice(0, cookie.indexOf(";"))))).toEqual([A, B]);
  });

  test("no cookie, junk or non-uuid values give nothing; duplicates and more than 10 ids are dropped", () => {
    expect(readLeftOut(request())).toEqual([]);
    expect(readLeftOut(request(`${LEFT_OUT_COOKIE}=<script>.${A}`))).toEqual([A]);
    expect(readLeftOut(request(`${LEFT_OUT_COOKIE}=${A}.${A}`))).toEqual([A]);
    const many = Array.from({ length: 12 }, (_, i) => `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111`);
    expect(readLeftOut(request(`${LEFT_OUT_COOKIE}=${many.join(".")}`))).toHaveLength(10);
  });
});
