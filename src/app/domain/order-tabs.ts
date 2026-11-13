// Tabs of the admin Orders screen (FR-049, contracts.md `admin/orders`; Payment tab from the
// juice-payment spec): each status belongs to exactly one tab. A status this table does not know
// (one a parallel epic adds before this table learns it) is listed under Upcoming, so an order
// never disappears from the screen.
import type { OrderStatus } from "./status";

export const ORDER_TABS = ["review", "payment", "upcoming", "completed", "closed"] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

/** Tabs with the searchable, paged list; Payment has its own worklists (S-279). */
export const LIST_TABS = ["review", "upcoming", "completed", "closed"] as const satisfies readonly OrderTab[];
export type ListTab = (typeof LIST_TABS)[number];

export const TAB_STATUSES: Record<OrderTab, readonly OrderStatus[]> = {
  review: ["pending_approval", "quote_needed"],
  payment: ["awaiting_payment"],
  upcoming: ["quote_sent", "approved", "in_preparation", "ready_for_pickup", "out_for_delivery"],
  completed: ["completed"],
  closed: ["cancelled", "declined", "closed"],
};

/** The tab an order in `status` is listed under. */
export function tabOf(status: OrderStatus): OrderTab {
  return ORDER_TABS.find((tab) => TAB_STATUSES[tab].includes(status)) ?? "upcoming";
}

export function isOrderTab(value: unknown): value is OrderTab {
  return typeof value === "string" && (ORDER_TABS as readonly string[]).includes(value);
}

export function isListTab(value: unknown): value is ListTab {
  return typeof value === "string" && (LIST_TABS as readonly string[]).includes(value);
}
