import { useEffect, useRef } from "react";
import { Alert } from "~/components/ui/alert";
import { useI18n } from "~/i18n/react";
import type { OrderLoaderData } from "~/routes/admin/order";
import { orderLinkClass } from "./header";
import { type OrderActionAnswer, useOrderAction } from "./use-order-action";

const RELOAD_CODES = new Set(["ORDER_CHANGED", "INVALID_TRANSITION", "NOT_FOUND"]);

/**
 * "This order changed. Reload" (FR-054, S-124 AC1, AC7): announced (`role=alert`) and focused
 * when a status or paid action is refused because the order moved on. Reload is a plain link to
 * the order, so it also works before JavaScript has loaded; the reloaded page shows the new
 * status, version and actions (S-124 AC4).
 */
export function OrderConflict({ data: { order, allowed }, actionData }: { data: OrderLoaderData; actionData: unknown }) {
  const { t } = useI18n();
  const { fetcher } = useOrderAction(order, allowed);
  const answer = (fetcher.state === "idle" ? fetcher.data : undefined) ?? (actionData as OrderActionAnswer | undefined);
  const error = answer && !answer.ok && answer.intent !== "saveNote" && RELOAD_CODES.has(answer.error.code) ? answer.error : undefined;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);
  if (!error) return null;
  return (
    <Alert ref={ref} tone="danger" role="alert" tabIndex={-1} className="mt-6 outline-offset-2">
      <p className="font-semibold">{error.message}</p>
      <a href={`/admin/orders/${order.id}`} className={orderLinkClass}>
        {t("admin.order.reload")}
      </a>
    </Alert>
  );
}
