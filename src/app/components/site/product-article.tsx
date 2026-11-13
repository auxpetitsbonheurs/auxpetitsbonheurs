import type { ReactNode } from "react";
import { PlainText } from "~/components/site/plain-text";
import { ProductPhotos } from "~/components/site/product-photos";
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
 * (Add to basket, or the sold-out note); the preview passes none. `details` is the product
 * content under the description (allergens, earliest date, season; S-065).
 */
export function ProductArticle({ shown, children, details }: { shown: ProductShown; children?: ReactNode; details?: ReactNode }) {
  return (
    <article className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-10">
      <ProductPhotos photos={shown.photos} name={shown.name} />
      <div className="min-w-0">
        <h1 className="wrap-anywhere">{shown.name}</h1>
        <p className="mt-3 text-2xl font-semibold whitespace-nowrap text-primary-strong">{shown.price}</p>
        {shown.description && <PlainText text={shown.description} className="mt-4" />}
        {details}
        {children}
      </div>
    </article>
  );
}
