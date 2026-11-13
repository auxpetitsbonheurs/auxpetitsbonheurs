// S-019 AC3 tooling: the load script's form reading and order building (offline).
import { describe, expect, test } from "vitest";
import { normalizePhone } from "~/domain/phone";
import { Contact } from "~/server/contracts/shared";
import { assertMeasurableTarget, basketLinePlan, cookiePair, inputValue, orderForm, tagged, tokenFromLocation } from "./cpu-load";

const basketHtml = `
  <input type="hidden" name="idempotencyKey" value="k-123"/>
  <input type="radio" id="window-delivery-morning" name="windowId.delivery" value="morning"/>
  <input class="x" type="radio" name="windowId.pickup" value="afternoon" id="w"/>
  <input type="radio" name="windowId.pickup" value="evening"/>
  <input type="hidden" name="displayedTotalRs.pickup" value="850"/>`;

describe("cpu load helpers", () => {
  test("reads hidden and radio values whatever the attribute order", () => {
    expect(inputValue(basketHtml, "idempotencyKey")).toBe("k-123");
    expect(inputValue(basketHtml, "windowId.pickup", "radio")).toBe("afternoon");
    expect(inputValue(basketHtml, "missing")).toBeUndefined();
  });

  test("builds a pickup order with its own key and email per submit", () => {
    const form = orderForm({ basketHtml, date: "2026-11-27", runId: "r1", index: 4 });

    expect(Object.fromEntries(form)).toEqual({
      intent: "placeOrder",
      idempotencyKey: "k-123",
      fulfilment: "pickup",
      date: "2026-11-27",
      "windowId.pickup": "afternoon",
      "displayedTotalRs.pickup": "850",
      "contact.name": "CPU test — ignore 5",
      "contact.phone": "50000000",
      "contact.email": "cpu-test+r1-5@example.com",
      "contact.note": "Automated CPU measurement (S-019), run r1. Not a real order.",
      acceptPolicies: "on",
    });
  });

  test("marks the order as test data with fake contact details that pass checkout validation", () => {
    const form = orderForm({ basketHtml, date: "2026-11-27", runId: "r1", index: 0 });
    const contact = Contact.safeParse({ name: form.get("contact.name"), phone: form.get("contact.phone"), email: form.get("contact.email") });

    expect(form.get("contact.name")).toMatch(/^CPU test — ignore/);
    expect(form.get("contact.email")).toMatch(/@example\.com$/);
    expect(contact.success).toBe(true);
    expect(normalizePhone(form.get("contact.phone")!)).toBe("+23050000000");
  });

  test("names the missing fields when the basket page is not orderable", () => {
    expect(() => orderForm({ basketHtml: "<p>empty</p>", date: "2026-11-27", runId: "r", index: 0 })).toThrow(/idempotencyKey.*windowId\.pickup/);
  });

  test("tags URLs, reads the basket cookie and the token from the redirect", () => {
    expect(tagged("https://s.workers.dev", "/basket", "warm")).toBe("https://s.workers.dev/basket?cpu=warm");
    expect(cookiePair(["apb_basket=abc; Path=/; HttpOnly", "other=1"], "apb_basket")).toBe("apb_basket=abc");
    expect(tokenFromLocation("/fr/order/Tok_-9/confirmed")).toBe("Tok_-9");
    expect(tokenFromLocation(null)).toBeUndefined();
  });

  test("refuses production: it places real orders", () => {
    expect(() => assertMeasurableTarget("https://auxpetitsbonheurs-staging.x.workers.dev")).not.toThrow();
    expect(() => assertMeasurableTarget("http://localhost:4173")).not.toThrow();
    expect(() => assertMeasurableTarget("https://auxpetitsbonheurs.x.workers.dev")).toThrow(/staging/);
  });
});

// S-097 AC1: a 10-line basket from the staging menu (distinct lines, every required option set).
describe("basketLinePlan (S-097)", () => {
  const group = (id: string, kind: string, required: boolean, choices: string[], extra: Record<string, unknown> = {}) => ({
    id, kind, required, quantityMin: null, quantityMax: null, textMaxLength: null, choices: choices.map((c) => ({ id: c })), ...extra,
  });
  const menu = [
    { id: "cake", type: "cake", status: "available", minQuantity: null, optionGroups: [group("size", "single", true, ["s", "m", "l"]), group("addons", "multiple", false, ["coulis"])] },
    { id: "cookies", type: "biscuit", status: "available", minQuantity: 6, optionGroups: [group("flavour", "single", true, ["a", "b", "c"])] },
    { id: "gone", type: "cake", status: "sold_out", minQuantity: null, optionGroups: [] },
    { id: "plain", type: "cake", status: "available", minQuantity: null, optionGroups: [group("note", "text", true, [], { textMaxLength: 20 }), group("n", "quantity", true, ["x"], { quantityMin: 2, quantityMax: 4 })] },
  ];
  const key = (fields: URLSearchParams) => [...fields.entries()].filter(([k]) => k !== "intent" && k !== "quantity").map(([k, v]) => `${k}=${v}`).sort().join("&");

  test("plans the asked number of distinct lines from available products only", () => {
    const plan = basketLinePlan(menu, 10);

    expect(plan).toHaveLength(10);
    expect(new Set(plan.map((line) => key(line.fields))).size).toBe(10);
    expect(plan.map((line) => line.fields.get("productId"))).not.toContain("gone");
    for (const line of plan) expect(line.fields.get("intent")).toBe("addToBasket");
  });

  test("every required group is filled; the product minimum quantity is respected", () => {
    const plan = basketLinePlan(menu, 10);
    const cookies = plan.filter((line) => line.fields.get("productId") === "cookies");
    const plain = plan.find((line) => line.fields.get("productId") === "plain")!;

    expect(cookies.length).toBeGreaterThan(0);
    for (const line of cookies) {
      expect(line.fields.get("quantity")).toBe("6");
      expect(line.fields.get("option.flavour")).toMatch(/^[abc]$/);
    }
    for (const line of plan.filter((l) => l.fields.get("productId") === "cake")) expect(line.fields.get("option.size")).toMatch(/^[sml]$/);
    expect(plain.fields.get("optionText.note")).toBeTruthy();
    expect(plain.fields.get("optionText.note")!.length).toBeLessThanOrEqual(20);
    expect(plain.fields.get("optionQty.n")).toBe("2");
    // A product with its own text option takes no separate cake message.
    expect(plain.fields.get("cakeMessage")).toBeNull();
  });

  test("one line is the old single-item basket shape; no orderable product is an error", () => {
    expect(basketLinePlan(menu, 1)).toHaveLength(1);
    expect(() => basketLinePlan([menu[2]!], 3)).toThrow(/orderable/);
  });
});
