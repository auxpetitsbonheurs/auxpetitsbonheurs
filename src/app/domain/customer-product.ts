// The `site/product` loader's product (contracts.md), as the customer page and the admin
// preview (S-051) both render it. Pure type: built on the server by product-view.server.
import type { LocalizedName } from "./pricing";
import type { ProductType } from "./product";

export interface CustomerProduct {
  id: string;
  slug: string;
  type: ProductType;
  name: LocalizedName;
  description: LocalizedName | null;
  allergens: string[];
  photos: { url: string; width: number; height: number }[];
  /** Hidden is never shown to customers; the preview carries the real status beside it. */
  status: "available" | "sold_out";
  minQuantity: number | null;
  basePriceRs: number;
  /** The lowest live promotion price for the base (S-082, FR-016/FR-017), or null; options are never discounted. */
  salePriceRs: number | null;
  promotionId: string | null;
  /** The applied promotion's title and end instant (ISO, exclusive) for "Offer ends" (S-066 AC4), or null. */
  promotion: { title: LocalizedName; endsAt: string } | null;
}
