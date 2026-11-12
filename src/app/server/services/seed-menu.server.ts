// `npm run seed:menu` (S-241): loads the Owner's real menu (app/db/menu-data.ts) on staging.
// Insert-only by slug, so a re-run never duplicates and never touches what the Owner edited:
// a slug that is a product's current slug or in anyone's slug history is "already present".
// The one exception is the S-011 sample "Chocolate cake" while still unedited (sample
// description and Rs 850): it becomes the real Chocolate Cake in place, same id, so staging
// orders keep their link (AC8). Never deletes anything. Refuses any APP_ENV but staging.
import { and, eq, inArray, max } from "drizzle-orm";
import { MENU_PRODUCTS, type MenuSeedProduct } from "~/db/menu-data";
import { SAMPLE_PRODUCT } from "~/db/sample-data";
import { product, productSlugHistory } from "~/db/schema";
import { slugFromName } from "~/domain/product";
import type { OptionGroupInput } from "~/domain/options";
import { PUBLIC_IMAGES_BUCKET } from "~/lib/images";
import type { Database } from "~/server/db.server";
import type { StorageGateway } from "~/server/storage.server";
import { type MenuPhotoUploads, type PreparedPhoto, uploadMenuPhoto } from "./menu-photos.server";
import { isUniqueViolation } from "./place-order.server";
import { replaceOptionGroups } from "./product-options.server";
import { replacePhotos } from "./product-photos.server";

export class SeedMenuRefused extends Error {
  readonly code = "SEED_MENU_REFUSED";
}

export type SeedMenuOutcome = "created" | "already present" | "sample replaced" | "sample edited, left alone";

export interface SeedMenuLine {
  slug: string;
  name: string;
  outcome: SeedMenuOutcome;
  status: "available" | "hidden" | null;
}

export interface SeedMenuReport {
  lines: SeedMenuLine[];
  /** Placeholder-priced products still at Rs 0, in menu order (AC4). */
  pricesToEnter: string[];
  /** Content the source still lacks, by product (description, photo). */
  missing: string[];
}

