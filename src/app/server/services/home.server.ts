// `site/home` (FR-004, S-063): what the Home page shows, from the public menu query (the same
// rows as /menu, so a category or card never points at something the menu hides), the cached
// Settings (tagline, hero photo, featured ids), the live promotion cards and the first gallery
// photos. Cold isolate: two round trips (menu + promotions; Settings and gallery are cached;
// promotions are cached too and judged live per request with domain/promotions, S-082).
import { COLLECTION_TYPE_ORDER, collectionSections, fromPriceRs } from "~/domain/collection";
import { bestPromotion, liveCards } from "~/domain/promotions";
import type { HomeData, HomeProduct, HomePromoCard } from "~/domain/home";
import type { MenuProduct } from "~/domain/menu";
import { isInSeason } from "~/domain/season";
import { todayMU } from "~/domain/time";
import type { Locale } from "~/lib/locale";
import { publicImageUrl, webPhoto } from "~/lib/images";
import type { Database } from "~/server/db.server";
import { type MenuProductRecord, listMenuProducts } from "~/server/repos/catalogue.server";
import { promotionHref } from "~/server/banner.server";
import { type SitePromotion, getSitePromotions } from "~/server/repos/promotions.server";
import { getSiteSettings } from "~/server/repos/settings.server";
import { getGalleryPhotos } from "~/server/services/site-page.server";

export type { HomeCategory, HomeData, HomeProduct, HomePromoCard } from "~/domain/home";

/** Featured products shown at most (FR-004). */
export const FEATURED_MAX = 6;
/** Gallery preview photos (FR-004). */
export const GALLERY_PREVIEW = 6;
/** Settings hero photos carry no stored size: the frame reserves this 4:3 box (object-cover). */
export const HERO_BOX = { width: 1600, height: 1200 } as const;

/** Category cards: the collection's types; seasonal products get their own row instead. */
const CATEGORY_TYPES = COLLECTION_TYPE_ORDER.filter((type) => type !== "seasonal");

interface HomeSources {
  db: Database;
  supabaseUrl: string;
  now: Date;
  /** A test fixed the clock: promotions are read fresh (server/clock.server `fixed`). */
  fixedClock?: boolean;
  locale: Locale;
  /** Names a gallery photo with no caption (localised by the caller). */
  galleryAlt: string;
}

function toMenuProduct(record: MenuProductRecord, supabaseUrl: string): MenuProduct {
  return {
    id: record.id,
    slug: record.slug,
    type: record.type,
    name: record.name,
    basePriceRs: record.basePriceRs,
    status: record.status,
    minQuantity: record.minQuantity,
    photos: record.photos.map((p) => webPhoto(p.storagePath, p.width, p.height, p.variantWidths, supabaseUrl)),
    optionGroups: record.optionGroups,
    season: record.season,
  };
}

/** A product card; a live offer (S-082) gives the sale "from" and keeps the original to strike (not when sold out). */
function card(p: MenuProduct, promotions: readonly SitePromotion[], now: Date): HomeProduct {
  const soldOut = p.status === "sold_out";
  const offer = soldOut ? null : bestPromotion(p.id, p.basePriceRs, promotions, now);
  const original = fromPriceRs(p);
  return { id: p.id, slug: p.slug, name: p.name, photo: p.photos[0] ?? null, fromPriceRs: fromPriceRs(p, offer), originalFromPriceRs: offer ? original : null, soldOut };
}

const firstPhoto = (products: readonly MenuProduct[]) => products.find((p) => p.photos[0])?.photos[0] ?? null;

/** Category links go to the section when the menu shows that type, else to the menu's top. */
function promoHref(promo: SitePromotion, shownTypes: ReadonlySet<string>): string | null {
  if (promo.linkKind === "category" && promo.linkCategory && !shownTypes.has(promo.linkCategory)) return "/menu";
  return promotionHref(promo);
}

function promoCard(promo: SitePromotion, supabaseUrl: string, shownTypes: ReadonlySet<string>): HomePromoCard {
  const text = promo.text ? { en: promo.text.en, ...(promo.text.fr ? { fr: promo.text.fr } : {}) } : null;
  return {
    id: promo.id,
    title: { en: promo.title.en, ...(promo.title.fr ? { fr: promo.title.fr } : {}) },
    text,
    photo: promo.imagePath ? { url: publicImageUrl(promo.imagePath, supabaseUrl), ...HERO_BOX } : null,
    href: promoHref(promo, shownTypes),
  };
}

/** Home from the menu rows, Settings, promotions and gallery read. Pure past the reads. */
export async function loadHome({ db, supabaseUrl, now, fixedClock, locale, galleryAlt }: HomeSources): Promise<HomeData> {
  const [records, settings, promotions, gallery] = await Promise.all([
    listMenuProducts(db),
    getSiteSettings(db),
    getSitePromotions(db, { now: () => now, fixed: fixedClock }),
    getGalleryPhotos(db, locale, supabaseUrl, galleryAlt),
  ]);
  const today = todayMU(now);
  const products = records.map((r) => toMenuProduct(r, supabaseUrl));
  const sections = collectionSections({ products }, today);
  const shownTypes = new Set<string>(sections.map((s) => s.type));
  const visible = new Map(sections.flatMap((s) => s.products).map((p) => [p.id, p]));
  const featured = settings.home.featuredProductIds.flatMap((id) => visible.get(id) ?? []).slice(0, FEATURED_MAX);
  const seasonal = [...visible.values()].filter((p) => p.season && isInSeason(p.season, today));
  const categories = CATEGORY_TYPES.flatMap((type) => {
    const section = sections.find((s) => s.type === type);
    return section ? [{ type, photo: firstPhoto(section.products) }] : [];
  });
  const heroPath = settings.home.heroImagePath;
  const heroPhoto = heroPath
    ? webPhoto(heroPath, HERO_BOX.width, HERO_BOX.height, settings.home.heroImageVariants, supabaseUrl)
    : (firstPhoto(featured) ?? firstPhoto(sections.find((s) => s.type === "cake")?.products ?? []) ?? firstPhoto([...visible.values()]));
  return {
    hero: { tagline: settings.home.tagline, photo: heroPhoto },
    categories,
    // FR-004: live card or both promotions, latest start first; gone from the first request at their end.
    promoCards: liveCards(promotions, now).map((promo) => promoCard(promo, supabaseUrl, shownTypes)),
    seasonal: seasonal.map((p) => card(p, promotions, now)),
    featured: featured.map((p) => card(p, promotions, now)),
    gallery: gallery.ok ? gallery.photos.slice(0, GALLERY_PREVIEW) : [],
  };
}
