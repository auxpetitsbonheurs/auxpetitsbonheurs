// `admin/settings` save (S-058, S-059, FR-067): the Owner's business values and site content
// in one versioned write (FR-054 style). The row is locked, its `version` compared with the
// one the page loaded (stale → SETTINGS_CHANGED, nothing saved), then written with
// `version + 1`. New hero or About image paths pass the same checks as product photos (issued
// to this Owner for this page session under `site/`, stored, image bytes, ≤ 1 MB); a replaced
// image's file is removed after commit (or queued). Money paths read Settings fresh, so a new
// fee applies to the next order; stored orders keep their own fee and number prefix.
import { eq, inArray, max } from "drizzle-orm";
import { type LocalizedText, orders, product, settings } from "~/db/schema";
import { PHOTO_MAX_EDGE, isIssuedSitePath } from "~/domain/upload";
import { policiesMissingEntries, privacyNoteMissingReviews } from "~/domain/settings";
import type { AfterResponse } from "~/server/after-response.server";
import type { InvoiceSettingsInput, SettingsInput } from "~/server/contracts/settings";
import type { Database, Executor } from "~/server/db.server";
import { siteSettingsCache } from "~/server/repos/settings.server";
import type { StorageGateway, UploadGateway } from "~/server/storage.server";
import { checkNewPhoto } from "./product-photos.server";
import { removePhotos } from "./storage-cleanup.server";

export type SaveSettingsResult =
  | { ok: true; version: number; warnings: { policies: boolean; privacyReviews: boolean } }
  | { ok: false; code: "SETTINGS_CHANGED" }
  | { ok: false; code: "VALIDATION_FAILED"; fields: Record<string, string> }
  | { ok: false; code: "UPLOAD_REJECTED"; fields: Record<string, string> };

export interface SaveSettingsContext {
  adminId: string;
  now: Date;
  uploadSessionId: string | null;
  uploads?: UploadGateway | null;
  storage?: StorageGateway | null;
  after?: AfterResponse;
}

type Row = typeof settings.$inferSelect;
type ImageField = "heroImagePath" | "aboutImagePath";

const storedImage = (row: Pick<Row, "hero" | "aboutImagePath">, field: ImageField) => (field === "heroImagePath" ? (row.hero?.imagePath ?? null) : row.aboutImagePath);

type ImageVariants = { heroImageVariants: number[]; aboutImageVariants: number[] };
const VARIANT_COLUMN = { heroImagePath: "heroImageVariants", aboutImagePath: "aboutImageVariants" } as const;

/**
 * Image fields whose posted path is new and fails the upload checks, and each image's variant
 * widths to store (S-276): kept for an unchanged image, checked in Storage for a new one
 * (Settings images carry no stored size, so every width up to the 1600 px edge is looked for).
 * A stale read here is harmless: the save's version check refuses a row changed since.
 */
async function checkImages(db: Database, input: SettingsInput, context: SaveSettingsContext): Promise<{ rejected: ImageField[]; variants: ImageVariants }> {
  const [row] = await db
    .select({ hero: settings.hero, aboutImagePath: settings.aboutImagePath, heroImageVariants: settings.heroImageVariants, aboutImageVariants: settings.aboutImageVariants })
    .from(settings)
    .where(eq(settings.id, 1));
  const fields: ImageField[] = ["heroImagePath", "aboutImagePath"];
  const checks = await Promise.all(
    fields.map(async (field): Promise<number[] | null> => {
      const path = input[field];
      if (path === null) return [];
      if (row && storedImage(row, field) === path) return row[VARIANT_COLUMN[field]];
      const { uploads, uploadSessionId, adminId } = context;
      if (!uploads || !uploadSessionId || !isIssuedSitePath(path, adminId, uploadSessionId)) return null;
      return checkNewPhoto(uploads, { path, width: PHOTO_MAX_EDGE, height: PHOTO_MAX_EDGE });
    }),
  );
  return { rejected: fields.filter((_, i) => !checks[i]), variants: { heroImageVariants: checks[0] ?? [], aboutImageVariants: checks[1] ?? [] } };
}

async function unknownFeatured(db: Database, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return false;
  const found = await db.select({ id: product.id }).from(product).where(inArray(product.id, ids));
  return found.length !== ids.length;
}

const localizedOrNull = (value: SettingsInput["about"]): LocalizedText | null => value;

