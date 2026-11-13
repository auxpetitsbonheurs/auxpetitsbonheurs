// The free Resend plan sends about 100 emails a day (NFR-009, README decision 13). From 90
// sent, non-critical emails (thank-you, admin alert copies of a push) wait for tomorrow;
// critical ones (order and request emails, quotes, declines, cancellations, account emails,
// invitations) still go until 100; at 100 everything waits for midnight (Mauritius time).
// Nothing is ever marked dead because of the cap.
import { and, count, eq, gte } from "drizzle-orm";
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
