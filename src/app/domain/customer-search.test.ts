// Customer search input (S-175 AC1, AC4).
import { describe, expect, test } from "vitest";
import { CUSTOMER_SEARCH_MAX, escapeLike, parseCustomerSearch } from "./customer-search";

describe("parseCustomerSearch", () => {
  test("AC1: a phone-looking query also searches by digits, separators ignored", () => {
    expect(parseCustomerSearch("5712 3456")).toEqual({ ok: true, text: "5712 3456", digits: "57123456" });
    expect(parseCustomerSearch("+230 5712-3456")).toMatchObject({ digits: "23057123456" });
  });

  test("names and emails search as text only; fewer than 3 digits is not a phone search", () => {
    expect(parseCustomerSearch("  Anna ")).toEqual({ ok: true, text: "Anna", digits: null });
    expect(parseCustomerSearch("anna@ex")).toMatchObject({ digits: null });
    expect(parseCustomerSearch("57")).toMatchObject({ digits: null });
  });

  test("empty is no search", () => {
    expect(parseCustomerSearch("")).toEqual({ ok: true, text: "", digits: null });
    expect(parseCustomerSearch(null)).toEqual({ ok: true, text: "", digits: null });
  });

  test("AC4: longer than 80 characters is VALIDATION_FAILED", () => {
    expect(parseCustomerSearch("a".repeat(CUSTOMER_SEARCH_MAX))).toMatchObject({ ok: true });
    expect(parseCustomerSearch("a".repeat(CUSTOMER_SEARCH_MAX + 1))).toEqual({ ok: false, code: "VALIDATION_FAILED" });
  });
});

describe("escapeLike (S-175 AC4)", () => {
  test("% _ and the escape character match literally", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
    expect(escapeLike("O'Brien")).toBe("O'Brien");
  });
});
