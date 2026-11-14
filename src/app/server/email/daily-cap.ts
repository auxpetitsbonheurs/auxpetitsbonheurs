// The free Resend plan sends about 100 emails a day (NFR-009, README decision 13). From 90
// sent, non-critical emails (thank-you, admin alert copies of a push) wait for tomorrow;
// critical ones (order and request emails, quotes, declines, cancellations, account emails,
// invitations) still go until 100; at 100 everything waits for midnight (Mauritius time).
// Nothing is ever marked dead because of the daily cap (the per-recipient cap below is separate).
import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { emailOutbox } from "~/db/schema";
import { addDays, muDateTimeToInstant, todayMU } from "~/domain/time";
import type { Executor } from "~/server/db.server";

export const SOFT_CAP = 90;
export const DAILY_LIMIT = 100;

export type CapDecision = "send" | "defer" | "wait";

export const isNonCritical = (template: string) => template === "thank_you" || template.startsWith("admin_alert_");

/** What to do with a due row of `template` when `sentToday` emails already went out. */
export function capDecision(template: string, sentToday: number): CapDecision {
  if (sentToday >= DAILY_LIMIT) return "wait";
  if (sentToday >= SOFT_CAP && isNonCritical(template)) return "defer";
  return "send";
}

/** The first instant of the next Mauritius day. */
export function nextMuMidnight(now: Date): Date {
  return muDateTimeToInstant(addDays(todayMU(now), 1), "00:00");
}

/** Emails sent since Mauritius midnight (includes account emails the hook sent directly). */
export async function sentToday(db: Executor, now: Date): Promise<number> {
  const since = muDateTimeToInstant(todayMU(now), "00:00");
  const [row] = await db
    .select({ n: count() })
    .from(emailOutbox)
    .where(and(eq(emailOutbox.status, "sent"), gte(emailOutbox.sentAt, since)));
  return row?.n ?? 0;
}

/**
 * Per-recipient cap (SEC-07, threat model G-08): the public forms (Place order, custom cake
 * request) send an email to whatever address is typed, so someone using many IPs could flood
 * one inbox. At most this many of these emails go to one address in any 24 hours; the next is
 * not sent (dead, `recipient_cap`, logged on the order). Emails an admin's action sends (quotes,
 * confirmations, updates) and account emails are neither counted nor capped.
 */
export const RECIPIENT_DAILY_CAP = 3;
export const RECIPIENT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const PUBLIC_TRIGGERED_TEMPLATES: ReadonlySet<string> = new Set(["order_received", "request_received"]);

export const isPublicTriggered = (template: string) => PUBLIC_TRIGGERED_TEMPLATES.has(template);

/** Lower-cased address -> publicly triggered emails sent to it in the last 24 h. */
export async function recentPublicSends(db: Executor, addresses: readonly string[], now: Date): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const wanted = [...new Set(addresses.map((address) => address.toLowerCase()))];
  if (wanted.length === 0) return counts;
  const address = sql<string>`lower(${emailOutbox.toEmail})`;
  const rows = await db
    .select({ address, n: count() })
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.status, "sent"),
        gte(emailOutbox.sentAt, new Date(now.getTime() - RECIPIENT_WINDOW_MS)),
        inArray(emailOutbox.template, [...PUBLIC_TRIGGERED_TEMPLATES]),
        inArray(address, wanted),
      ),
    )
    .groupBy(address);
  for (const row of rows) counts.set(row.address, row.n);
  return counts;
}
