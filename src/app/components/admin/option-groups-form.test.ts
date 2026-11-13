import { describe, expect, test } from "vitest";
import { type StoredOptionGroup, optionAnchor, postedOptionGroups } from "./option-groups-form";

const stored: StoredOptionGroup[] = [
  {
    id: "g1",
    name: { en: "Size", fr: null },
    kind: "single",
    required: true,
    textMaxLength: null,
    quantityMin: null,
    quantityMax: null,
    choices: [
      { id: "c1", name: { en: "Small", fr: "Petit" }, priceDeltaRs: 0 },
      { id: "c2", name: { en: "Large", fr: "Grand" }, priceDeltaRs: -150 },
    ],
  },
  { id: "g2", name: { en: "Message", fr: "Message" }, kind: "text", required: false, textMaxLength: 40, quantityMin: null, quantityMax: null, choices: [] },
];

describe("option groups form model", () => {
  test("posts the stored groups unchanged while the editor loads (no group or choice lost)", () => {
    expect(JSON.parse(postedOptionGroups(stored))).toEqual([
      {
        id: "g1",
        name: { en: "Size", fr: "" },
        kind: "single",
        required: true,
        textMaxLength: null,
        quantityMin: null,
        quantityMax: null,
        choices: [
          { id: "c1", name: { en: "Small", fr: "Petit" }, priceDeltaRs: 0 },
          { id: "c2", name: { en: "Large", fr: "Grand" }, priceDeltaRs: -150 },
        ],
      },
      { id: "g2", name: { en: "Message", fr: "Message" }, kind: "text", required: false, textMaxLength: "40", quantityMin: null, quantityMax: null, choices: [] },
    ]);
    expect(postedOptionGroups([])).toBe("[]");
  });

  test("links error paths to the field ids in the editor", () => {
    expect(optionAnchor("optionGroups")).toBe("options");
    expect(optionAnchor("optionGroups.1.choices.0.priceDeltaRs")).toBe("group-1-choice-0-amount");
    expect(optionAnchor("optionGroups.0.name.fr")).toBe("group-0-name-fr");
    expect(optionAnchor("name.en")).toBeUndefined();
  });
});
