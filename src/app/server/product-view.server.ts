// The `site/product` loader's product shape (contracts.md), shared by the customer page and
// the admin preview (S-051) so the two cannot drift. The status rules stay with the callers.
import type { CustomerProduct } from "~/domain/customer-product";
import { webPhoto } from "~/lib/images";
import type { ProductRecord } from "~/server/repos/catalogue.server";

export function customerProduct(record: ProductRecord, supabaseUrl: string): CustomerProduct {
  return {
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
