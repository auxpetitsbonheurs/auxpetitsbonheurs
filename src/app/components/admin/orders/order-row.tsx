import { Bike, ChevronRight, Store } from "lucide-react";
import { PaidTag } from "~/components/admin/order/header";
import { StatusBadge } from "~/components/order/status-badge";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { formatRupees } from "~/lib/locale";
import type { OrderRowView } from "./types";

/**
 * One order in a list tab (S-111 AC3, AC8): the whole card is one link (≥ 44 px) named in full
 * ("APB-0042, Marie, Fri 13 Dec, Approved, unpaid"); the status badge and Paid tag carry words, so
 * nothing relies on colour. quote_sent reads "Waiting for customer" (owner Q13).
 */
export function OrderRow({ order }: { order: OrderRowView }) {
  const { t, locale } = useI18n();
  const status = t(`admin.status.${order.status}`);
  const name = t("admin.orders.rowLabel", {
    number: order.number,
    name: order.contactName,
    date: order.dateLabel,
    status,
    paid: order.paid ? t("admin.orders.paidWord") : t("admin.orders.unpaidWord"),
  });
  const windowText = t("checkout.windowLabel", { label: localized(order.window.label, locale), start: order.window.start, end: order.window.end });
  const Mode = order.fulfilment === "delivery" ? Bike : Store;
  return (
    <li>
      <a href={`/admin/orders/${order.id}`} aria-label={name} className="flex min-h-11 items-start gap-2 rounded-card border border-border bg-card p-2 hover:bg-accent min-[20rem]:gap-3 min-[20rem]:p-4">
        <span className="grid min-w-0 flex-1 gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold">{order.number}</span>
            <StatusBadge status={order.status} audience="admin" />
            <PaidTag paid={order.paid} />
          </span>
          <span className="font-semibold wrap-anywhere">{order.contactName}</span>
          <span className="flex flex-wrap items-center gap-x-2">
            <span>{order.dateLabel}</span>
            <span>{windowText}</span>
            <span className="inline-flex items-center gap-1">
              <Mode aria-hidden="true" className="size-4" />
              {order.fulfilment === "delivery" ? t("admin.order.delivery") : t("admin.order.pickup")}
            </span>
          </span>
          {order.itemsPreview.length > 0 && <span className="text-sm wrap-anywhere">{order.itemsPreview.join(", ")}</span>}
          <span className="flex flex-wrap items-center gap-x-2">
            <span className="font-semibold whitespace-nowrap tabular-nums">{formatRupees(order.totalRs)}</span>
            <span className="text-sm">{t(`admin.orders.sourceName.${order.source}`)}</span>
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="mt-1 hidden size-5 shrink-0 min-[20rem]:block" />
      </a>
    </li>
  );
}
