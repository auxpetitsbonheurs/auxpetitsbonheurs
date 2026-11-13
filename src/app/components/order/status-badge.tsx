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

/** Every status has customer wording in both languages (S-095 AC5): never a raw enum. */
export function useStatusLabel() {
  const { t } = useI18n();
  return (status: OrderStatus) => t(`order.status.${status}`);
}

/**
 * Design-system "Status badge": outline on the surface, icon + word. The text stays in
 * the foreground colour (AA in both themes); the tone colour is only the border and icon.
 */
export function StatusBadge({ status, audience = "customer" }: { status: OrderStatus; audience?: "customer" | "admin" }) {
  const { t } = useI18n();
  const customerLabel = useStatusLabel()(status);
  // Admin wording for every status (admin-orders spec; quote_sent reads "Waiting for customer", owner Q13).
  const label = audience === "admin" ? t(`admin.status.${status}`) : customerLabel;
  const tone = TONE[statusTone(status)];
  return (
    <span className={cn("inline-flex min-h-6 items-center gap-1.5 rounded-full border-2 bg-background px-3 py-0.5 text-sm font-semibold", tone.border)}>
      <tone.Icon aria-hidden="true" className={cn("size-4", tone.icon)} />
      {label}
    </span>
  );
}
