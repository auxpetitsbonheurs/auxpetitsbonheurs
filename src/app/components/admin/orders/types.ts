import type { TimeWindow } from "~/db/schema";
import type { OrderStatus } from "~/domain/status";

/** A list row as the Orders loader sends it (`admin/orders` `data[]`). */
export interface OrderRowView {
  id: string;
  number: string;
  status: OrderStatus;
  source: "website" | "custom_request" | "manual";
  fulfilment: "delivery" | "pickup";
  fulfilOn: string;
  window: TimeWindow;
  contactName: string;
  totalRs: number;
  paid: boolean;
  version: number;
  dateLabel: string;
  itemsPreview: string[];
}

export const listLinkClass = "inline-flex min-h-11 items-center font-semibold link";
