// Naming what is left out of an order (UX audit H1): the stale-submit note and the confirmation alert.
import { describe, expect, test } from "vitest";
import { leftOutNames, nameList } from "./left-out";

const line = (name: string, problem: "sold_out" | "hidden" | "out_of_season" | null) => ({ productId: name, name: { en: name, fr: `${name} (fr)` }, problem });

describe("leftOutNames", () => {
  test("names the sold-out, hidden and out-of-season lines of a refusal, in the page language, once each", () => {
    const lines = [line("Cake", null), line("Tart", "sold_out"), line("Pie", "hidden"), line("Plum", "out_of_season"), line("Tart", "sold_out")];

    expect(leftOutNames(lines, "en")).toEqual(["Tart", "Pie", "Plum"]);
    expect(leftOutNames(lines, "fr")).toEqual(["Tart (fr)", "Pie (fr)", "Plum (fr)"]);
  });

  test("a refusal whose lines carry no names (older shape) names nothing rather than failing", () => {
    expect(leftOutNames([{ productId: "x", problem: "sold_out" }], "en")).toEqual([]);
  });
});

describe("nameList", () => {
  test("joins names as people write them", () => {
    expect(nameList(["Tart"], "en")).toBe("Tart");
    expect(nameList(["Tart", "Pie", "Plum"], "en")).toBe("Tart, Pie, and Plum");
    expect(nameList(["Tarte", "Flan"], "fr")).toBe("Tarte et Flan");
  });
});
