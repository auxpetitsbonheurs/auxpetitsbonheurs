// Sends the due outbox rows (S-186, S-187): used after a request commits (deferred past the
// response) and by the hourly `retryEmails` job. Never throws for a provider problem and never
// fails an order: every outcome is written on the row (the failure kind only, never the
// provider's text). Without RESEND_API_KEY / EMAIL_FROM / SITE_URL nothing is sent and the rows
// stay queued ("not sent: email not set up"). A row is claimed (lease) before sending so the
// request-time flush and the cron never send the same row twice; Resend's idempotency key is the
// second guard.
import { eq, sql } from "drizzle-orm";
import { emailOutbox, orderEvent } from "~/db/schema";
import type { Database } from "~/server/db.server";
import { DAILY_LIMIT, SOFT_CAP, capDecision, nextMuMidnight, sentToday as countSentToday } from "./daily-cap";
import { loadOrderEmailData } from "./order-data.server";
import { EMAIL_TIMEOUT_MS, EmailSendError, type Mailer, sendWithTimeout } from "./sender.server";
import { ORDER_EMAIL_KEYS, type OrderEmailKey, isOrderEmailKey, renderOrderEmail } from "./templates/order-emails";
import type { Locale } from "~/lib/locale";

/** One try per hour at first, then slower; the 6th failure ends it (FR-074). */
export const RETRY_DELAYS_HOURS = [1, 2, 4, 8, 24] as const;
export const MAX_ATTEMPTS = RETRY_DELAYS_HOURS.length + 1;
/** A claimed row is left alone this long (a crashed worker's rows come back after it). */
const LEASE_MS = 10 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const CONCURRENCY = 4;

export interface OutboxOptions {
  now: Date;
  mailer: Mailer | null;
  /** The site's public address; every link in an email starts with it. */
  siteUrl: string | null;
  /** At most this many rows per run (50 on the cron tick). */
  limit: number;
  timeoutMs?: number;
}

export interface OutboxReport {
  sent: number;
  failed: number;
  dead: number;
  deferred: number;
  /** Email is not set up: nothing was tried. */
  notConfigured: boolean;
}

interface Claimed {
  id: string;
  template: string;
  to_email: string;
  locale: Locale;
  payload: Record<string, unknown>;
  order_id: string | null;
  attempts: number;
}

const line = (level: "info" | "error", event: string, extra: Record<string, unknown>) => console.log(JSON.stringify({ level, event, ...extra }));

/** Rows this module can render today; others (admin alerts, invitations) are left to their own sender. */
export const RENDERABLE_TEMPLATES: readonly string[] = ORDER_EMAIL_KEYS;

async function claimDue(db: Database, now: Date, limit: number): Promise<Claimed[]> {
  const result = (await db.execute(sql`
    update email_outbox set next_attempt_at = ${new Date(now.getTime() + LEASE_MS).toISOString()}::timestamptz
    where id in (
      select id from email_outbox
      where status = 'pending' and next_attempt_at <= ${now.toISOString()}::timestamptz and template in (${sql.join(RENDERABLE_TEMPLATES.map((name) => sql`${name}`), sql`, `)})
      order by next_attempt_at, created_at limit ${limit} for update skip locked
    )
    returning id, template, to_email, locale, payload, order_id, attempts
  `)) as unknown as { rows: Claimed[] };
  return result.rows;
}

const release = (db: Database, id: string, at: Date) => db.update(emailOutbox).set({ nextAttemptAt: at }).where(eq(emailOutbox.id, id));

async function markDead(db: Database, row: Claimed, reason: string, now: Date) {
  await db.update(emailOutbox).set({ status: "dead", attempts: row.attempts + 1, lastError: reason }).where(eq(emailOutbox.id, row.id));
  if (row.order_id) {
    await db.insert(orderEvent).values({ orderId: row.order_id, actorType: "system", type: "email_failed", details: { template: row.template, reason }, createdAt: now });
  }
  // The alert line: Sentry (when its DSN is set) and Workers Logs pick up error-level lines.
  line("error", "email_dead", { template: row.template, reason, attempts: row.attempts + 1 });
}

