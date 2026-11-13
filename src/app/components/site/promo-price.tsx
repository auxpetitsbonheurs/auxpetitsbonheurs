// A price with an offer (S-082, S-066 AC4; design-system Price): the original struck through,
// then the sale price, and for screen readers one plain sentence ("Was Rs 3,000, now Rs 2,400")
// because a strike-through is not announced. Without an offer it is the price alone
// (`className` applies to it then; with an offer each price keeps its own line-break rule).
import { useI18n } from "~/i18n/react";

export function PromoPrice({ price, was, className }: { price: string; was: string | null | undefined; className?: string }) {
  const { t } = useI18n();
  if (!was) return className ? <span className={className}>{price}</span> : <>{price}</>;
  return (
    <span>
      <span aria-hidden="true">
        <s className="font-normal whitespace-nowrap text-muted-foreground">{was}</s>{" "}
        <span className="whitespace-nowrap">{price}</span>
      </span>
      <span className="sr-only">{t("promo.wasNow", { old: was, new: price })}</span>
    </span>
  );
}
