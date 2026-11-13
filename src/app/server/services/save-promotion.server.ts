// Admin promotions (S-052 list, S-053 editor; FR-063): read, save, switch on/off and delete.
// A save replaces the promotion's discount rows in one transaction. Every write clears this
// isolate's customer promotions cache; other isolates follow within its 60 s TTL.
import { and, asc, desc, eq, gt, ne, sql } from "drizzle-orm";
import { product, promotion, promotionProduct } from "~/db/schema";
import { isLive } from "~/domain/promotions";
import type { PromotionDiscountInput, PromotionInput } from "~/server/contracts/promotions";
import type { Database } from "~/server/db.server";
import { promotionsCache } from "~/server/repos/promotions.server";

export interface AdminPromotionRow {
  id: string;
  title: string;
  active: boolean;
  startsAt: Date;
  endsAt: Date;
  placement: PromotionInput["placement"];
  productCount: number;
}

/** Every promotion, newest start first (S-052). */
export async function listAdminPromotions(db: Database): Promise<AdminPromotionRow[]> {
  return db
    .select({
      id: promotion.id,
      title: promotion.titleEn,
      active: promotion.active,
      startsAt: promotion.startsAt,
      endsAt: promotion.endsAt,
      placement: promotion.placement,
      productCount: sql<number>`(select count(*)::int from ${promotionProduct} pp where pp.promotion_id = ${promotion.id})`,
    })
    .from(promotion)
    .orderBy(desc(promotion.startsAt), asc(promotion.id));
}

export interface PromotionProductChoice {
  id: string;
  name: string;
  type: string;
  basePriceRs: number;
  hidden: boolean;
  /** In another active promotion that has not ended (the lowest price applies, never stacked). */
  inOtherOffer: boolean;
}

/** The products an offer can apply to, in menu order, with whether another current offer covers them. */
export async function listPromotionProducts(db: Database, now: Date, promotionId: string | null): Promise<PromotionProductChoice[]> {
  const other = db
    .select({ productId: promotionProduct.productId })
    .from(promotionProduct)
    .innerJoin(promotion, eq(promotion.id, promotionProduct.promotionId))
    .where(and(eq(promotion.active, true), gt(promotion.endsAt, now), promotionId ? ne(promotion.id, promotionId) : undefined));
  const rows = await db
    .select({ id: product.id, name: product.nameEn, type: product.type, basePriceRs: product.basePriceRs, status: product.status, inOther: sql<boolean>`${product.id} in (${other})` })
    .from(product)
    .orderBy(asc(product.type), asc(product.sortOrder), asc(product.nameEn));
  return rows.map((r) => ({ id: r.id, name: r.name, type: r.type, basePriceRs: r.basePriceRs, hidden: r.status === "hidden", inOtherOffer: Boolean(r.inOther) }));
}

export type EditablePromotion = Omit<PromotionInput, "id"> & { id: string };

/** One promotion with its discounts, or undefined. */
export async function findPromotion(db: Database, id: string): Promise<EditablePromotion | undefined> {
  const [row] = await db.select().from(promotion).where(eq(promotion.id, id));
  if (!row) return undefined;
  const discounts = await db.select().from(promotionProduct).where(eq(promotionProduct.promotionId, id));
  return {
    id: row.id,
    title: { en: row.titleEn, fr: row.titleFr },
    text: { en: row.textEn, fr: row.textFr },
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    active: row.active,
    placement: row.placement,
    link: { kind: row.linkKind, productId: row.linkProductId, category: (row.linkCategory ?? null) as PromotionInput["link"]["category"] },
    discounts: discounts.map((d): PromotionDiscountInput => ({ productId: d.productId, kind: d.discountKind, percentOff: d.percentOff, salePriceRs: d.salePriceRs })),
  };
}

const columns = (input: PromotionInput, now: Date) => ({
  titleEn: input.title.en,
  titleFr: input.title.fr,
  textEn: input.text.en,
  textFr: input.text.fr,
  startsAt: input.startsAt,
  endsAt: input.endsAt,
  active: input.active,
  placement: input.placement,
  linkKind: input.link.kind,
  linkProductId: input.link.productId,
  linkCategory: input.link.category,
  updatedAt: now,
});

/** Creates or updates a promotion and replaces its discounts; NOT_FOUND when an edited id is gone. */
export async function savePromotion(db: Database, input: PromotionInput, actor: { adminId: string; now: Date }): Promise<{ ok: true; id: string } | { ok: false; code: "NOT_FOUND" }> {
  const id = await db.transaction(async (tx) => {
    let promotionId = input.id;
    if (promotionId) {
      const updated = await tx.update(promotion).set(columns(input, actor.now)).where(eq(promotion.id, promotionId)).returning({ id: promotion.id });
      if (updated.length === 0) return null;
      await tx.delete(promotionProduct).where(eq(promotionProduct.promotionId, promotionId));
    } else {
      const [created] = await tx.insert(promotion).values({ ...columns(input, actor.now), createdBy: actor.adminId }).returning({ id: promotion.id });
      promotionId = created!.id;
    }
    if (input.discounts.length > 0) {
      await tx.insert(promotionProduct).values(
        input.discounts.map((d) => ({ promotionId: promotionId!, productId: d.productId, discountKind: d.kind, percentOff: d.percentOff, salePriceRs: d.salePriceRs })),
      );
    }
    return promotionId;
  });
  if (!id) return { ok: false, code: "NOT_FOUND" };
  promotionsCache.clear();
  return { ok: true, id };
}

/** Switches a promotion on or off; false when it does not exist. */
export async function setPromotionActive(db: Database, id: string, active: boolean, now: Date): Promise<boolean> {
  const rows = await db.update(promotion).set({ active, updatedAt: now }).where(eq(promotion.id, id)).returning({ id: promotion.id });
  promotionsCache.clear();
  return rows.length > 0;
}

/**
 * Deletes a Scheduled, Ended or Inactive promotion and its discounts (S-052 AC4); a Live one is
 * refused ("End it first"). Past orders keep their snapshot (promotion_id set null).
 */
export async function deletePromotion(db: Database, id: string, now: Date): Promise<"deleted" | "live" | "not_found"> {
  const [row] = await db.select({ active: promotion.active, startsAt: promotion.startsAt, endsAt: promotion.endsAt }).from(promotion).where(eq(promotion.id, id));
  if (!row) return "not_found";
  if (isLive(row, now)) return "live";
  await db.delete(promotion).where(eq(promotion.id, id));
  promotionsCache.clear();
  return "deleted";
}
