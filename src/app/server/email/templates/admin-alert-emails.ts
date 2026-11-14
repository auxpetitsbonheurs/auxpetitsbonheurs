// Admin alert emails (S-195; spec "Alert matrix", contracts.md `EmailTemplate` admin keys):
// one line and a deep link to the order, in the admin's own locale, on the same branded layout
// as the customer emails. NFR-004 (AC8): the order number and the customer's first name only,
// never an address, phone or items. Same words as the push, so both channels read alike.
import { t } from "~/i18n/catalog.server";
import type { Locale } from "~/lib/locale";
import { firstName } from "~/server/notify/push-text.server";
import { type RenderedEmail, renderEmail } from "./layout";

export const ADMIN_ALERT_EVENTS = {
  admin_alert_new_order: "new_order",
  admin_alert_new_request: "new_request",
  admin_alert_quote_accepted: "quote_accepted",
  admin_alert_quote_declined: "quote_declined",
  admin_alert_customer_cancelled: "customer_cancelled",
  // E-15 S-307: number and first name only, never the allergies, the people's names or the message.
  admin_alert_new_workshop: "new_workshop",
} as const;

export type AdminAlertKey = keyof typeof ADMIN_ALERT_EVENTS;

export const ADMIN_ALERT_KEYS = Object.keys(ADMIN_ALERT_EVENTS) as AdminAlertKey[];

export const isAdminAlertKey = (value: string): value is AdminAlertKey => Object.hasOwn(ADMIN_ALERT_EVENTS, value);

export interface AdminAlertData {
  siteUrl: string;
  locale: Locale;
  orderId: string;
  /** "APB-0042" */
  orderNumber: string;
  contactName: string | null;
}

export function renderAdminAlertEmail(key: AdminAlertKey, data: AdminAlertData): RenderedEmail {
  const event = ADMIN_ALERT_EVENTS[key];
  const { locale } = data;
  const name = firstName(data.contactName);
  const title = t(`admin.push.${event}.title`, locale, { number: data.orderNumber });
  const line = name ? t(`email.adminAlert.${event}.line`, locale, { name }) : t(`email.adminAlert.${event}.lineNoName`, locale);
  const href = `${new URL(data.siteUrl).origin}/admin/orders/${data.orderId}`;
  return renderEmail({
    locale,
    siteUrl: data.siteUrl,
    subject: title,
    heading: title,
    blocks: [
      { kind: "p", text: line },
      { kind: "button", label: t("email.adminAlert.open", locale), href },
    ],
    footer: t("email.adminAlert.footer", locale),
  });
}