function columns(input: SettingsInput, context: SaveSettingsContext) {
  const { heroTagline, heroImagePath, faq, ...rest } = input;
  return {
    deliveryFeeRs: rest.deliveryFeeRs,
    pickupAddress: rest.pickupAddress,
    pickupMapUrl: rest.pickupMapUrl,
    contactPhone: rest.contactPhone,
    contactWhatsapp: rest.contactWhatsapp,
    contactEmail: rest.contactEmail,
    juiceName: rest.juiceName,
    juiceNumber: rest.juiceNumber,
    paymentWhatsapp: rest.paymentWhatsapp,
    instagramUrl: rest.instagramUrl,
    facebookUrl: rest.facebookUrl,
    quoteValidityDays: rest.quoteValidityDays,
    cakeMessageMax: rest.cakeMessageMax,
    eveningReminderAt: rest.eveningReminderAt,
    orderNumberPrefix: rest.orderNumberPrefix,
    hero: heroTagline || heroImagePath ? { tagline: heroTagline ?? { en: "" }, imagePath: heroImagePath } : null,
    featuredProductIds: rest.featuredProductIds,
    about: localizedOrNull(rest.about),
    aboutImagePath: rest.aboutImagePath,
    // An empty list is the column's "no FAQ yet" (its default).
    faq: faq ?? [],
    policies: localizedOrNull(rest.policies),
    privacyNote: localizedOrNull(rest.privacyNote),
    // S-202: only when the form posted them; otherwise the stored templates stay.
    ...(rest.whatsappTemplates ? { whatsappTemplates: rest.whatsappTemplates } : {}),
    ...invoiceColumns(rest.invoice ?? null),
    updatedAt: context.now,
    updatedBy: context.adminId,
  };
}

/**
 * S-127: the invoice details when the form posted them; the counter only when the Owner changed
 * it (an invoice made since the page loaded has moved it on: a stale value must not go back).
 */
function invoiceColumns(invoice: InvoiceSettingsInput | null) {
  if (!invoice) return {};
  return {
    invoiceLegalName: invoice.legalName,
    invoiceBrn: invoice.brn,
    invoiceAddress: invoice.address,
    invoicePhone: invoice.phone,
    bankName: invoice.bankName,
    bankAccountName: invoice.bankAccountName,
    bankAccountNumber: invoice.bankAccountNumber,
    invoicePaymentTerms: invoice.paymentTerms,
    invoiceThankYou: invoice.thankYou,
    ...(invoice.nextNumber !== invoice.nextNumberWas ? { nextInvoiceNumber: invoice.nextNumber } : {}),
  };
}

/** The lowest next invoice number allowed: one more than the highest already given to an order. */
async function lowestFreeInvoiceNumber(tx: Executor): Promise<number> {
  const [row] = await tx.select({ max: max(orders.invoiceNumber) }).from(orders);
  return (row?.max ?? 0) + 1;
}

/** Names of the columns whose value changes (logged; never the values: contact data). */
function changedKeys(before: Row, after: ReturnType<typeof columns>): string[] {
  return Object.keys(after)
    .filter((key) => key !== "updatedAt" && key !== "updatedBy")
    .filter((key) => JSON.stringify(before[key as keyof Row] ?? null) !== JSON.stringify(after[key as keyof typeof after] ?? null));
}

export async function saveSettings(db: Database, version: number, input: SettingsInput, context: SaveSettingsContext): Promise<SaveSettingsResult> {
  if (await unknownFeatured(db, input.featuredProductIds)) return { ok: false, code: "VALIDATION_FAILED", fields: { featuredProductIds: "unknown" } };
  const { rejected, variants } = await checkImages(db, input, context);
  if (rejected.length > 0) return { ok: false, code: "UPLOAD_REJECTED", fields: Object.fromEntries(rejected.map((field) => [field, "rejected"])) };
  const values = { ...columns(input, context), ...variants };
  const saved = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(settings).where(eq(settings.id, 1)).for("update");
    if (!row || row.version !== version) return null;
    // S-127: Settings is locked, so no invoice can take a number while this is checked.
    const counter = input.invoice && input.invoice.nextNumber !== input.invoice.nextNumberWas ? input.invoice.nextNumber : null;
    const lowest = counter === null ? 0 : await lowestFreeInvoiceNumber(tx);
    if (counter !== null && counter < lowest) return { usedBelow: lowest };
    await tx.update(settings).set({ ...values, version: row.version + 1 }).where(eq(settings.id, 1));
    return { before: row, version: row.version + 1 };
  });
  if (!saved) return { ok: false, code: "SETTINGS_CHANGED" };
  if ("usedBelow" in saved) return { ok: false, code: "VALIDATION_FAILED", fields: { invoiceNextNumber: `used:${saved.usedBelow}` } };
  siteSettingsCache.clear();
  console.log(JSON.stringify({ level: "info", event: "settings_saved", actorRole: "owner", changed: changedKeys(saved.before, values) }));
  const replaced = (["heroImagePath", "aboutImagePath"] as const)
    .map((field) => storedImage(saved.before, field))
    .filter((path): path is string => path !== null && path.startsWith("site/") && path !== input.heroImagePath && path !== input.aboutImagePath);
  if (replaced.length > 0) {
    const cleanUp = () => removePhotos(db, context.storage ?? null, replaced);
    if (context.after) context.after.defer("remove-photos", cleanUp);
    else await cleanUp();
  }
  return { ok: true, version: saved.version, warnings: { policies: policiesMissingEntries(input.policies), privacyReviews: privacyNoteMissingReviews(input.privacyNote) } };
}
