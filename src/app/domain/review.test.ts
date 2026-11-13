// S-261 AC2, AC4, AC5, AC6 (and the helpers S-262, S-265, S-266 rely on).
import { describe, expect, test } from "vitest";
import { adminMoves, averageRating, displayName, excerpt, nextStatus, ownReviewState, parseRating, reviewProblems } from "./review";

describe("rating and comment rules (AC2)", () => {
  test.each([0, 6, 3.5, "3.5", "", "five", null])("rating %j is refused", (rating) => {
    expect(parseRating(rating)).toBeNull();
  });

  test.each([1, 5, "4", " 3 "])("rating %j is accepted", (rating) => {
    expect(parseRating(rating)).toBe(Number(String(rating).trim()));
  });

  test("an empty or whitespace comment and 1001 characters are refused; 1000 (emoji counted once) pass", () => {
    expect(reviewProblems({ rating: 5, comment: "   " })).toEqual({ comment: "commentMissing" });
    expect(reviewProblems({ rating: 5, comment: "a".repeat(1001) })).toEqual({ comment: "commentTooLong" });
    expect(reviewProblems({ rating: 5, comment: "🍰".repeat(1000) })).toEqual({});
    expect(reviewProblems({ rating: 0, comment: "ok" })).toEqual({ rating: "rating" });
  });
});

describe("average (AC4)", () => {
  test("5, 4 and 4 give 4.3; half rounds up; none gives null", () => {
    expect(averageRating(13, 3)).toBe(4.3);
    expect(averageRating(9, 2)).toBe(4.5);
    expect(averageRating(29, 6)).toBe(4.8);
    expect(averageRating(0, 0)).toBeNull();
  });
});

describe("display name (AC5)", () => {
  test.each([
    ["Anna Kowalski", "Anna K."],
    ["Anna", "Anna"],
    ["  Marie   Claire Dupont ", "Marie C."],
    ["Élodie émile", "Élodie É."],
  ])("%j -> %j", (name, shown) => {
    expect(displayName(name)).toBe(shown);
  });

  test("an empty name has no display name", () => {
    expect(displayName("   ")).toBeNull();
  });
});

describe("status moves (AC6)", () => {
  test("the allowed moves", () => {
    expect(nextStatus("new", "submit", "customer")).toBe("pending");
    expect(nextStatus("pending", "approve", "admin")).toBe("approved");
    expect(nextStatus("pending", "reject", "admin")).toBe("rejected");
    expect(nextStatus("approved", "hide", "admin")).toBe("hidden");
    expect(nextStatus("hidden", "show", "admin")).toBe("approved");
    expect(nextStatus("approved", "submit", "customer")).toBe("pending");
    expect(nextStatus("rejected", "submit", "customer")).toBe("pending");
    expect(nextStatus("hidden", "submit", "customer")).toBe("pending");
  });

  test("anything else is refused", () => {
    expect(nextStatus("approved", "approve", "admin")).toBeNull();
    expect(nextStatus("rejected", "approve", "admin")).toBeNull();
    expect(nextStatus("pending", "hide", "admin")).toBeNull();
    expect(nextStatus("pending", "approve", "customer")).toBeNull();
    expect(nextStatus("pending", "submit", "admin")).toBeNull();
  });

  test("what the admin screen offers per status", () => {
    expect(adminMoves("pending")).toEqual(["approve", "reject"]);
    expect(adminMoves("approved")).toEqual(["hide"]);
    expect(adminMoves("hidden")).toEqual(["show"]);
    expect(adminMoves("rejected")).toEqual([]);
  });
});

describe("what the customer sees (S-262 AC5, S-265 AC4)", () => {
  test("hidden reads exactly like rejected", () => {
    expect(ownReviewState("pending")).toBe("waiting");
    expect(ownReviewState("approved")).toBe("published");
    expect(ownReviewState("rejected")).toBe("notPublished");
    expect(ownReviewState("hidden")).toBe("notPublished");
  });
});

describe("excerpt (S-266 AC3)", () => {
  test("up to 160 characters stays whole; longer is cut on a word with an ellipsis", () => {
    expect(excerpt("short")).toEqual({ text: "short", cut: false });
    const long = `${"word ".repeat(40)}end`;
    const cut = excerpt(long);
    expect(cut.cut).toBe(true);
    expect(cut.text.endsWith("word…")).toBe(true);
    expect([...cut.text].length).toBeLessThanOrEqual(161);
  });
});
