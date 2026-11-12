import type { ReactNode } from "react";
import { localized } from "~/i18n/localized";
import { type Locale, formatRupees } from "~/lib/locale";
import type { CustomerProduct } from "~/domain/customer-product";

export type ProductData = CustomerProduct;

/** What the customer product page shows, already localised. */
export interface ProductShown {
  name: string;
  description: string | null;
  price: string;
  addable: boolean;
  photos: { url: string; width: number; height: number; alt: string }[];
}

/** What the page shows in `locale`: names fall back to English (NFR-007); alt = name (NFR-002). */
export function productView(product: ProductData, locale: Locale): ProductShown {
  const name = localized(product.name, locale);
  return {
    name,
    description: product.description ? localized(product.description, locale) : null,
    price: formatRupees(product.basePriceRs, locale),
    addable: product.status === "available",
    photos: product.photos.map((photo) => ({ ...photo, alt: name })),
  };
}

/**
 * The customer product page body (S-011), shared by `/menu/:slug` and the admin preview
 * (S-051) so the preview cannot drift from the live page. `children` is the ordering area
 * (Add to basket, or the sold-out note); the preview passes none.
 */
export function ProductArticle({ shown, children }: { shown: ProductShown; children?: ReactNode }) {
  const photo = shown.photos[0];
  return (
    <article className="grid gap-6 md:grid-cols-2 md:gap-10">
      {photo && <img src={photo.url} alt={photo.alt} width={photo.width} height={photo.height} className="h-auto w-full rounded-lg bg-decorative" />}
      <div className="min-w-0">
        <h1>{shown.name}</h1>
        <p className="mt-3 text-2xl font-semibold whitespace-nowrap text-primary-strong">{shown.price}</p>
        {shown.description && <p className="mt-4 max-w-measure">{shown.description}</p>}
        {children}
      </div>
    </article>
  );
}
