// Editing an order (FR-053, S-122, S-123): its totals, and what changed. Pure; the server
// prices the lines, then these decide the stored totals, the `edited` event's details and
// whether the customer gets "Your order was updated" (only when the date and/or the total
// changed, owner Q11).
import type { OrderItemOption } from "~/db/tables/json-types";
import type { LocalizedName, PricedOption } from "./pricing-core";

const stored = (name: LocalizedName) => (name.fr ? { en: name.en, fr: name.fr } : { en: name.en });

export interface EditTotals {
  itemsTotalRs: number;
  deliveryFeeRs: number;
  totalRs: number;
  totalOverridden: boolean;
}

/** Items + fee (no fee for pickup), unless the total is set by hand (S-122 AC3, AC4). */
export function editTotals(lineTotals: readonly number[], fulfilment: "delivery" | "pickup", deliveryFeeRs: number, overrideTotalRs: number | null): EditTotals {
  const itemsTotalRs = lineTotals.reduce((sum, total) => sum + total, 0);
  const fee = fulfilment === "pickup" ? 0 : deliveryFeeRs;
  return overrideTotalRs === null
    ? { itemsTotalRs, deliveryFeeRs: fee, totalRs: itemsTotalRs + fee, totalOverridden: false }
    : { itemsTotalRs, deliveryFeeRs: fee, totalRs: overrideTotalRs, totalOverridden: true };
}

/** A priced option as `order_item.options` stores it (S-092 shape). */
export function storedOption(option: PricedOption): OrderItemOption {
  return {
    groupId: option.groupId,
    group: stored(option.group),
    kind: option.kind as OrderItemOption["kind"],
    ...(option.choiceId ? { choiceId: option.choiceId, choice: stored(option.label) } : {}),
    priceDeltaRs: option.priceDeltaRs,
    ...(option.quantity === undefined ? {} : { quantity: option.quantity }),
    ...(option.text === undefined ? {} : { text: option.text }),
  };
}

export interface EditSnapshot {
  fulfilOn: string;
  windowId: string;
  fulfilment: "delivery" | "pickup";
  address: string | null;
  landmark: string | null;
  deliveryFeeRs: number;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  customerNote: string | null;
  totalRs: number;
  totalOverridden: boolean;
  /** "2 × Chocolate cake" per line, in order: enough to show the item change in words. */
  items: string[];
}

const FIELDS = ["fulfilOn", "windowId", "fulfilment", "address", "landmark", "deliveryFeeRs", "contactName", "contactPhone", "contactEmail", "customerNote", "totalOverridden"] as const;

export interface EditChange {
  /** Field diff for the `edited` event (S-123 AC7): `{ field: { from, to } }`. */
  diff: Record<string, { from: unknown; to: unknown }>;
  oldTotalRs: number;
  newTotalRs: number;
  dateChanged: boolean;
  totalChanged: boolean;
}

export function editChange(before: EditSnapshot, after: EditSnapshot): EditChange {
  const diff: EditChange["diff"] = {};
  for (const field of FIELDS) if (before[field] !== after[field]) diff[field] = { from: before[field], to: after[field] };
  if (before.items.join("\n") !== after.items.join("\n")) diff.items = { from: before.items, to: after.items };
  return {
    diff,
    oldTotalRs: before.totalRs,
    newTotalRs: after.totalRs,
    dateChanged: before.fulfilOn !== after.fulfilOn,
    // Setting or clearing an override counts when it moves the total (owner Q11 includes set/clear).
    totalChanged: before.totalRs !== after.totalRs,
  };
}

/** "Your order was updated" goes only when the date and/or the total changed, and only to an email (S-123 AC2-AC5). */
export function needsUpdatedEmail(change: EditChange, email: string | null): boolean {
  return Boolean(email) && (change.dateChanged || change.totalChanged);
}
