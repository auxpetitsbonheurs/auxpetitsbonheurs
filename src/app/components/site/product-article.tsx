import type { ReactNode } from "react";
import { PlainText } from "~/components/site/plain-text";
import { PromoPrice } from "~/components/site/promo-price";
import { ProductPhotos } from "~/components/site/product-photos";
import { localized } from "~/i18n/localized";
import { type Locale, formatRupees } from "~/lib/locale";
import type { CustomerProduct } from "~/domain/customer-product";
import { formatClockTime, formatDayLabel, todayMU } from "~/domain/time";

export type ProductData = CustomerProduct;

/** What the customer product page shows, already localised. */
export interface ProductShown {
  name: string;
  description: string | null;
  price: string;
  /** The original price, struck through, when an offer applies (S-066 AC4), else null. */
  wasPrice: string | null;
  /** "Offer ends Thu 12 Nov at 18:00" (Mauritius time) when an offer applies, else null. */
  offerEnds: string | null;
  addable: boolean;
  photos: { url: string; width: number; height: number; alt: string }[];
}

type T = (key: string, values?: Record<string, string | number>) => string;

/** "Offer ends {date} at {time}", Mauritius time (the end instant is exclusive: the sale stops then). */
function offerEnds(endsAt: string, locale: Locale, t: T): string {
  const end = new Date(endsAt);
  return t("promo.endsOn", { date: formatDayLabel(todayMU(end), locale), time: formatClockTime(end) });
}

/** What the page shows in `locale`: names fall back to English (NFR-007); alt = name (NFR-002). */
export function productView(product: ProductData, locale: Locale, t?: T): ProductShown {
  const name = localized(product.name, locale);
  const onSale = product.salePriceRs !== null && product.salePriceRs !== undefined;
  return {
    name,
    description: product.description ? localized(product.description, locale) : null,
    price: formatRupees(onSale ? product.salePriceRs! : product.basePriceRs, locale),
    wasPrice: onSale ? formatRupees(product.basePriceRs, locale) : null,
    offerEnds: onSale && product.promotion && t ? offerEnds(product.promotion.endsAt, locale, t) : null,
    addable: product.status === "available",
    photos: product.photos.map((photo) => ({ ...photo, alt: name })),
  };
}

/**
 * The customer product page body (S-011), shared by `/menu/:slug` and the admin preview
 * (S-051) so the preview cannot drift from the live page. `children` is the ordering area
 * (Add to basket, or the sold-out note); the preview passes none. `details` is the product
 * content under the description (allergens, earliest date, season; S-065).
 */
export function ProductArticle({ shown, children, details }: { shown: ProductShown; children?: ReactNode; details?: ReactNode }) {
  return (
    <article className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-10">
      <ProductPhotos photos={shown.photos} name={shown.name} />
      <div className="min-w-0">
        <h1 className="wrap-anywhere">{shown.name}</h1>
        <p className="mt-3 text-2xl font-semibold text-primary-strong">
          <PromoPrice price={shown.price} was={shown.wasPrice} className="whitespace-nowrap" />
        </p>
        {shown.offerEnds && <p className="mt-1 text-sm text-muted-foreground">{shown.offerEnds}</p>}
        {shown.description && <PlainText text={shown.description} className="mt-4" />}
        {details}
        {children}
      </div>
    </article>
  );
}