async function recordFailure(db: Database, row: Claimed, error: unknown, now: Date): Promise<"failed" | "dead"> {
  const kind = error instanceof EmailSendError ? error.kind : "network";
  const permanent = error instanceof EmailSendError && error.permanent;
  const attempts = row.attempts + 1;
  if (permanent || attempts >= MAX_ATTEMPTS) {
    await markDead(db, row, permanent ? `${kind}_permanent` : kind, now);
    return "dead";
  }
  const delay = RETRY_DELAYS_HOURS[row.attempts] ?? 24;
  await db.update(emailOutbox).set({ attempts, lastError: kind, nextAttemptAt: new Date(now.getTime() + delay * HOUR_MS) }).where(eq(emailOutbox.id, row.id));
  return "failed";
}

type Loaded = Awaited<ReturnType<typeof loadOrderEmailData>>;

/** Decides, renders and sends one claimed row; returns what happened. */
async function deliver(db: Database, row: Claimed, ctx: { options: OutboxOptions; mailer: Mailer; siteUrl: string; orders: Loaded; sent: { n: number } }): Promise<"sent" | "failed" | "dead" | "deferred" | "waiting"> {
  const { options, mailer, siteUrl, orders, sent } = ctx;
  const decision = capDecision(row.template, sent.n);
  if (decision === "wait") {
    await release(db, row.id, options.now);
    return "waiting";
  }
  if (decision === "defer") {
    await release(db, row.id, nextMuMidnight(options.now));
    line("info", "email_deferred_cap", { template: row.template });
    return "deferred";
  }
  const orderId = row.order_id ?? (typeof row.payload.orderId === "string" ? row.payload.orderId : null);
  const loaded = orderId ? orders.get(orderId) : undefined;
  if (!loaded || !isOrderEmailKey(row.template)) {
    await markDead(db, row, "order_missing", options.now);
    return "dead";
  }
  const payload = row.payload as { reason?: string; why?: string; previousDate?: string; previousTotalRs?: number };
  let email;
  try {
    email = renderOrderEmail(row.template as OrderEmailKey, { ...loaded, siteUrl, locale: row.locale, payload });
  } catch {
    await markDead(db, row, "render", options.now);
    return "dead";
  }
  try {
    const result = await sendWithTimeout(mailer, { to: row.to_email, ...email, idempotencyKey: `outbox-${row.id}` }, options.timeoutMs ?? EMAIL_TIMEOUT_MS);
    await db
      .update(emailOutbox)
      .set({ status: "sent", sentAt: options.now, providerId: result.id, attempts: row.attempts + 1, lastError: null })
      .where(eq(emailOutbox.id, row.id));
    sent.n += 1;
    return "sent";
  } catch (error) {
    return recordFailure(db, row, error, options.now);
  }
}

export async function processOutbox(db: Database, options: OutboxOptions): Promise<OutboxReport> {
  const report: OutboxReport = { sent: 0, failed: 0, dead: 0, deferred: 0, notConfigured: false };
  if (!options.mailer || !options.siteUrl) {
    line("info", "email_not_sent", { reason: "email not set up" });
    return { ...report, notConfigured: true };
  }
  const sent = { n: await countSentToday(db, options.now) };
  if (sent.n >= DAILY_LIMIT) return report;
  const rows = await claimDue(db, options.now, options.limit);
  if (rows.length === 0) return report;
  const orders = await loadOrderEmailData(db, rows.flatMap((row) => (row.order_id ? [row.order_id] : [])));
  const queue = [...rows];
  const ctx = { options, mailer: options.mailer, siteUrl: options.siteUrl, orders, sent };
  const worker = async () => {
    for (let row = queue.shift(); row; row = queue.shift()) {
      try {
        const outcome = await deliver(db, row, ctx);
        if (outcome === "sent") report.sent += 1;
        else if (outcome === "failed") report.failed += 1;
        else if (outcome === "dead") report.dead += 1;
        else if (outcome === "deferred") report.deferred += 1;
      } catch {
        // A database hiccup on one row: it keeps its lease and comes back when the lease ends.
        line("error", "email_row_error", { template: row.template });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));
  return report;
}

export { SOFT_CAP };
