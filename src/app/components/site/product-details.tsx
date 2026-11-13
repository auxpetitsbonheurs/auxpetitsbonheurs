// Product page content under the description (S-065): diet tags with the fixed kitchen note
// (AC2), the earliest date for this product alone (AC3) and the seasonal note; and the 404
// bodies: "no longer available" (hidden or out of season, AC5) and unknown (AC6).
import { CalendarDays, Leaf, MessageCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useLayoutWhatsapp } from "~/components/site/page-error";
import { Button } from "~/components/ui/button";
import { formatDayLabel } from "~/domain/time";
import { useI18n } from "~/i18n/react";
import { whatsappHref } from "~/lib/contact";
import { localePath } from "~/lib/locale";

/** The 404 body marker for a product that exists but customers may not see (never product data). */
export const PRODUCT_GONE = "PRODUCT_GONE";

const KNOWN_TAGS = new Set(["eggless", "nut_free", "gluten_free", "dairy_free"]);

interface ProductDetailsProps {
  allergens: string[];
  earliestDate: string | null;
  seasonEndsOn: string | null;
}

export function ProductDetails({ allergens, earliestDate, seasonEndsOn }: ProductDetailsProps) {
  const { t, locale } = useI18n();
  const tags = allergens.filter((tag) => KNOWN_TAGS.has(tag));
  return (
    <div className="mt-5 flex flex-col gap-4">
      {(earliestDate || seasonEndsOn) && (
        <ul className="flex flex-col gap-1">
          {earliestDate && (
            <li className="flex items-start gap-2">
              <CalendarDays aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary-strong" strokeWidth={1.75} />
              <span>{t("productContent.earliestDate", { date: formatDayLabel(earliestDate, locale) })}</span>
            </li>
          )}
          {seasonEndsOn && (
            <li className="flex items-start gap-2">
              <Leaf aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary-strong" strokeWidth={1.75} />
              <span>{t("productContent.seasonal", { date: formatDayLabel(seasonEndsOn, locale) })}</span>
            </li>
          )}
        </ul>
      )}
      <section aria-labelledby="product-allergens" className="rounded-card border border-border bg-card p-4">
        <h2 id="product-allergens" className="text-xl">
          {t("productContent.allergensTitle")}
        </h2>
        {tags.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <li key={tag} className="rounded-full border border-gold px-3 py-1 text-sm font-semibold">
                {t(`productContent.tags.${tag}`)}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-muted-foreground">{t("productContent.kitchenNote")}</p>
      </section>
    </div>
  );
}

/** A product page that answered 404: "no longer available" with the menu, or unknown with Home and WhatsApp. */
export function ProductGone({ gone, fallback }: { gone: boolean; fallback: ReactNode }) {
  const { t, locale } = useI18n();
  const whatsapp = useLayoutWhatsapp();
  return (
    <>
      {gone ? (
        <>
          <h1>{t("productContent.goneTitle")}</h1>
          <p className="mt-4 max-w-measure">{t("productContent.goneBody")}</p>
          <p className="mt-6">
            <Link to={localePath(locale, "/menu")} className="inline-flex min-h-11 items-center font-semibold link">
              {t("productContent.backToMenu")}
            </Link>
          </p>
        </>
      ) : (
        fallback
      )}
      {whatsapp && (
        <Button asChild variant="secondary" className="mt-4 h-auto max-w-full whitespace-normal">
          <a href={whatsappHref(whatsapp)}>
            <MessageCircle aria-hidden="true" strokeWidth={1.75} />
            {t("sitePage.whatsapp")}
          </a>
        </Button>
      )}
    </>
  );
}
