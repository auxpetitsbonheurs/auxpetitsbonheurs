// The admin order's WhatsApp menu (S-201, S-203; spec "WhatsApp templates"): each template
// resolved server-side in the ORDER's language with that order's values, as ready wa.me links.
// No state change and nothing recorded about what is sent (the admin edits it in WhatsApp).
import { eq } from "drizzle-orm";
import { settings } from "~/db/schema";
import type { TimeWindow, WhatsappTemplateKey, WhatsappTemplates } from "~/db/tables/json-types";
import { addDays, formatLongDate, todayMU } from "~/domain/time";
import { WHATSAPP_TEMPLATE_KEYS, type WhatsappValues, fillTemplate, templateText, whatsappLinkFor } from "~/domain/whatsapp";
import { t } from "~/i18n/catalog.server";
import { localized } from "~/i18n/localized";
import { type Locale, formatRupees, localePath } from "~/lib/locale";
import type { Executor } from "~/server/db.server";
import { firstName } from "~/server/notify/push-text.server";

export interface WhatsappSettings {
  templates: Partial<WhatsappTemplates> | null;
  juiceNumber: string | null;
  pickupAddress: string | null;
}

export async function readWhatsappSettings(db: Executor): Promise<WhatsappSettings> {
  const [row] = await db
    .select({ templates: settings.whatsappTemplates, juiceNumber: settings.juiceNumber, pickupAddress: settings.pickupAddress })
    .from(settings)
    .where(eq(settings.id, 1))
    .limit(1);
  return { templates: row?.templates ?? null, juiceNumber: row?.juiceNumber ?? null, pickupAddress: row?.pickupAddress ?? null };
}

export interface WhatsappOrder {
  /** Formatted, "APB-0042". */
  number: string;
  contactName: string;
  contactPhone: string;
  locale: Locale;
  fulfilment: string;
  fulfilOn: string;
  window: TimeWindow;
  totalRs: number;
  trackingToken: string;
}

/** The placeholder values for one order, in the order's language (spec placeholder list). */
export function whatsappValues(order: WhatsappOrder, shop: WhatsappSettings, origin: string): WhatsappValues {
  const { locale } = order;
  return {
    name: firstName(order.contactName),
    order_number: order.number,
    date: formatLongDate(order.fulfilOn, locale),
    window: t("checkout.windowLabel", locale, { label: localized(order.window.label, locale), start: order.window.start, end: order.window.end }),
    total: formatRupees(order.totalRs, locale),
    juice_number: shop.juiceNumber,
    pickup_address: order.fulfilment === "pickup" ? shop.pickupAddress : null,
    tracking_link: `${origin}${localePath(locale, `/t/${order.trackingToken}`)}`,
  };
}

/** The resolved message for one template (S-201 AC1, AC2, AC4, AC5). */
export function whatsappMessage(key: WhatsappTemplateKey, order: WhatsappOrder, shop: WhatsappSettings, origin: string): string {
  return fillTemplate(templateText(shop.templates, key, order.locale), whatsappValues(order, shop, origin));
}

export interface WhatsappMenuItem {
  key: WhatsappTemplateKey;
  /** In the admin's language. */
  label: string;
  url: string;
}

/** Sample values for the Settings preview (S-202 AC1): a pickup order of Rs 1,250 three days from now. */
export function whatsappPreviewSample(
  shop: { juiceNumber: string | null; pickupAddress: string | null; orderNumberPrefix: string },
  origin: string,
  now: Date,
): Record<Locale, WhatsappValues> {
  const order = (locale: Locale): WhatsappOrder => ({
    number: `${shop.orderNumberPrefix}0042`,
    contactName: "Aisha",
    contactPhone: "+23057123456",
    locale,
    fulfilment: "pickup",
    fulfilOn: addDays(todayMU(now), 3),
    window: { id: "morning", label: { en: "Morning", fr: "Matin" }, start: "09:00", end: "12:00" },
    totalRs: 1250,
    trackingToken: "sample",
  });
  const sample: WhatsappSettings = { templates: null, juiceNumber: shop.juiceNumber ?? "5712 0000", pickupAddress: shop.pickupAddress };
  return { en: whatsappValues(order("en"), sample, origin), fr: whatsappValues(order("fr"), sample, origin) };
}

/** Every template as a wa.me link, or null when the order has no usable phone (S-203 AC2). */
export function whatsappMenu(order: WhatsappOrder, shop: WhatsappSettings, origin: string, adminLocale: Locale): WhatsappMenuItem[] | null {
  if (!whatsappLinkFor(order.contactPhone)) return null;
  return WHATSAPP_TEMPLATE_KEYS.map((key) => ({
    key,
    label: t(`admin.order.whatsappTemplates.${key}`, adminLocale),
    url: whatsappLinkFor(order.contactPhone, whatsappMessage(key, order, shop, origin))!,
  }));
}
