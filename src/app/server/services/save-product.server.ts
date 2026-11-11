// `admin/product` save (S-046, FR-062): create or edit a product's basic details. Last write
// wins (no version column, spec decision); `updated_by` / `updated_at` record who and when.
// A posted slug must be free (not another product's, not in anyone else's slug history);
// a changed slug keeps the old one in `product_slug_history` in the same transaction (Q19).
// Photos and option groups are not touched here (S-047, S-048).
import { and, count, eq, max, ne } from "drizzle-orm";
import { product, productPhoto, productSlugHistory } from "~/db/schema";
import { slugFromName, statusNeedsPhoto } from "~/domain/product";
import type { ProductField, ProductInput, ProductProblem } from "~/server/contracts/admin";
import type { Database } from "~/server/db.server";
import { isUniqueViolation } from "./place-order.server";

export type SaveProductResult =
  | { ok: true; id: string; slug: string }
  | { ok: false; code: "VALIDATION_FAILED" | "SLUG_TAKEN"; fields: Partial<Record<ProductField, ProductProblem>> }
  | { ok: false; code: "NOT_FOUND" };

export interface SaveProductContext {
  adminId: string;
  now: Date;
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const SLUG_TAKEN = { ok: false, code: "SLUG_TAKEN", fields: { slug: "taken" } } as const;

/** True when another product has `slug` now or had it before. */
async function slugTaken(tx: Tx, slug: string, selfId: string | undefined): Promise<boolean> {
  const others = (column: typeof product.id | typeof productSlugHistory.productId) => (selfId ? ne(column, selfId) : undefined);
  const [current] = await tx.select({ id: product.id }).from(product).where(and(eq(product.slug, slug), others(product.id))).limit(1);
  if (current) return true;
  const [old] = await tx
    .select({ slug: productSlugHistory.slug })
    .from(productSlugHistory)
    .where(and(eq(productSlugHistory.slug, slug), others(productSlugHistory.productId)))
    .limit(1);
  return Boolean(old);
}

function columns(input: ProductInput, slug: string, context: SaveProductContext) {
  return {
    slug,
    type: input.type,
    category: input.category,
    nameEn: input.name.en,
    nameFr: input.name.fr,
    descriptionEn: input.description.en,
    descriptionFr: input.description.fr,
    basePriceRs: input.basePriceRs,
    allergens: input.allergens,
    noticeDays: input.noticeDays,
    status: input.status,
    updatedAt: context.now,
    updatedBy: context.adminId,
  };
}

async function create(tx: Tx, input: ProductInput, slug: string, context: SaveProductContext): Promise<SaveProductResult> {
  if (statusNeedsPhoto(input.status)) return { ok: false, code: "VALIDATION_FAILED", fields: { status: "photo" } };
  if (await slugTaken(tx, slug, undefined)) return SLUG_TAKEN;
  const [last] = await tx.select({ value: max(product.sortOrder) }).from(product).where(eq(product.type, input.type));
  const sortOrder = last?.value === null || last?.value === undefined ? 0 : last.value + 1;
  const [created] = await tx
    .insert(product)
    .values({ ...columns(input, slug, context), sortOrder, createdAt: context.now })
    .returning({ id: product.id });
  return { ok: true, id: created!.id, slug };
}

async function update(tx: Tx, id: string, input: ProductInput, context: SaveProductContext): Promise<SaveProductResult> {
  const [existing] = await tx.select({ slug: product.slug }).from(product).where(eq(product.id, id)).for("update");
  if (!existing) return { ok: false, code: "NOT_FOUND" };
  const slug = input.slug ?? existing.slug;
  if (statusNeedsPhoto(input.status)) {
    const [photos] = await tx.select({ n: count() }).from(productPhoto).where(eq(productPhoto.productId, id));
    if (!photos?.n) return { ok: false, code: "VALIDATION_FAILED", fields: { status: "photo" } };
  }
  if (slug !== existing.slug) {
    if (await slugTaken(tx, slug, id)) return SLUG_TAKEN;
    // Taking back one of its own old slugs: it is current again, not history.
    await tx.delete(productSlugHistory).where(eq(productSlugHistory.slug, slug));
    await tx.insert(productSlugHistory).values({ slug: existing.slug, productId: id, createdAt: context.now });
  }
  await tx.update(product).set(columns(input, slug, context)).where(eq(product.id, id));
  return { ok: true, id, slug };
}

export async function saveProduct(db: Database, input: ProductInput, context: SaveProductContext): Promise<SaveProductResult> {
  const slug = input.slug ?? (input.id ? undefined : slugFromName(input.name.en));
  try {
    return await db.transaction((tx) => (input.id ? update(tx, input.id, input, context) : create(tx, input, slug!, context)));
  } catch (error) {
    // Two saves racing for one slug: the unique index decides.
    if (isUniqueViolation(error, "product_slug_unique") || isUniqueViolation(error, "product_slug_history_pkey")) return SLUG_TAKEN;
    throw error;
  }
}
