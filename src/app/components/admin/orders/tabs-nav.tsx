import { ORDER_TABS, type OrderTab } from "~/domain/order-tabs";
import { useI18n } from "~/i18n/react";
import { cn } from "~/lib/utils";

const LABEL_KEY: Record<OrderTab, string> = {
  review: "admin.orders.tabReview",
  payment: "admin.orders.tabPayment",
  upcoming: "admin.orders.tabUpcoming",
  completed: "admin.orders.tabCompleted",
  closed: "admin.orders.tabClosed",
};

/**
 * Tabs of the Orders screen (S-111 AC2, AC8): each is a link to its own address (works before
 * JavaScript, back button, shareable), the current one marked `aria-current="page"`, with its
 * count; To review and Payment show a dot when something waits. Adjusted from the tablist
 * pattern: links in a nav need no arrow keys (S-111 note).
 */
export function OrdersTabs({ tab, counts }: { tab: OrderTab; counts: Record<OrderTab, number> }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t("admin.orders.tabsLabel")} className="mt-4">
      <ul className="flex flex-wrap gap-1.5">
        {ORDER_TABS.map((key) => {
          const current = tab === key;
          const attention = (key === "review" || key === "payment") && counts[key] > 0;
          return (
            <li key={key}>
              <a
                href={`/admin/orders?tab=${key}`}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-md border-2 px-2.5 font-semibold",
                  current ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:bg-accent",
                )}
              >
                {t(LABEL_KEY[key])}
                <span className="tabular-nums" aria-hidden="true">
                  {counts[key]}
                </span>
                <span className="sr-only">{`(${t("admin.orders.tabCount", { count: counts[key] })}${attention ? `, ${t("admin.orders.needsAttention")}` : ""})`}</span>
                {attention && <span aria-hidden="true" data-testid={`tab-dot-${key}`} className={cn("size-2.5 rounded-full", current ? "bg-primary-foreground" : "bg-warning")} />}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
