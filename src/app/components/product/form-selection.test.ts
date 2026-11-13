// S-276 AC7: the product form is plain HTML until hydration (it can start late). What the customer
// picked or typed in that time is read back from the form, so React's state starts from it.
import { describe, expect, test } from "vitest";
import type { PricingGroup } from "~/domain/pricing";
import { readFormSelection } from "./form-selection";

const group = (id: string, kind: string, choiceIds: string[] = []): PricingGroup => ({
  id,
  name: { en: id, fr: null },
  kind,
  required: true,
  textMaxLength: null,
  quantityMin: null,
  quantityMax: null,
  choices: choiceIds.map((c) => ({ id: c, name: { en: c, fr: null }, priceDeltaRs: 0 })),
});

function form(fields: Array<[string, string]>) {
  const data = new FormData();
  for (const [key, value] of fields) data.append(key, value);
  return data;
}

describe("readFormSelection", () => {
  test("a size picked before hydration, the message and the quantity", () => {
    const groups = [group("g1", "single", ["a", "b"])];
    const read = readFormSelection(form([["option.g1", "b"], ["cakeMessage", "Happy birthday"], ["quantity", "3"]]), groups);
    expect(read).toEqual({ options: [{ groupId: "g1", choiceIds: ["b"] }], cakeMessage: "Happy birthday", quantity: 3 });
  });

  test("nothing picked: no pick for the group, an empty message, the posted quantity", () => {
    expect(readFormSelection(form([["cakeMessage", ""], ["quantity", "1"]]), [group("g1", "single", ["a"])])).toEqual({ options: [], cakeMessage: "", quantity: 1 });
  });

  test("pick-several keeps every ticked choice; a text group keeps its text", () => {
    const groups = [group("m", "multiple", ["x", "y", "z"]), group("t", "text")];
    const read = readFormSelection(form([["option.m", "x"], ["option.m", "z"], ["optionText.t", "Rosie"], ["quantity", "1"]]), groups);
    expect(read.options).toEqual([
      { groupId: "m", choiceIds: ["x", "z"] },
      { groupId: "t", choiceIds: [], text: "Rosie" },
    ]);
  });

  test("a quantity group with one unit takes that unit; with several it takes the picked one", () => {
    const groups = [group("q1", "quantity", ["unit"]), group("q2", "quantity", ["s", "l"])];
    const read = readFormSelection(form([["optionQty.q1", "4"], ["option.q2", "l"], ["optionQty.q2", "2"], ["quantity", "1"]]), groups);
    expect(read.options).toEqual([
      { groupId: "q1", choiceIds: ["unit"], quantity: 4 },
      { groupId: "q2", choiceIds: ["l"], quantity: 2 },
    ]);
  });

  test("a quantity that is not a whole number falls back to 1", () => {
    expect(readFormSelection(form([["quantity", "abc"]]), []).quantity).toBe(1);
  });
});
