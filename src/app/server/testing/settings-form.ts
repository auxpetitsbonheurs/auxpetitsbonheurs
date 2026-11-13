// The Settings form as the page posts it (every field, unchanged ones as loaded), for route
// and service tests of `admin/settings` save (S-058, S-059).
import type { TestDatabase } from "~/db/testing/pglite";
import { readOwnerSettings } from "~/server/repos/owner-settings.server";
import type { Database } from "~/server/db.server";

export async function loadedSettingsForm(database: TestDatabase, overrides: Record<string, string | string[]> = {}): Promise<Record<string, string | string[]>> {
  const s = await readOwnerSettings(database.db as unknown as Database);
  const text = (value: string | null) => value ?? "";
  const pair = (name: string, value: { en: string; fr?: string } | null) => ({ [`${name}.en`]: value?.en ?? "", [`${name}.fr`]: value?.fr ?? "" });
  return {
    intent: "save",
    version: String(s.version),
    deliveryFeeRs: String(s.deliveryFeeRs),
    pickupAddress: text(s.pickupAddress),
    pickupMapUrl: text(s.pickupMapUrl),
    contactPhone: text(s.contactPhone),
    contactWhatsapp: text(s.contactWhatsapp),
    contactEmail: text(s.contactEmail),
    juiceName: text(s.juiceName),
    juiceNumber: text(s.juiceNumber),
    paymentWhatsapp: text(s.paymentWhatsapp),
    instagramUrl: text(s.instagramUrl),
    quoteValidityDays: String(s.quoteValidityDays),
    cakeMessageMax: String(s.cakeMessageMax),
    eveningReminderAt: s.eveningReminderAt,
    orderNumberPrefix: s.orderNumberPrefix,
    ...pair("heroTagline", s.heroTagline),
    heroImagePath: text(s.heroImagePath),
    featuredProductIds: s.featuredProductIds,
    ...pair("about", s.about),
    aboutImagePath: text(s.aboutImagePath),
    ...pair("faq", s.faq),
    ...pair("policies", s.policies),
    ...pair("privacyNote", s.privacyNote),
    ...overrides,
  };
}
