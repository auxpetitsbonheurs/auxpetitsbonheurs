import { eq } from "drizzle-orm";
import { type LocalizedText, type TimeWindow, settings } from "~/db/schema";
import type { Database } from "~/server/db.server";
import { SETTINGS_TTL_MS, createTtlCache } from "~/server/settings-cache.server";

export interface FooterContacts {
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  pickupAddress: string | null;
}

const present = (value: string | null | undefined) => (value && value.trim() !== "" ? value.trim() : null);

type SettingsRow = typeof settings.$inferSelect;

async function settingsRow(db: Database): Promise<SettingsRow> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  if (!row) throw new Error("settings row 1 is missing (run the migrations)");
  return row;
}

function footerFrom(row: Pick<SettingsRow, "contactWhatsapp" | "contactPhone" | "contactEmail" | "pickupAddress"> | undefined): FooterContacts {
  return {
    whatsapp: present(row?.contactWhatsapp),
    phone: present(row?.contactPhone),
    email: present(row?.contactEmail),
    pickupAddress: present(row?.pickupAddress),
  };
}

/** Contact values shown in every page footer; blank Settings values are omitted (catalogue spec). */
export async function getFooterContacts(db: Database): Promise<FooterContacts> {
  const [row] = await db
    .select({
      contactWhatsapp: settings.contactWhatsapp,
      contactPhone: settings.contactPhone,
      contactEmail: settings.contactEmail,
      pickupAddress: settings.pickupAddress,
    })
    .from(settings)
    .where(eq(settings.id, 1));
  return footerFrom(row);
}

export interface CheckoutSettings {
  deliveryFeeRs: number;
  windows: { delivery: TimeWindow[]; pickup: TimeWindow[] };
  pickup: { address: string | null; mapUrl: string | null };
  payment: { juiceNumber: string | null };
  policies: LocalizedText | null;
  orderNumberPrefix: string;
}

function checkoutFrom(row: SettingsRow): CheckoutSettings {
  return {
    deliveryFeeRs: row.deliveryFeeRs,
    windows: { delivery: row.deliveryWindows, pickup: row.pickupWindows },
    pickup: { address: present(row.pickupAddress), mapUrl: present(row.pickupMapUrl) },
    payment: { juiceNumber: present(row.juiceNumber) },
    policies: row.policies && row.policies.en.trim() !== "" ? row.policies : null,
    orderNumberPrefix: row.orderNumberPrefix,
  };
}

/** The Settings values checkout uses (fee, windows, pickup, payment, policies, number prefix). Always fresh. */
export async function getCheckoutSettings(db: Database): Promise<CheckoutSettings> {
  return checkoutFrom(await settingsRow(db));
}

export interface SiteSettings {
  footer: FooterContacts;
  checkout: CheckoutSettings;
  /** Default notice in days, shown on the Custom order page (S-252 AC5): never typed twice. */
  noticeDays: number;
}

/** Per isolate, for SETTINGS_TTL_MS: pages that only display Settings skip the round trip. */
export const siteSettingsCache = createTtlCache<SiteSettings>(SETTINGS_TTL_MS);

/**
 * Footer and checkout Settings for display, from one query, cached per isolate. Never use it
 * where money is decided: placeOrder reads getCheckoutSettings fresh, so an edited fee or
 * window is enforced at once (a page showing the old fee gets PRICE_CHANGED).
 */
export function getSiteSettings(db: Database): Promise<SiteSettings> {
  return siteSettingsCache.get(async () => {
    const row = await settingsRow(db);
    return { footer: footerFrom(row), checkout: checkoutFrom(row), noticeDays: row.defaultNoticeDays };
  });
}
