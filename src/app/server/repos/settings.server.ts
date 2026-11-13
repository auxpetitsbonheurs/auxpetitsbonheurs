import { eq, getTableColumns, sql } from "drizzle-orm";
import { type LocalizedText, type TimeWindow, blockedDate, settings } from "~/db/schema";
import type { AvailabilityRules, DateRange } from "~/domain/availability";
import { safeWebUrl } from "~/lib/contact";
import type { Database } from "~/server/db.server";
import { SETTINGS_TTL_MS, createTtlCache } from "~/server/settings-cache.server";

export interface FooterContacts {
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  pickupAddress: string | null;
  /** Only an http(s) link (S-061 AC1, AC6); anything else is dropped. */
  instagramUrl: string | null;
  /** The pickup address's map link, http(s) only. */
  mapUrl: string | null;
}

const present = (value: string | null | undefined) => (value && value.trim() !== "" ? value.trim() : null);

type SettingsRow = typeof settings.$inferSelect;

async function settingsRow(db: Database): Promise<SettingsRow> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  if (!row) throw new Error("settings row 1 is missing (run the migrations)");
  return row;
}

type FooterRow = Pick<SettingsRow, "contactWhatsapp" | "contactPhone" | "contactEmail" | "pickupAddress" | "instagramUrl" | "pickupMapUrl">;

function footerFrom(row: FooterRow | undefined): FooterContacts {
  return {
    whatsapp: present(row?.contactWhatsapp),
    phone: present(row?.contactPhone),
    email: present(row?.contactEmail),
    pickupAddress: present(row?.pickupAddress),
    instagramUrl: safeWebUrl(row?.instagramUrl),
    mapUrl: safeWebUrl(row?.pickupMapUrl),
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
      instagramUrl: settings.instagramUrl,
      pickupMapUrl: settings.pickupMapUrl,
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

/** Home page Settings (S-063; edited in S-058/S-059): hero tagline and photo, featured products in order. */
export interface HomeSettings {
  tagline: LocalizedText | null;
  heroImagePath: string | null;
  /** Widths of the hero image's smaller copies (S-276). Optional: absent from copies cached before. */
  heroImageVariants?: number[];
  featuredProductIds: string[];
}

export interface SiteSettings {
  footer: FooterContacts;
  checkout: CheckoutSettings;
  /** Default notice in days, shown on the Custom order page (S-252 AC5): never typed twice. */
  noticeDays: number;
  /**
   * The public date rules (S-083): notice, closed weekdays and every blocked range without
   * its private reason (FR-014). Callers keep the ranges that matter from their own today.
   */
  availability: AvailabilityRules;
  home: HomeSettings;
  /** Message-on-cake limit (S-067); placeOrder re-reads it fresh. */
  cakeMessageMax: number;
}

function homeFrom(row: SettingsRow): HomeSettings {
  const tagline = row.hero?.tagline && row.hero.tagline.en.trim() !== "" ? row.hero.tagline : null;
  return { tagline, heroImagePath: present(row.hero?.imagePath), heroImageVariants: row.heroImageVariants, featuredProductIds: row.featuredProductIds };
}

/** Every block as a range only, in the same statement as the Settings row (one round trip). */
const blockedRanges = sql<DateRange[] | string>`coalesce((
  select json_agg(json_build_object('startsOn', to_char(b.starts_on, 'YYYY-MM-DD'), 'endsOn', to_char(b.ends_on, 'YYYY-MM-DD')) order by b.starts_on, b.ends_on)
  from ${blockedDate} b
), '[]'::json)`;

async function siteSettingsRow(db: Database): Promise<SettingsRow & { blocked: DateRange[] }> {
  const [row] = await db.select({ ...getTableColumns(settings), blocked: blockedRanges }).from(settings).where(eq(settings.id, 1));
  if (!row) throw new Error("settings row 1 is missing (run the migrations)");
  return { ...row, blocked: typeof row.blocked === "string" ? (JSON.parse(row.blocked) as DateRange[]) : row.blocked };
}

/** Per isolate, for SETTINGS_TTL_MS: pages that only display Settings skip the round trip. */
export const siteSettingsCache = createTtlCache<SiteSettings>(SETTINGS_TTL_MS);

/**
 * Footer, checkout, date rules and home Settings for display, from one query, cached per
 * isolate (Settings and Availability saves clear it). Never use it where money is decided:
 * placeOrder reads getCheckoutSettings fresh, so an edited fee or window is enforced at once
 * (a page showing the old fee gets PRICE_CHANGED).
 */
export function getSiteSettings(db: Database): Promise<SiteSettings> {
  return siteSettingsCache.get(async () => {
    const row = await siteSettingsRow(db);
    const availability = { defaultNoticeDays: row.defaultNoticeDays, closedWeekdays: row.closedWeekdays, blocked: row.blocked };
    return { footer: footerFrom(row), checkout: checkoutFrom(row), noticeDays: row.defaultNoticeDays, availability, home: homeFrom(row), cakeMessageMax: row.cakeMessageMax };
  });
}
