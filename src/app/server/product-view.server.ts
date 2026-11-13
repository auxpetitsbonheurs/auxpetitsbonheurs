// The `site/product` loader's product shape (contracts.md), shared by the customer page and
// the admin preview (S-051) so the two cannot drift. The status rules stay with the callers.
import type { CustomerProduct } from "~/domain/customer-product";
import { bestPromotion } from "~/domain/promotions";
import { webPhoto } from "~/lib/images";
import type { ProductRecord } from "~/server/repos/catalogue.server";
import type { SitePromotion } from "~/server/repos/promotions.server";

/** The product's live promotion at `now` (lowest price, no stacking; S-082), as the page shows it. */
function appliedPromotion(record: ProductRecord, promotions: readonly SitePromotion[], now: Date): Pick<CustomerProduct, "salePriceRs" | "promotionId" | "promotion"> {
  // Product rules win (S-082 AC11): a sold-out (or hidden) product shows no offer.
  const best = record.status === "available" ? bestPromotion(record.id, record.basePriceRs, promotions, now) : null;
  const promo = best ? promotions.find((p) => p.id === best.promotionId) : undefined;
  if (!best || !promo) return { salePriceRs: null, promotionId: null, promotion: null };
  return { salePriceRs: best.salePriceRs, promotionId: best.promotionId, promotion: { title: promo.title, endsAt: promo.endsAt.toISOString() } };
}

/** `promotions` and `now`: the live offer to show (the customer page); none for the admin preview. */
export function customerProduct(record: ProductRecord, supabaseUrl: string, offers?: { promotions: readonly SitePromotion[]; now: Date }): CustomerProduct {
  return {
    ...(offers ? appliedPromotion(record, offers.promotions, offers.now) : { salePriceRs: null, promotionId: null, promotion: null }),
    id: record.id,
    slug: record.slug,
    type: record.type,
    name: record.name,
    description: record.description,
    allergens: record.allergens,
    photos: record.photos.map((p) => webPhoto(p.storagePath, p.width, p.height, p.variantWidths, supabaseUrl)),
    status: record.status === "sold_out" ? ("sold_out" as const) : ("available" as const),
    minQuantity: record.minQuantity,
    basePriceRs: record.basePriceRs,
  };
}
