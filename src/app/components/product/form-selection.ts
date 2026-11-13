// What the product page form holds right now, as the order form's selection (S-276 AC7).
// Customer pages may hydrate several seconds after they are shown; until then the form is plain
// HTML and the browser keeps what the customer picked or typed. React's state starts from the
// server's defaults, so on mount the form is read back and the state adopts it (otherwise a
// size picked early looks unpicked to the Add button: "Choose a size").
import type { OptionPick } from "~/domain/basket";
import type { PricingGroup } from "~/domain/pricing";

export interface FormSelection {
  options: OptionPick[];
  cakeMessage: string;
  quantity: number;
}

function wholeNumber(value: FormDataEntryValue | null, fallback: number): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  return Number.isInteger(n) ? n : fallback;
}

function readGroup(form: FormData, group: PricingGroup): OptionPick | undefined {
  const chosen = form.getAll(`option.${group.id}`).filter((v): v is string => typeof v === "string" && v !== "");
  const text = form.get(`optionText.${group.id}`);
  if (group.kind === "text") return typeof text === "string" ? { groupId: group.id, choiceIds: [], text } : undefined;
  if (group.kind === "quantity") {
    const unit = group.choices.length === 1 ? [group.choices[0]!.id] : chosen.slice(0, 1);
    return { groupId: group.id, choiceIds: unit, quantity: wholeNumber(form.get(`optionQty.${group.id}`), 0) };
  }
  return chosen.length > 0 ? { groupId: group.id, choiceIds: chosen } : undefined;
}

/** The form's fields (the names the server also reads, see `addToBasketFields`) as a selection. */
export function readFormSelection(form: FormData, groups: readonly PricingGroup[]): FormSelection {
  const message = form.get("cakeMessage");
  return {
    options: groups.flatMap((group) => readGroup(form, group) ?? []),
    cakeMessage: typeof message === "string" ? message : "",
    quantity: wholeNumber(form.get("quantity"), 1),
  };
}
