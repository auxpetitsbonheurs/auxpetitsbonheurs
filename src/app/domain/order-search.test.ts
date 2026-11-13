// S-112: how an admin's search text is read (AC1, AC2, AC6, AC7).
import { describe, expect, test } from "vitest";
import { ACCENTED, ACCENT_FOLDED, ORDER_QUERY_MAX, foldText, likePattern, parseOrderQuery } from "./order-search";

describe("parseOrderQuery", () => {
  test.each([
    ["5712 3456", "57123456"],
    ["+230 5712 3456", "57123456"],
    ["230-5712-3456", "57123456"],
  ])("a phone typed as %s searches the digits %s (230 prefix ignored)", (q, digits) => {
    expect(parseOrderQuery(q)).toMatchObject({ digits });
  });

  test.each([
    ["42", 42],
    ["APB-0042", 42],
    ["apb-42", 42],
    ["#42", 42],
  ])("%s also searches order number %i", (q, number) => {
    expect(parseOrderQuery(q)?.number).toBe(number);
  });

  test("a name is folded: case and accents ignored", () => {
    expect(parseOrderQuery("  Hélène  ")?.text).toBe("helene");
    expect(foldText("ÉLODIE Ça")).toBe("elodie ca");
  });

  test("a name has no number and no phone digits", () => {
    expect(parseOrderQuery("Marie")).toEqual({ text: "marie", digits: null, number: null });
  });

  test("an empty or blank query is null (tab default, AC6)", () => {
    expect(parseOrderQuery("")).toBeNull();
    expect(parseOrderQuery("   ")).toBeNull();
    expect(parseOrderQuery(null)).toBeNull();
  });

  test("the SQL accent map folds like foldText, letter for letter", () => {
    expect([...ACCENTED]).toHaveLength([...ACCENT_FOLDED].length);
    [...ACCENTED].forEach((letter, i) => {
      if (letter !== "œ" && letter !== "æ") expect(foldText(letter)).toBe([...ACCENT_FOLDED][i]!.toLowerCase());
    });
  });

  test("the limit is 80 characters", () => {
    expect(ORDER_QUERY_MAX).toBe(80);
  });
});

describe("likePattern (AC7)", () => {
  test("%, _ and \\ are literal; the text is wrapped for a contains match", () => {
    expect(likePattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
    expect(likePattern("o'brien")).toBe("%o'brien%");
  });
});
