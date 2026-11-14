import { CostField } from "~/components/admin/cost-field";
import { useI18n } from "~/i18n/react";
import { formatRupees } from "~/lib/locale";
import { Section } from "./sections";

/** A signed amount: "Rs 850", "-Rs 200". */
export function signedRupees(amount: number): string {
  return amount < 0 ? `-${formatRupees(-amount)}` : formatRupees(amount);
}

/**
 * "Cost to make" on the admin order screen (S-318 AC1-AC4): any admin, any status, never in the
 * way of the order's actions. With a cost, the order's own profit (total minus cost) shows under it.
 */
export function OrderCost({ orderId, costRs, totalRs, isWorkshop }: { orderId: string; costRs: number | null; totalRs: number; isWorkshop: boolean }) {
  const { t } = useI18n();
  return (
    <Section id="cost-heading" title={t("admin.cost.orderTitle")}>
      <CostField
        key={orderId}
        id="order-cost"
        label={t("admin.cost.label")}
        hint={isWorkshop ? t("admin.cost.workshopOrderHint") : t("admin.cost.orderHint")}
        costRs={costRs}
        extra={(saved) => (saved === null ? null : t("admin.cost.orderProfit", { amount: signedRupees(totalRs - saved) }))}
      />
    </Section>
  );
}
