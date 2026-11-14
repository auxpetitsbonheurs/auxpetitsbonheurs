// Reads for the Owner's Settings and Availability screens (contracts.md `admin/settings`,
// `admin/availability`). Always fresh (never the per-isolate cache): the page carries the
// `version` its save is checked against.
import { asc, eq } from "drizzle-orm";
import { type FaqEntry, type LocalizedText, type TimeWindow, product, settings } from "~/db/schema";
import type { Database } from "~/server/db.server";
import type { WhatsappTemplates } from "~/db/tables/json-types";
import { DEFAULT_WHATSAPP_TEMPLATES, WHATSAPP_TEMPLATE_KEYS } from "~/domain/whatsapp";

type Row = typeof settings.$inferSelect;

async function row(db: Database): Promise<Row> {
  const [found] = await db.select().from(settings).where(eq(settings.id, 1));
  if (!found) throw new Error("settings row 1 is missing (run the migrations)");
  return found;
}

/** `{ en, fr }` or null; `[]` (the column default) and blank English read as none. */
export function localizedOrNull(value: LocalizedText | FaqEntry[] | null | undefined): LocalizedText | null {
  if (!value || Array.isArray(value) || value.en.trim() === "") return null;
  return value;
}

export interface OwnerSettings {
  version: number;
  deliveryFeeRs: number;
  pickupAddress: string | null;
  pickupMapUrl: string | null;
  contactPhone: string | null;
  contactWhatsapp: string | null;
  contactEmail: string | null;
  juiceName: string | null;
  juiceNumber: string | null;
  paymentWhatsapp: string | null;
  instagramUrl: string | null;
  quoteValidityDays: number;
  cakeMessageMax: number;
  eveningReminderAt: string;
  orderNumberPrefix: string;
  heroTagline: LocalizedText | null;
  heroImagePath: string | null;
  featuredProductIds: string[];
  about: LocalizedText | null;
  aboutImagePath: string | null;
  faq: LocalizedText | null;
  policies: LocalizedText | null;
  privacyNote: LocalizedText | null;
  /** S-202: every template, the Owner's text or the default (an empty French one stays empty). */
  whatsappTemplates: WhatsappTemplates;
}

/** The Settings row minus availability (contracts.md `admin/settings` loader). */
export async function readOwnerSettings(db: Database): Promise<OwnerSettings> {
  const r = await row(db);
  return {
    version: r.version,
    deliveryFeeRs: r.deliveryFeeRs,
    pickupAddress: r.pickupAddress,
    pickupMapUrl: r.pickupMapUrl,
    contactPhone: r.contactPhone,
    contactWhatsapp: r.contactWhatsapp,
    contactEmail: r.contactEmail,
    juiceName: r.juiceName,
    juiceNumber: r.juiceNumber,
    paymentWhatsapp: r.paymentWhatsapp,
    instagramUrl: r.instagramUrl,
    quoteValidityDays: r.quoteValidityDays,
    cakeMessageMax: r.cakeMessageMax,
    eveningReminderAt: r.eveningReminderAt,
    orderNumberPrefix: r.orderNumberPrefix,
    heroTagline: localizedOrNull(r.hero?.tagline),
    heroImagePath: r.hero?.imagePath ?? null,
    featuredProductIds: r.featuredProductIds,
    about: localizedOrNull(r.about),
    aboutImagePath: r.aboutImagePath,
    faq: localizedOrNull(r.faq),
    policies: localizedOrNull(r.policies),
    privacyNote: localizedOrNull(r.privacyNote),
    whatsappTemplates: Object.fromEntries(
      WHATSAPP_TEMPLATE_KEYS.map((key) => [key, r.whatsappTemplates?.[key]?.en ? r.whatsappTemplates[key] : DEFAULT_WHATSAPP_TEMPLATES[key]]),
    ) as WhatsappTemplates,
  };
}

export interface AvailabilityRules {
  version: number;
  defaultNoticeDays: number;
  closedWeekdays: number[];
  deliveryWindows: TimeWindow[];
  pickupWindows: TimeWindow[];
}

export async function readAvailabilityRules(db: Database): Promise<AvailabilityRules> {
  const [found] = await db
    .select({
      version: settings.version,
      defaultNoticeDays: settings.defaultNoticeDays,
      closedWeekdays: settings.closedWeekdays,
      deliveryWindows: settings.deliveryWindows,
      pickupWindows: settings.pickupWindows,
    })
    .from(settings)
    .where(eq(settings.id, 1));
  if (!found) throw new Error("settings row 1 is missing (run the migrations)");
  return found;
}

export interface FeaturableProduct {
  id: string;
  name: LocalizedText;
  status: "available" | "sold_out" | "hidden";
}

/** Every product the Owner may feature, in menu order (hidden and sold out are flagged; S-059 AC5). */
export async function listFeaturableProducts(db: Database): Promise<FeaturableProduct[]> {
  const rows = await db
    .select({ id: product.id, nameEn: product.nameEn, nameFr: product.nameFr, status: product.status })
    .from(product)
    .orderBy(asc(product.type), asc(product.sortOrder), asc(product.nameEn));
  return rows.map((r) => ({ id: r.id, name: r.nameFr ? { en: r.nameEn, fr: r.nameFr } : { en: r.nameEn }, status: r.status }));
}
