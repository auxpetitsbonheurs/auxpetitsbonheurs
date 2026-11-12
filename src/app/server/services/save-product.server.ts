// `admin/product` save (S-046, FR-062): create or edit a product's basic details. Last write
// wins (no version column, spec decision); `updated_by` / `updated_at` record who and when.
// A posted slug must be free (not another product's, not in anyone else's slug history);
// a changed slug keeps the old one in `product_slug_history` in the same transaction (Q19).
// Photos (S-047): a posted list replaces the stored one after its new paths pass the upload
// checks (product-photos.server); files of photos that left the list are removed after
// commit, or queued. Without a posted list the photos stay as they are. Option groups
// (S-048): a posted list replaces the stored groups and choices, keeping their ids.
import { and, count, eq, max, ne } from "drizzle-orm";
import { product, productPhoto, productSlugHistory } from "~/db/schema";
import { slugFromName, statusNeedsPhoto } from "~/domain/product";
import type { ProductField, ProductInput, ProductProblem } from "~/server/contracts/admin";
import type { Database } from "~/server/db.server";
import type { StorageGateway, UploadGateway } from "~/server/storage.server";
import { isUniqueViolation } from "./place-order.server";
import { replaceOptionGroups } from "./product-options.server";
import { type PhotoInput, photosAcceptable, replacePhotos, storedPhotos } from "./product-photos.server";
import { isStoragePath, removePhotos } from "./storage-cleanup.server";

export type SaveProductResult =
  | { ok: true; id: string; slug: string }
  | { ok: false; code: "VALIDATION_FAILED" | "SLUG_TAKEN"; fields: Partial<Record<ProductField, ProductProblem>> }
  | { ok: false; code: "UPLOAD_REJECTED"; fields: { photos: "rejected" } }
  | { ok: false; code: "NOT_FOUND" };

export interface SaveProductContext {
  adminId: string;
  now: Date;
  /** Signs and checks uploads; needed only when new photos are posted. */
  uploads?: UploadGateway | null;
  /** Removes files of photos that left the list (queued when null or failing). */
  storage?: StorageGateway | null;
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const SLUG_TAKEN = { ok: false, code: "SLUG_TAKEN", fields: { slug: "taken" } } as const;
const UPLOAD_REJECTED = { ok: false, code: "UPLOAD_REJECTED", fields: { photos: "rejected" } } as const;
const NEEDS_PHOTO = { ok: false, code: "VALIDATION_FAILED", fields: { status: "photo" } } as const;

/** Thrown inside the transaction to roll it back with a refusal. */
class Refused extends Error {
  constructor(readonly result: SaveProductResult) {
    super(result.ok ? "ok" : result.code);
  }
}

interface PhotoPlan {
  posted: PhotoInput[];
  verified: Set<string>;
}

/** Writes the posted photo list, or refuses; returns the paths whose files must go. */
async function writePhotos(tx: Tx, productId: string, plan: PhotoPlan | null): Promise<string[]> {
  if (!plan) return [];
  const written = await replacePhotos(tx, productId, plan.posted, plan.verified);
  if (!written.ok) throw new Refused(UPLOAD_REJECTED);
  return written.removed;
}

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
    minQuantity: input.minQuantity,
    ...(input.seasonal === undefined ? {} : { seasonalStartsOn: input.seasonal?.startsOn ?? null, seasonalEndsOn: input.seasonal?.endsOn ?? null }),
    status: input.status,
    updatedAt: context.now,
    updatedBy: context.adminId,
  };
}

type Saved = { result: SaveProductResult; removed: string[] };

async function create(tx: Tx, input: ProductInput, slug: string, context: SaveProductContext, plan: PhotoPlan | null): Promise<Saved> {
  if (statusNeedsPhoto(input.status) && !plan?.posted.length) return { result: NEEDS_PHOTO, removed: [] };
  if (await slugTaken(tx, slug, undefined)) return { result: SLUG_TAKEN, removed: [] };
  const [last] = await tx.select({ value: max(product.sortOrder) }).from(product).where(eq(product.type, input.type));
  const sortOrder = last?.value === null || last?.value === undefined ? 0 : last.value + 1;
  const [created] = await tx
    .insert(product)
    .values({ ...columns(input, slug, context), sortOrder, createdAt: context.now })
    .returning({ id: product.id });
  await writePhotos(tx, created!.id, plan);
  if (input.optionGroups) await replaceOptionGroups(tx, created!.id, input.optionGroups);
  return { result: { ok: true, id: created!.id, slug }, removed: [] };
}

async function photoCount(tx: Tx, id: string, plan: PhotoPlan | null): Promise<number> {
  if (plan) return plan.posted.length;
  const [photos] = await tx.select({ n: count() }).from(productPhoto).where(eq(productPhoto.productId, id));
  return Number(photos?.n ?? 0);
}

async function update(tx: Tx, id: string, input: ProductInput, context: SaveProductContext, plan: PhotoPlan | null): Promise<Saved> {
  const refuse = (result: SaveProductResult): Saved => ({ result, removed: [] });
  const [existing] = await tx.select({ slug: product.slug }).from(product).where(eq(product.id, id)).for("update");
  if (!existing) return refuse({ ok: false, code: "NOT_FOUND" });
  const slug = input.slug ?? existing.slug;
  if (statusNeedsPhoto(input.status) && (await photoCount(tx, id, plan)) === 0) return refuse(NEEDS_PHOTO);
  if (slug !== existing.slug) {
    if (await slugTaken(tx, slug, id)) return refuse(SLUG_TAKEN);
    // Taking back one of its own old slugs: it is current again, not history.
    await tx.delete(productSlugHistory).where(eq(productSlugHistory.slug, slug));
    await tx.insert(productSlugHistory).values({ slug: existing.slug, productId: id, createdAt: context.now });
  }
  await tx.update(product).set(columns(input, slug, context)).where(eq(product.id, id));
  const removed = await writePhotos(tx, id, plan);
  if (input.optionGroups) await replaceOptionGroups(tx, id, input.optionGroups);
  return { result: { ok: true, id, slug }, removed };
}

/** Checks a posted photo list before the transaction (Storage reads are network calls). */
async function planPhotos(db: Database, input: ProductInput, context: SaveProductContext): Promise<PhotoPlan | null | "rejected"> {
  if (!input.photos) return null;
  const known = await storedPhotos(db, input.id);
  const check = { adminId: context.adminId, uploadSessionId: input.uploadSessionId, uploads: context.uploads ?? null };
  if (!(await photosAcceptable(db, input.photos, known, check))) return "rejected";
  return { posted: input.photos, verified: new Set(input.photos.map((p) => p.path).filter((path) => !known.has(path))) };
}

export async function saveProduct(db: Database, input: ProductInput, context: SaveProductContext): Promise<SaveProductResult> {
  const slug = input.slug ?? (input.id ? undefined : slugFromName(input.name.en));
  const plan = await planPhotos(db, input, context);
  if (plan === "rejected") return UPLOAD_REJECTED;
  let saved: Saved;
  try {
    saved = await db.transaction((tx) => (input.id ? update(tx, input.id, input, context, plan) : create(tx, input, slug!, context, plan)));
  } catch (error) {
    if (error instanceof Refused) return error.result;
    // Two saves racing for one slug: the unique index decides.
    if (isUniqueViolation(error, "product_slug_unique") || isUniqueViolation(error, "product_slug_history_pkey")) return SLUG_TAKEN;
    throw error;
  }
  await removePhotos(db, context.storage ?? null, saved.removed.filter(isStoragePath));
  return saved.result;
}
