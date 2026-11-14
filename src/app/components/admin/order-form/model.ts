// The admin order form's state (S-122; shared with the manual order, E-07 FR-055): lines,
// delivery or pickup, contact, and the payload the server takes (`EditLine[]` etc., contracts
// `admin/order-edit` and `admin/order-new`). The live total uses the same pricing as the server
// (`priceBasketFromMenu`), so what the admin sees is what gets stored. Pure, client-safe.
import type { OptionPick } from "~/domain/basket";
import type { Menu } from "~/domain/menu";
import { priceBasketFromMenu } from "~/domain/menu-pricing";
import { editTotals } from "~/domain/order-edit";
import type { LocalizedName } from "~/domain/pricing-core";

export type FormLine =
  | { key: string; kind: "kept"; itemId: string; name: LocalizedName; unitRs: number; quantity: number; details: string[] }
  | { key: string; kind: "catalogue"; productId: string; name: LocalizedName; options: OptionPick[]; cakeMessage?: string; quantity: number; details: string[] }
  | { key: string; kind: "free"; name: string; priceRs: number; quantity: number };

export interface FormFulfilment {
  fulfilment: "delivery" | "pickup";
  date: string;
  windowId: string;
  address: string;
  landmark: string;
  deliveryFeeRs: number;
}

export interface FormContact {
  name: string;
  phone: string;
  email: string;
  note: string;
}

export interface OrderFormState {
  lines: FormLine[];
  fulfilment: FormFulfilment;
  contact: FormContact;
  /** Edit only: a total set by hand, or null. */
  overrideTotalRs: number | null;
}

export const QUANTITY_MAX = 50;

/** Each line's total as the server will price it (catalogue lines from the menu, live promotion included). */
export function lineTotals(lines: readonly FormLine[], menu: Menu, nowMs: number): number[] {
  const catalogue = lines.filter((line) => line.kind === "catalogue");
  const priced = priceBasketFromMenu(
    catalogue.map((line) => ({ lineId: line.key, productId: line.productId, options: line.options, cakeMessage: line.cakeMessage, quantity: line.quantity })),
    menu,
    menu.today,
    nowMs,
  );
  const byKey = new Map(priced.map((line) => [line.lineId, line.unitPriceRs * line.quantity]));
  return lines.map((line) => (line.kind === "kept" ? line.unitRs * line.quantity : line.kind === "free" ? line.priceRs * line.quantity : (byKey.get(line.key) ?? 0)));
}

export function liveTotals(state: OrderFormState, menu: Menu, nowMs: number) {
  return editTotals(lineTotals(state.lines, menu, nowMs), state.fulfilment.fulfilment, state.fulfilment.deliveryFeeRs, state.overrideTotalRs);
}

/** The lines as the contract's `EditLine[]`. */
export function linesPayload(lines: readonly FormLine[]) {
  return lines.map((line) =>
    line.kind === "kept"
      ? { itemId: line.itemId, quantity: line.quantity }
      : line.kind === "free"
        ? { freeText: { name: line.name, priceRs: line.priceRs, quantity: line.quantity } }
        : { lineId: line.key.slice(0, 16), productId: line.productId, options: line.options, ...(line.cakeMessage ? { cakeMessage: line.cakeMessage } : {}), quantity: line.quantity },
  );
}

/** The fields shared by edit and create (`OrderFormInput`). */
export function formPayload(state: OrderFormState) {
  const { fulfilment, contact } = state;
  return {
    lines: linesPayload(state.lines),
    date: fulfilment.date,
    windowId: fulfilment.windowId,
    fulfilment: fulfilment.fulfilment,
    ...(fulfilment.fulfilment === "delivery" ? { address: fulfilment.address, landmark: fulfilment.landmark } : {}),
    deliveryFeeRs: fulfilment.fulfilment === "pickup" ? 0 : fulfilment.deliveryFeeRs,
    contact: { name: contact.name, phone: contact.phone, email: contact.email, note: contact.note },
  };
}
