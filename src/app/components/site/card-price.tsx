// A product card's price (S-082): "from Rs X", with the original struck and an "Offer" tag
// when a live offer applies. Its own module so pages without cards do not load it.
import { useI18n } from "~/i18n/react";
import { formatRupees } from "~/lib/locale";
import { PromoPrice } from "./promo-price";

/** A product card's "from Rs X" (menu, Home), with the original "from" struck when an offer applies. */
export function CardPrice({ fromRs, wasFromRs, id }: { fromRs: number; wasFromRs: number | null | undefined; id?: string }) {
  const { t, locale } = useI18n();
  const from = (amount: number) => t("collection.fromPrice", { price: formatRupees(amount, locale) });
  const offer = typeof wasFromRs === "number" && wasFromRs > fromRs;
  return (
    <p id={id} className="text-sm font-semibold text-primary-strong tabular-nums">
      <PromoPrice price={from(fromRs)} was={offer ? from(wasFromRs) : null} className="whitespace-nowrap" />
      {offer && <span className="ml-2 inline-block rounded-sm bg-accent px-1.5 text-xs text-accent-foreground">{t("promo.offer")}</span>}
    </p>
  );
}
