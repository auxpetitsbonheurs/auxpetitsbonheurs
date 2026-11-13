// Admin promotions (S-052 list, S-053 editor; FR-063): read, save, switch on/off and delete.
// A save replaces the promotion's discount rows in one transaction. Every write clears this
// isolate's customer promotions cache; other isolates follow within its 60 s TTL.
import { and, asc, desc, eq, gt, ne, sql } from "drizzle-orm";
import { product, promotion, promotionProduct } from "~/db/schema";
import { isLive } from "~/domain/promotions";
import { PHOTO_MAX_EDGE, isIssuedPromotionPath } from "~/domain/upload";
import type { AfterResponse } from "~/server/after-response.server";
import type { StorageGateway, UploadGateway } from "~/server/storage.server";
import { checkNewPhoto } from "./product-photos.server";
import { removePhotos } from "./storage-cleanup.server";
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
    imagePath: row.imagePath,
  };
}

/** Who saves, and the photo gateways (S-053 AC8: the image follows the product photo rules). */
export interface PromotionSaveContext {
  adminId: string;
  now: Date;
  uploadSessionId?: string;
  uploads?: UploadGateway | null;
  storage?: StorageGateway | null;
  after?: AfterResponse;
}

type SaveResult = { ok: true; id: string } | { ok: false; code: "NOT_FOUND" | "UPLOAD_REJECTED" };

/**
 * The image's variant widths to store (S-276), or null when a new path fails the checks: an
 * unchanged image keeps its widths; a new one must be issued to this admin for this editor
 * session and really be an image in Storage (magic number, size), as product photos.
 */
async function checkImage(stored: { imagePath: string | null; imageVariants: number[] } | undefined, path: string | null, context: PromotionSaveContext): Promise<number[] | null> {
  if (path === null) return [];
  if (stored?.imagePath === path) return stored.imageVariants;
  const { uploads, uploadSessionId, adminId } = context;
  if (!uploads || !uploadSessionId || !isIssuedPromotionPath(path, adminId, uploadSessionId)) return null;
  return checkNewPhoto(uploads, { path, width: PHOTO_MAX_EDGE, height: PHOTO_MAX_EDGE });
}

/** Removes a promotion image after the response (or now, without a queue); only our own uploads. */
async function removeImage(db: Database, path: string | null, context: Pick<PromotionSaveContext, "storage" | "after">): Promise<void> {
  if (!path || !path.startsWith("promotions/")) return;
  const cleanUp = () => removePhotos(db, context.storage ?? null, [path]);
  if (context.after) context.after.defer("remove-photos", cleanUp);
  else await cleanUp();
}

const columns = (input: PromotionInput, now: Date, imageVariants: number[]) => ({
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
  imagePath: input.imagePath,
  imageVariants,
  updatedAt: now,
});

/**
 * Creates or updates a promotion and replaces its discounts; NOT_FOUND when an edited id is gone,
 * UPLOAD_REJECTED when a new image fails the photo checks (nothing is saved). A replaced or
 * removed image is deleted from Storage after the save.
 */
export async function savePromotion(db: Database, input: PromotionInput, actor: PromotionSaveContext): Promise<SaveResult> {
  const [stored] = input.id ? await db.select({ imagePath: promotion.imagePath, imageVariants: promotion.imageVariants }).from(promotion).where(eq(promotion.id, input.id)) : [];
  if (input.id && !stored) return { ok: false, code: "NOT_FOUND" };
  const imageVariants = await checkImage(stored, input.imagePath, actor);
  if (!imageVariants) return { ok: false, code: "UPLOAD_REJECTED" };
  const id = await db.transaction(async (tx) => {
    let promotionId = input.id;
    if (promotionId) {
      const updated = await tx.update(promotion).set(columns(input, actor.now, imageVariants)).where(eq(promotion.id, promotionId)).returning({ id: promotion.id });
      if (updated.length === 0) return null;
      await tx.delete(promotionProduct).where(eq(promotionProduct.promotionId, promotionId));
    } else {
      const [created] = await tx.insert(promotion).values({ ...columns(input, actor.now, imageVariants), createdBy: actor.adminId }).returning({ id: promotion.id });
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
  if (stored?.imagePath && stored.imagePath !== input.imagePath) await removeImage(db, stored.imagePath, actor);
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
export async function deletePromotion(db: Database, id: string, now: Date, cleanup: Pick<PromotionSaveContext, "storage" | "after"> = {}): Promise<"deleted" | "live" | "not_found"> {
  const [row] = await db.select({ active: promotion.active, startsAt: promotion.startsAt, endsAt: promotion.endsAt, imagePath: promotion.imagePath }).from(promotion).where(eq(promotion.id, id));
  if (!row) return "not_found";
  if (isLive(row, now)) return "live";
  await db.delete(promotion).where(eq(promotion.id, id));
  promotionsCache.clear();
  // S-053 AC8: its image goes with it (after the response).
  await removeImage(db, row.imagePath, cleanup);
  return "deleted";
}
