// `site/home` (FR-004, S-063): what the Home page shows, from the public menu query (the same
// rows as /menu, so a category or card never points at something the menu hides), the cached
// Settings (tagline, hero photo, featured ids), the live promotion cards and the first gallery
// photos. Cold isolate: two round trips (menu + promotions; Settings and gallery are cached).
import { and, asc, desc, eq, gt, inArray, lte, ne } from "drizzle-orm";
import { product, promotion } from "~/db/schema";
import { COLLECTION_TYPE_ORDER, collectionSections, fromPriceRs } from "~/domain/collection";
import type { HomeData, HomeProduct, HomePromoCard } from "~/domain/home";
import type { MenuProduct } from "~/domain/menu";
import { isInSeason } from "~/domain/season";
import { todayMU } from "~/domain/time";
import type { Locale } from "~/lib/locale";
import { publicImageUrl } from "~/lib/images";
import type { Database } from "~/server/db.server";
import { type MenuProductRecord, listMenuProducts } from "~/server/repos/catalogue.server";
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
    photos: record.photos.map((p) => ({ url: publicImageUrl(p.storagePath, supabaseUrl), width: p.width, height: p.height })),
    optionGroups: record.optionGroups,
    season: record.season,
  };
}

function card(p: MenuProduct): HomeProduct {
  return { id: p.id, slug: p.slug, name: p.name, photo: p.photos[0] ?? null, fromPriceRs: fromPriceRs(p), soldOut: p.status === "sold_out" };
}

const firstPhoto = (products: readonly MenuProduct[]) => products.find((p) => p.photos[0])?.photos[0] ?? null;

/** Live = active and starts_at <= now < ends_at (FR-016); cards = placement card or both. */
async function livePromoCards(db: Database, now: Date) {
  return db
    .select({
      id: promotion.id,
      titleEn: promotion.titleEn,
      titleFr: promotion.titleFr,
      textEn: promotion.textEn,
      textFr: promotion.textFr,
      imagePath: promotion.imagePath,
      linkKind: promotion.linkKind,
      linkCategory: promotion.linkCategory,
      productSlug: product.slug,
    })
    .from(promotion)
    .leftJoin(product, and(eq(product.id, promotion.linkProductId), ne(product.status, "hidden")))
    .where(and(eq(promotion.active, true), lte(promotion.startsAt, now), gt(promotion.endsAt, now), inArray(promotion.placement, ["card", "both"])))
    .orderBy(desc(promotion.startsAt), asc(promotion.id));
}

type PromoRow = Awaited<ReturnType<typeof livePromoCards>>[number];

function promoHref(row: PromoRow, shownTypes: ReadonlySet<string>): string | null {
  if (row.linkKind === "custom_request") return "/custom-cake";
  if (row.linkKind === "product" && row.productSlug) return `/menu/${encodeURIComponent(row.productSlug)}`;
  if (row.linkKind === "category" && row.linkCategory) return shownTypes.has(row.linkCategory) ? `/menu#type-${row.linkCategory}` : "/menu";
  return null;
}

function promoCard(row: PromoRow, supabaseUrl: string, shownTypes: ReadonlySet<string>): HomePromoCard {
  const text = row.textEn && row.textEn.trim() !== "" ? { en: row.textEn, ...(row.textFr ? { fr: row.textFr } : {}) } : null;
  return {
    id: row.id,
    title: { en: row.titleEn, ...(row.titleFr ? { fr: row.titleFr } : {}) },
    text,
    photo: row.imagePath ? { url: publicImageUrl(row.imagePath, supabaseUrl), ...HERO_BOX } : null,
    href: promoHref(row, shownTypes),
  };
}

/** Home from the menu rows, Settings, promotions and gallery read. Pure past the reads. */
export async function loadHome({ db, supabaseUrl, now, locale, galleryAlt }: HomeSources): Promise<HomeData> {
  const [records, settings, promos, gallery] = await Promise.all([
    listMenuProducts(db),
    getSiteSettings(db),
    livePromoCards(db, now),
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
    ? { url: publicImageUrl(heroPath, supabaseUrl), ...HERO_BOX }
    : (firstPhoto(featured) ?? firstPhoto(sections.find((s) => s.type === "cake")?.products ?? []) ?? firstPhoto([...visible.values()]));
  return {
    hero: { tagline: settings.home.tagline, photo: heroPhoto },
    categories,
    promoCards: promos.map((row) => promoCard(row, supabaseUrl, shownTypes)),
    seasonal: seasonal.map(card),
    featured: featured.map(card),
    gallery: gallery.ok ? gallery.photos.slice(0, GALLERY_PREVIEW) : [],
  };
}
