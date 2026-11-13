// paymentDeadlines (S-280, juice-payment spec): every hourly tick, orders still awaiting their
// Juice payment get one reminder after 12 hours and are cancelled after 24 ("Cancelled:
// unpaid"); a cancelled order is no longer active, so its date is free again. Judged from
// the tick's `now` (injected), never the system clock. Idempotent: each update is guarded by
// the status (and the reminder marker), so overlapping or repeated ticks change a row once,
// and the outbox dedupe keys hold one email per order. Emails are only queued (E-10 sends).
import { sql } from "drizzle-orm";
import { PAYMENT_DEADLINE_MS, PAYMENT_REMINDER_AFTER_MS } from "~/domain/payment";
import type { Database } from "~/server/db.server";
import type { JobContext, JobResult } from "./types";

type Counted = { rows: { n: number | string }[] };

const before = (now: Date, ms: number) => new Date(now.getTime() - ms).toISOString();

/** Cancels every order unpaid for 24 hours; returns how many. */
async function cancelUnpaid(db: Database, now: Date): Promise<number> {
  const at = now.toISOString();
  const { rows } = (await db.execute(sql`
    with cancelled as (
      update orders set status = 'cancelled', cancel_reason = 'unpaid', version = version + 1, updated_at = ${at}::timestamptz
      where status = 'awaiting_payment' and coalesce(awaiting_payment_since, created_at) <= ${before(now, PAYMENT_DEADLINE_MS)}::timestamptz
      returning id, contact_email, locale
    ), logged as (
      insert into order_event (order_id, actor_type, type, from_status, to_status, details, created_at)
      select id, 'system', 'cancelled', 'awaiting_payment', 'cancelled', jsonb_build_object('reason', 'unpaid'), ${at}::timestamptz from cancelled
    ), queued as (
      insert into email_outbox (template, to_email, locale, payload, order_id, dedupe_key)
      select 'order_cancelled_unpaid', contact_email, locale, jsonb_build_object('orderId', id), id, 'order:' || id || ':order_cancelled_unpaid'
      from cancelled where contact_email is not null
      on conflict (dedupe_key) do nothing
    )
    select count(*) as n from cancelled
  `)) as unknown as Counted;
  return Number(rows[0]?.n ?? 0);
}

/** Queues the one reminder of every order unpaid for 12 to 24 hours; returns how many. */
async function remindUnpaid(db: Database, now: Date): Promise<number> {
  const at = now.toISOString();
  const { rows } = (await db.execute(sql`
    with reminded as (
      update orders set payment_reminder_sent_at = ${at}::timestamptz
      where status = 'awaiting_payment' and payment_reminder_sent_at is null
        and coalesce(awaiting_payment_since, created_at) <= ${before(now, PAYMENT_REMINDER_AFTER_MS)}::timestamptz
        and coalesce(awaiting_payment_since, created_at) > ${before(now, PAYMENT_DEADLINE_MS)}::timestamptz
      returning id, contact_email, locale
    ), logged as (
      insert into order_event (order_id, actor_type, type, created_at)
      select id, 'system', 'payment_reminder_sent', ${at}::timestamptz from reminded
    ), queued as (
      insert into email_outbox (template, to_email, locale, payload, order_id, dedupe_key)
      select 'payment_reminder', contact_email, locale, jsonb_build_object('orderId', id), id, 'order:' || id || ':payment_reminder'
      from reminded where contact_email is not null
      on conflict (dedupe_key) do nothing
    )
    select count(*) as n from reminded
  `)) as unknown as Counted;
  return Number(rows[0]?.n ?? 0);
}

export async function paymentDeadlines({ db, now }: JobContext): Promise<JobResult> {
  // Cancel first: an order past 24 h that missed its reminder (a tick was skipped) gets none.
  const cancelled = await cancelUnpaid(db, now);
  const reminded = await remindUnpaid(db, now);
  return { job: "paymentDeadlines", ran: true, processed: cancelled + reminded };
}
