// Promotions for the customer site (S-082, S-062, S-063): every active promotion that has not
// ended, with its discounts and link target, in one query. Which one is live is decided per
// request from these rows with domain/promotions (isLive, liveBanner, liveCards,
// bestPromotion) and the request clock, so a promotion starts and ends on its exact instant
// with no job. The rows are cached per isolate like Settings (admin edits show within a
// minute); placeOrder never uses this cache (the procedure reads promotions fresh).
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { product, promotion, promotionProduct } from "~/db/schema";
import type { PromoPlacement, PromotionDiscount, PromotionRule } from "~/domain/promotions";
import type { Database } from "~/server/db.server";
import { SETTINGS_TTL_MS, createTtlCache } from "~/server/settings-cache.server";
import type { Clock } from "~/server/clock.server";
import { parseJsonColumn } from "./catalogue.server";

export interface SitePromotion extends PromotionRule {
  startsAt: Date;
  endsAt: Date;
  placement: PromoPlacement;
  discounts: PromotionDiscount[];
  title: { en: string; fr: string | null };
  text: { en: string; fr: string | null } | null;
  imagePath: string | null;
  linkKind: "none" | "product" | "category" | "custom_request";
  linkCategory: string | null;
  /** The linked product's slug and status (a hidden product gets no link), or null. */
  linkProduct: { slug: string; status: "available" | "sold_out" | "hidden" } | null;
}

const discountsJson = sql<PromotionDiscount[] | string>`coalesce((
  select json_agg(json_build_object('productId', pp.product_id, 'kind', pp.discount_kind, 'percentOff', pp.percent_off, 'salePriceRs', pp.sale_price_rs) order by pp.product_id)
  from ${promotionProduct} pp where pp.promotion_id = ${sql.raw(`"promotion"."id"`)}
), '[]'::json)`;

/** Active promotions whose end is after `now`, started or not, oldest start first. */
export async function listCurrentPromotions(db: Database, now: Date): Promise<SitePromotion[]> {
  const rows = await db
    .select({
      id: promotion.id,
      titleEn: promotion.titleEn,
      titleFr: promotion.titleFr,
      textEn: promotion.textEn,
      textFr: promotion.textFr,
      imagePath: promotion.imagePath,
      startsAt: promotion.startsAt,
      endsAt: promotion.endsAt,
      active: promotion.active,
      placement: promotion.placement,
      linkKind: promotion.linkKind,
      linkCategory: promotion.linkCategory,
      linkSlug: product.slug,
      linkStatus: product.status,
      discounts: discountsJson,
    })
    .from(promotion)
    .leftJoin(product, eq(product.id, promotion.linkProductId))
    .where(and(eq(promotion.active, true), gt(promotion.endsAt, now)))
    .orderBy(asc(promotion.startsAt), asc(promotion.id));
  return rows.map((r) => ({
    id: r.id,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    active: r.active,
    placement: r.placement,
    discounts: parseJsonColumn(r.discounts),
    title: { en: r.titleEn, fr: r.titleFr },
    text: r.textEn && r.textEn.trim() !== "" ? { en: r.textEn, fr: r.textFr } : null,
    imagePath: r.imagePath,
    linkKind: r.linkKind,
    linkCategory: r.linkCategory,
    linkProduct: r.linkSlug && r.linkStatus ? { slug: r.linkSlug, status: r.linkStatus } : null,
  }));
}

export const promotionsCache = createTtlCache<SitePromotion[]>(SETTINGS_TTL_MS);

/**
 * The current promotions for display: cached per isolate (60 s), read fresh when a test fixed
 * the clock (e2e specs add promotions and expect them on the next page).
 */
export function getSitePromotions(db: Database, clock: Clock): Promise<SitePromotion[]> {
  const now = clock.now();
  // A cached list read at an earlier instant holds every row still current now (a superset).
  return clock.fixed ? listCurrentPromotions(db, now) : promotionsCache.get(() => listCurrentPromotions(db, now));
}
