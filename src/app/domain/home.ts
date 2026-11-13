// The `site/home` loader's data (FR-004, S-063; contracts.md), as the Home view renders it.
// Pure types: built on the server by services/home.server.
import type { LocalizedText } from "~/db/tables/json-types";
import type { ProductType } from "./product";

export interface HomePhoto {
  url: string;
  width: number;
  height: number;
  /** Smaller copies for `srcset` (S-276); absent when only the original exists. */
  srcSet?: string;
  thumbUrl?: string;
}

/** A product card on Home (contracts.md ProductCard, the fields Home shows). */
export interface HomeProduct {
  id: string;
  slug: string;
  name: { en: string; fr: string | null };
  photo: HomePhoto | null;
  fromPriceRs: number;
  soldOut: boolean;
}

/** One "Our collection" card: a product type with at least one product a customer can see today. */
export interface HomeCategory {
  type: ProductType;
  photo: HomePhoto | null;
}

export interface HomePromoCard {
  id: string;
  title: LocalizedText;
  text: LocalizedText | null;
  photo: HomePhoto | null;
  /** Unprefixed site path, or null for a text-only card. */
  href: string | null;
}

export interface HomeGalleryPhoto extends HomePhoto {
  alt: string;
  caption: string | null;
}

export interface HomeData {
  hero: { tagline: LocalizedText | null; photo: HomePhoto | null };
  categories: HomeCategory[];
  promoCards: HomePromoCard[];
  seasonal: HomeProduct[];
  featured: HomeProduct[];
  gallery: HomeGalleryPhoto[];
}
