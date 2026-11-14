import { Bike, Store } from "lucide-react";
import { useEffect, useRef } from "react";
import { useFetcher, useRevalidator } from "react-router";
import { PaidTag } from "~/components/admin/order/header";
import { StatusBadge } from "~/components/order/status-badge";
import { SubmitButton } from "~/components/ui/submit-button";
import { showToast } from "~/components/ui/toaster";
import type { OrderStatus } from "~/domain/status";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import type { TodayLoaderData } from "~/routes/admin/home";
import { offerUndo } from "./undo-store";

type TodayRowView = TodayLoaderData["today"]["orders"][number];
type Answer = { ok: true; order: { status: OrderStatus; version: number } | null } | { ok: false; error: { code: string; message: string } };

/** Offers Undo after a forward tap; a refused tap says so and refreshes the row (S-121 AC1, AC4). */
function useTapResult(order: TodayRowView, fetcher: { state: string; data?: Answer }, before: { current: OrderStatus }) {
  const { t } = useI18n();
  const revalidator = useRevalidator();
  const handled = useRef<Answer | undefined>(undefined);
  useEffect(() => {
    const answer = fetcher.data;
    if (fetcher.state !== "idle" || !answer || handled.current === answer) return;
    handled.current = answer;
    if (answer.ok && answer.order) {
      offerUndo({ orderId: order.id, version: answer.order.version, number: order.number, statusLabel: t(`admin.status.${answer.order.status}`), previousLabel: t(`admin.status.${before.current}`) });
    } else if (!answer.ok) {
      showToast(t("admin.today.changed", { number: order.number }), "error");
      void revalidator.revalidate();
    }
  }, [fetcher.state, fetcher.data, order, revalidator, t, before]);
}

/**
 * A Today row (S-120 AC4, S-121): the order as one descriptive link, and, when the next step is a
 * plain status move, a one-tap button named for the order and the step. Rows that need Approve, a
 * quote or the Juice payment only open the detail. The new status shows at once (optimistic).
 */
function TodayRow({ order }: { order: TodayRowView }) {
  const { t, locale } = useI18n();
  const fetcher = useFetcher<Answer>({ key: `today-${order.id}` });
  // The status the tap started from: the list may already show the new one when the answer arrives.
  const before = useRef<OrderStatus>(order.status);
  useTapResult(order, fetcher, before);
  const pending = fetcher.state !== "idle";
  const status = pending && order.nextStatus ? order.nextStatus : order.status;
  const windowText = t("checkout.windowLabel", { label: localized(order.window.label, locale), start: order.window.start, end: order.window.end });
  const Mode = order.fulfilment === "delivery" ? Bike : Store;
  const name = t("admin.orders.rowLabel", {
    number: order.number,
    name: order.contactName,
    date: windowText,
    status: t(`admin.status.${status}`),
    paid: order.paid ? t("admin.orders.paidWord") : t("admin.orders.unpaidWord"),
  });
  return (
    <li className="grid grid-cols-[minmax(0,1fr)] gap-2 rounded-card border border-border bg-card p-2 min-[20rem]:p-3">
      <a href={`/admin/orders/${order.id}`} aria-label={name} className="grid min-h-11 gap-1 rounded-md hover:bg-accent">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-semibold">{order.number}</span>
          <StatusBadge status={status} audience="admin" />
          <PaidTag paid={order.paid} />
        </span>
        <span className="font-semibold wrap-anywhere">{order.contactName}</span>
        <span className="flex flex-wrap items-center gap-x-2">
          <span>{windowText}</span>
          <span className="inline-flex items-center gap-1">
            <Mode aria-hidden="true" className="size-4" />
            {order.fulfilment === "delivery" ? t("admin.order.delivery") : t("admin.order.pickup")}
          </span>
        </span>
        {order.itemsPreview.length > 0 && <span className="text-sm wrap-anywhere">{order.itemsPreview.join(", ")}</span>}
      </a>
      {order.nextStatus && (
        <fetcher.Form method="post" onSubmit={() => (before.current = order.status)}>
          <input type="hidden" name="intent" value="advance" />
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="version" value={order.version} />
          <SubmitButton pending={pending} pendingText={t("admin.today.marking")} size="lg" className="h-auto min-h-12 w-full px-3 whitespace-normal wrap-anywhere min-[20rem]:px-7">
            {t(`admin.today.nextNamed.${order.nextStatus}`, { number: order.number })}
          </SubmitButton>
        </fetcher.Form>
      )}
    </li>
  );
}

/** One day's section (S-120 AC2, AC5): its orders by window start, or the empty text. */
export function DayList({ id, title, empty, orders }: { id: string; title: string; empty: string; orders: TodayRowView[] }) {
  return (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="text-h2">
        {title}
      </h2>
      {orders.length === 0 ? (
        <p className="mt-3 text-lg">{empty}</p>
      ) : (
        <ul className="mt-3 grid gap-3" aria-labelledby={id}>
          {orders.map((order) => (
            <TodayRow key={order.id} order={order} />
          ))}
        </ul>
      )}
    </section>
  );
}
