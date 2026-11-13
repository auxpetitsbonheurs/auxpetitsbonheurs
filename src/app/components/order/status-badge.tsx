import { Check, CircleCheck, CircleX, Clock, Hourglass } from "lucide-react";
import { type OrderStatus, type StatusTone, statusTone } from "~/domain/status";
import { useI18n } from "~/i18n/react";
import { cn } from "~/lib/utils";

const TONE: Record<StatusTone, { border: string; icon: string; Icon: typeof Clock }> = {
  action: { border: "border-warning", icon: "text-warning", Icon: Clock },
  waiting: { border: "border-info", icon: "text-info", Icon: Hourglass },
  progress: { border: "border-success", icon: "text-success", Icon: CircleCheck },
  done: { border: "border-muted-foreground", icon: "text-muted-foreground", Icon: Check },
  stopped: { border: "border-destructive", icon: "text-destructive", Icon: CircleX },
};

/** Statuses with customer wording in this slice; the others show a generic label until E-06. */
const WORDED = new Set<OrderStatus>([
  "awaiting_payment",
  "pending_approval",
  "approved",
  "in_preparation",
  "out_for_delivery",
  "ready_for_pickup",
  "completed",
  "declined",
  "cancelled",
]);

export function useStatusLabel() {
  const { t } = useI18n();
  return (status: OrderStatus) => t(WORDED.has(status) ? `order.status.${status}` : "order.status.other");
}

/**
 * Design-system "Status badge": outline on the surface, icon + word. The text stays in
 * the foreground colour (AA in both themes); the tone colour is only the border and icon.
 */
export function StatusBadge({ status }: { status: OrderStatus }) {
  const label = useStatusLabel()(status);
  const tone = TONE[statusTone(status)];
  return (
    <span className={cn("inline-flex min-h-6 items-center gap-1.5 rounded-full border-2 bg-background px-3 py-0.5 text-sm font-semibold", tone.border)}>
      <tone.Icon aria-hidden="true" className={cn("size-4", tone.icon)} />
      {label}
    </span>
  );
}
