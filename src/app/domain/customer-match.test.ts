// Customer matching for manual orders (S-133 AC1, AC2, AC5; FR-057).
import { describe, expect, test } from "vitest";
import { chooseMatch, phoneKeys } from "./customer-match";

describe("phoneKeys (AC1)", () => {
  test.each(["+230 5712 3456", "5712 3456", "230-5712-3456", "57123456", "0023057123456"])("%s gives the stored forms of +230 5712 3456", (raw) => {
    expect(phoneKeys(raw)).toEqual(["23057123456", "57123456"]);
  });

  test("a foreign number matches itself only; nonsense matches nothing", () => {
    expect(phoneKeys("+33 6 12 34 56 78")).toEqual(["33612345678"]);
    expect(phoneKeys("call me")).toEqual([]);
  });
});

describe("chooseMatch (AC2, AC5)", () => {
  const anna = { id: "a", name: "Anna Rault" };
  const marc = { id: "m", name: "Marc" };

  test("email first, then phone; none is null", () => {
    expect(chooseMatch(anna, null)).toEqual({ customer: anna, conflict: false });
    expect(chooseMatch(null, marc)).toEqual({ customer: marc, conflict: false });
    expect(chooseMatch(null, null)).toEqual({ customer: null, conflict: false });
    expect(chooseMatch(anna, anna)).toEqual({ customer: anna, conflict: false });
  });

  test("email and phone on different customers: the email match wins with a conflict", () => {
    expect(chooseMatch(anna, marc)).toEqual({ customer: anna, conflict: true });
  });
});
