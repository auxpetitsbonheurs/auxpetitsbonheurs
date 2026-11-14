// Push texts (spec "Alert matrix", contracts.md "Push payload"), in each admin's own locale.
// NFR-004: a payload carries the order number and the customer's first name only (no address,
// phone or items). `tag` = `<event>:<id>`, so a repeat replaces the earlier one on the device.
import { t } from "~/i18n/catalog.server";
import type { Locale } from "~/lib/locale";
import type { PushPayload } from "~/server/push/push.server";

/** The order events that alert admins (push for all; email too for the first five, S-195). */
export const ORDER_ALERTS = ["new_order", "new_request", "quote_accepted", "quote_declined", "customer_cancelled", "quote_expired", "pending_24h", "new_workshop"] as const;
export type OrderAlert = (typeof ORDER_ALERTS)[number];

export interface AlertOrder {
  id: string;
  /** Formatted, e.g. "APB-0042". */
  orderNumber: string;
  /** Contact name as entered; only its first word is used. */
  contactName: string | null;
}

/** First word of the contact name (no surname in a lock-screen notification). */
export function firstName(name: string | null): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

export function orderAlertPayload(event: OrderAlert, order: AlertOrder, locale: Locale): PushPayload {
  const name = firstName(order.contactName);
  return {
    title: t(`admin.push.${event}.title`, locale, { number: order.orderNumber }),
    body: name ? t(`admin.push.${event}.body`, locale, { name }) : t(`admin.push.${event}.bodyNoName`, locale),
    url: `/admin/orders/${order.id}`,
    tag: `${event}:${order.id}`,
  };
}

/** S-198: "Tomorrow: 3 orders", opening tomorrow's prep list. */
export function eveningReminderPayload(count: number, tomorrow: string, locale: Locale): PushPayload {
  return {
    title: t("admin.push.evening_reminder.title", locale, { count }),
    body: t("admin.push.evening_reminder.body", locale),
    url: `/admin/calendar/${tomorrow}/prep`,
    tag: `evening_reminder:${tomorrow}`,
  };
}

/** S-196 AC2: the test push opens the profile it was sent from. */
export function testPushPayload(locale: Locale, adminId: string): PushPayload {
  return { title: t("admin.push.test.title", locale), body: t("admin.push.test.body", locale), url: "/admin/profile", tag: `test:${adminId}` };
}