export interface SeedMenuContext {
  appEnv: string | undefined;
  now: Date;
  /** Upload id for this run: photos go under `products/<seed>/<runId>/`. */
  runId: string;
  uploads: MenuPhotoUploads;
  /** Removes an uploaded photo whose product could not be written (best effort). */
  storage: StorageGateway;
  /** The prepared (resized, re-encoded) photo for a source file name. */
  photo: (file: string) => Promise<PreparedPhoto>;
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Only staging: production gets its real menu at E-12 (launch content). */
export function assertSeedAllowed(appEnv: string | undefined): void {
  if (appEnv !== "staging") throw new SeedMenuRefused(`seed:menu runs only with APP_ENV=staging (got ${appEnv === undefined ? "nothing" : JSON.stringify(appEnv)}); nothing was written`);
}

const optionGroups = (entry: MenuSeedProduct): OptionGroupInput[] => [
  {
    name: { en: entry.options.nameEn, fr: entry.options.nameFr },
    kind: "single",
    required: true,
    textMaxLength: null,
    quantityMin: null,
    quantityMax: null,
    choices: entry.options.choices.map((c) => ({ name: { en: c.nameEn, fr: c.nameFr }, priceDeltaRs: entry.pricePlaceholder ? 0 : c.priceDeltaRs })),
  },
];

/** Placeholder prices or no photo: hidden, so it can never be ordered (AC4, AC5). */
const statusOf = (entry: MenuSeedProduct) => (entry.pricePlaceholder || !entry.photo ? ("hidden" as const) : ("available" as const));

function columns(entry: MenuSeedProduct, slug: string, now: Date) {
  return {
    slug,
    type: entry.type,
    nameEn: entry.nameEn,
    nameFr: null,
    descriptionEn: entry.descriptionEn,
    descriptionFr: null,
    basePriceRs: entry.pricePlaceholder ? 0 : entry.basePriceRs,
    status: statusOf(entry),
    updatedAt: now,
    updatedBy: null,
  };
}

async function nextSortOrder(tx: Tx, type: MenuSeedProduct["type"]): Promise<number> {
  const [last] = await tx.select({ value: max(product.sortOrder) }).from(product).where(eq(product.type, type));
  return last?.value === null || last?.value === undefined ? 0 : last.value + 1;
}

type Existing = { kind: "none" } | { kind: "present" } | { kind: "sample"; id: string; unedited: boolean };

async function existing(db: Database, slug: string): Promise<Existing> {
  const [current] = await db
    .select({ id: product.id, nameEn: product.nameEn, descriptionEn: product.descriptionEn, basePriceRs: product.basePriceRs })
    .from(product)
    .where(eq(product.slug, slug));
  // Still recognisably the sample (its name or its description); the real one is just present.
  const looksLikeSample = current && (current.nameEn === SAMPLE_PRODUCT.nameEn || current.descriptionEn === SAMPLE_PRODUCT.descriptionEn);
  if (current && slug === SAMPLE_PRODUCT.slug && looksLikeSample) {
    const unedited = current.descriptionEn === SAMPLE_PRODUCT.descriptionEn && current.basePriceRs === SAMPLE_PRODUCT.basePriceRs;
    return { kind: "sample", id: current.id, unedited };
  }
  if (current) return { kind: "present" };
  const [old] = await db.select({ slug: productSlugHistory.slug }).from(productSlugHistory).where(eq(productSlugHistory.slug, slug));
  return old ? { kind: "present" } : { kind: "none" };
}

async function writeProduct(tx: Tx, entry: MenuSeedProduct, slug: string, now: Date, sampleId: string | null): Promise<string> {
  const sortOrder = await nextSortOrder(tx, entry.type);
  if (sampleId) {
    await tx.update(product).set({ ...columns(entry, slug, now), sortOrder }).where(and(eq(product.id, sampleId), eq(product.slug, slug)));
    return sampleId;
  }
  const [created] = await tx
    .insert(product)
    .values({ ...columns(entry, slug, now), sortOrder, createdAt: now })
    .returning({ id: product.id });
  return created!.id;
}

/** Uploads the photo (checked like an editor save), then writes the product in one transaction. */
async function seedOne(db: Database, entry: MenuSeedProduct, slug: string, context: SeedMenuContext, sampleId: string | null): Promise<void> {
  const photo = entry.photo ? await uploadMenuPhoto(db, context.uploads, context.runId, await context.photo(entry.photo)) : null;
  try {
    await db.transaction(async (tx) => {
      const id = await writeProduct(tx, entry, slug, context.now, sampleId);
      // The sample's bundled photo leaves the list; it is not a Storage file, so nothing to remove.
      if (photo || sampleId) {
        const written = await replacePhotos(tx, id, photo ? [photo] : [], new Set(photo ? [photo.path] : []));
        if (!written.ok) throw new Error("photo could not be linked");
      }
      await replaceOptionGroups(tx, id, optionGroups(entry));
    });
  } catch (error) {
    if (photo) await context.storage.remove(PUBLIC_IMAGES_BUCKET, [photo.path]).catch(() => undefined);
    throw error;
  }
}

function missingContent(entry: MenuSeedProduct): string[] {
  return [...(entry.descriptionEn ? [] : [`${entry.nameEn}: description`]), ...(entry.photo ? [] : [`${entry.nameEn}: photo`])];
}

async function seedEntry(db: Database, entry: MenuSeedProduct, context: SeedMenuContext): Promise<SeedMenuLine> {
  const slug = slugFromName(entry.nameEn);
  const found = await existing(db, slug);
  const line = (outcome: SeedMenuOutcome, status: SeedMenuLine["status"] = null): SeedMenuLine => ({ slug, name: entry.nameEn, outcome, status });
  if (found.kind === "present") return line("already present");
  if (found.kind === "sample" && !found.unedited) return line("sample edited, left alone");
  try {
    await seedOne(db, entry, slug, context, found.kind === "sample" ? found.id : null);
  } catch (error) {
    // Another run created it meanwhile: the unique slug decides, nothing is duplicated.
    if (isUniqueViolation(error, "product_slug_unique")) return line("already present");
    throw error;
  }
  return line(found.kind === "sample" ? "sample replaced" : "created", statusOf(entry));
}

export async function seedMenu(db: Database, context: SeedMenuContext): Promise<SeedMenuReport> {
  assertSeedAllowed(context.appEnv);
  const lines: SeedMenuLine[] = [];
  for (const entry of MENU_PRODUCTS) lines.push(await seedEntry(db, entry, context));
  return { lines, pricesToEnter: await pricesToEnter(db), missing: MENU_PRODUCTS.flatMap(missingContent) };
}

/** Placeholder-priced products still at Rs 0 (the Owner has not typed a price yet). */
async function pricesToEnter(db: Database): Promise<string[]> {
  const placeholders = MENU_PRODUCTS.filter((e) => e.pricePlaceholder);
  const rows = await db
    .select({ slug: product.slug, name: product.nameEn })
    .from(product)
    .where(and(inArray(product.slug, placeholders.map((e) => slugFromName(e.nameEn))), eq(product.basePriceRs, 0)));
  const bySlug = new Map(rows.map((r) => [r.slug, r.name]));
  return placeholders.map((e) => bySlug.get(slugFromName(e.nameEn))).filter((name): name is string => name !== undefined);
}

