// Quote state changes (E-08; PRD Appendix B; contracts.md v0.43 `admin/order` sendQuote and
// decline, `site/tracking` acceptQuote and declineQuote). Each is ONE statement like approve
// (ADR-0003 amendment 3): the versioned conditional UPDATE is the lock, the event and outbox rows
// are written from its RETURNING in data-modifying CTEs (one transaction), and the order's current
// state comes back to explain a refusal. Of two simultaneous changes with one version exactly one
// matches. Emails are outbox rows (sending is E-10); admin push alerts arrive with E-10 too.
//
// Payment hand-off: an accepted quote becomes `approved` and queues `order_confirmed` (Juice number
// and payment reminder), exactly as an admin approval does today. When the manual Juice payment
// flow lands it takes over from that same point; no second payment model here.
import { sql } from "drizzle-orm";
import type { OrderStatus } from "~/domain/status";
import type { Database } from "~/server/db.server";

type Json<T> = T | string | null;
const parsed = <T>(value: Json<T>): T | null => (typeof value === "string" ? (JSON.parse(value) as T) : value);

interface Current {
  status: OrderStatus;
  version: number;
  expiresOn: string | null;
}

export type QuoteChange = { ok: true; order: { status: OrderStatus; version: number } };
export type AdminQuoteResult = QuoteChange | { ok: false; code: "NOT_FOUND" | "ORDER_CHANGED" | "INVALID_TRANSITION" };
export type CustomerQuoteResult = QuoteChange | { ok: false; code: "NOT_FOUND" | "ORDER_CHANGED" | "INVALID_TRANSITION" | "QUOTE_EXPIRED" };

interface Row {
  changed: Json<{ status: OrderStatus; version: number }>;
  current: Json<Current>;
}

async function run(db: Database, statement: ReturnType<typeof sql>): Promise<{ changed: QuoteChange["order"] | null; current: Current | null }> {
  const { rows } = (await db.execute(statement)) as unknown as { rows: Row[] };
  const row = rows[0];
  return { changed: parsed(row?.changed ?? null), current: parsed(row?.current ?? null) };
}

/** Why an admin change did not apply: the page is stale, or the status no longer allows it. */
function adminRefusal(current: Current | null, version: number): AdminQuoteResult {
  if (!current) return { ok: false, code: "NOT_FOUND" };
  if (current.version !== version) return { ok: false, code: "ORDER_CHANGED" };
  return { ok: false, code: "INVALID_TRANSITION" };
}

/**
 * The customer's refusal (S-158 AC3, AC5, AC7): a status that cannot answer first, then an
 * expired quote (before the version check, contracts.md), then a stale page.
 */
function customerRefusal(current: Current | null, version: number, today: string, action: "accept" | "decline"): CustomerQuoteResult {
  if (!current) return { ok: false, code: "NOT_FOUND" };
  if (current.status !== "quote_sent") return { ok: false, code: "INVALID_TRANSITION" };
  if (action === "accept" && current.expiresOn !== null && today > current.expiresOn) return { ok: false, code: "QUOTE_EXPIRED" };
  if (current.version !== version) return { ok: false, code: "ORDER_CHANGED" };
  return { ok: false, code: "INVALID_TRANSITION" };
}

const currentById = (id: string) => sql`(select json_build_object('status', o.status, 'version', o.version, 'expiresOn', to_char(cr.quote_expires_on, 'YYYY-MM-DD'))
  from orders o left join custom_request cr on cr.order_id = o.id where o.id = ${id}::uuid)`;
const currentByToken = (token: string) => sql`(select json_build_object('status', o.status, 'version', o.version, 'expiresOn', to_char(cr.quote_expires_on, 'YYYY-MM-DD'))
  from orders o left join custom_request cr on cr.order_id = o.id where o.tracking_token = ${token})`;

/** Admin email alerts for a customer's answer (FR-072): active admins with email alerts on, in their language. */
const adminAlerts = (template: string) => sql`insert into email_outbox (template, to_email, locale, payload, order_id, dedupe_key)
  select ${template}, a.email, a.locale, jsonb_build_object('orderId', c.id), c.id, 'order:' || c.id || ':' || ${template} || ':' || a.id
  from changed c cross join admin a where a.active and a.alert_email
  on conflict (dedupe_key) do nothing`;

export interface SendQuoteInput {
  orderId: string;
  version: number;
  adminId: string;
  amountRs: number;
  note: string | null;
  /** Mauritius date; the route has checked it is today or later. */
  expiresOn: string;
  now: Date;
}

/**
 * `sendQuote` (S-156, S-161): Quote needed or Quote sent -> Quote sent. The amount is the whole
 * total (delivery included; `total_rs` = amount). A re-quote keeps the previous amount, note and
 * expiry in the event, and its "Your quote" email is a new one (`dedupe_key` per version).
 */
export async function sendQuote(db: Database, input: SendQuoteInput): Promise<AdminQuoteResult> {
  const at = input.now.toISOString();
  const { changed, current } = await run(db, sql`
    with prev as (
      select o.id, o.status, cr.quote_amount_rs, cr.quote_note, to_char(cr.quote_expires_on, 'YYYY-MM-DD') as quote_expires_on
      from orders o join custom_request cr on cr.order_id = o.id where o.id = ${input.orderId}::uuid
    ), changed as (
      update orders set status = 'quote_sent', total_rs = ${input.amountRs}::integer, total_overridden = false,
        version = ${input.version + 1}::integer, updated_at = ${at}::timestamptz
      where id = ${input.orderId}::uuid and version = ${input.version}::integer and source = 'custom_request'
        and status in ('quote_needed', 'quote_sent')
      returning id, status, version, contact_email, locale
    ), quoted as (
      update custom_request set quote_amount_rs = ${input.amountRs}::integer, quote_note = ${input.note}, quote_expires_on = ${input.expiresOn}::date,
        quote_sent_at = ${at}::timestamptz, quote_sent_by = ${input.adminId}::uuid
      where order_id in (select id from changed)
    ), logged as (
      insert into order_event (order_id, actor_type, actor_admin_id, type, from_status, to_status, details, created_at)
      select c.id, 'admin', ${input.adminId}::uuid, 'quote_sent', p.status, 'quote_sent',
        jsonb_strip_nulls(jsonb_build_object('amountRs', ${input.amountRs}::integer, 'note', ${input.note}::text, 'expiresOn', ${input.expiresOn}::text,
          'previous', case when p.quote_amount_rs is null then null
            else jsonb_build_object('amountRs', p.quote_amount_rs, 'note', p.quote_note, 'expiresOn', p.quote_expires_on) end)),
        ${at}::timestamptz
      from changed c join prev p on p.id = c.id
    ), queued as (
      insert into email_outbox (template, to_email, locale, payload, order_id, dedupe_key)
      select 'quote', contact_email, locale, jsonb_build_object('orderId', id), id, 'order:' || id || ':quote:v' || version
      from changed where contact_email is not null
    )
    select (select json_build_object('status', c.status, 'version', c.version) from changed c) as changed, ${currentById(input.orderId)} as current
  `);
  return changed ? { ok: true, order: changed } : adminRefusal(current, input.version);
}

export interface DeclineRequestInput {
  orderId: string;
  version: number;
  adminId: string;
  reason: string | null;
  now: Date;
}

/** Admin `decline` of a custom request (S-157): Quote needed -> Declined; "Request declined" with the reason when given. */
export async function declineRequest(db: Database, input: DeclineRequestInput): Promise<AdminQuoteResult> {
  const at = input.now.toISOString();
  const { changed, current } = await run(db, sql`
    with changed as (
      update orders set status = 'declined', decline_reason = ${input.reason}, version = ${input.version + 1}::integer, updated_at = ${at}::timestamptz
      where id = ${input.orderId}::uuid and version = ${input.version}::integer and source = 'custom_request' and status = 'quote_needed'
      returning id, status, version, contact_email, locale
    ), logged as (
      insert into order_event (order_id, actor_type, actor_admin_id, type, from_status, to_status, details, created_at)
      select id, 'admin', ${input.adminId}::uuid, 'declined', 'quote_needed', 'declined', jsonb_strip_nulls(jsonb_build_object('reason', ${input.reason}::text)), ${at}::timestamptz
      from changed
    ), queued as (
      insert into email_outbox (template, to_email, locale, payload, order_id, dedupe_key)
      select 'request_declined', contact_email, locale, jsonb_strip_nulls(jsonb_build_object('orderId', id, 'reason', ${input.reason}::text)), id, 'order:' || id || ':request_declined'
      from changed where contact_email is not null
    )
    select (select json_build_object('status', c.status, 'version', c.version) from changed c) as changed, ${currentById(input.orderId)} as current
  `);
  return changed ? { ok: true, order: changed } : adminRefusal(current, input.version);
}

export interface QuoteAnswerInput {
  token: string;
  version: number;
  /** The Mauritius date now: a quote is valid through its expiry day (FR-031). */
  today: string;
  now: Date;
}

/**
 * Customer `acceptQuote` (S-158): Quote sent, not expired, same version -> Approved, event
 * `quote_accepted`, "Order confirmed" (the payment hand-off point) and admin alerts. The date is
 * not re-checked (owner decision 10). The amount is the server's, never the page's.
 */
export async function acceptQuote(db: Database, input: QuoteAnswerInput): Promise<CustomerQuoteResult> {
  const at = input.now.toISOString();
  const { changed, current } = await run(db, sql`
    with changed as (
      update orders o set status = 'approved', version = ${input.version + 1}::integer, updated_at = ${at}::timestamptz
      where o.tracking_token = ${input.token} and o.version = ${input.version}::integer and o.status = 'quote_sent'
        and exists (select 1 from custom_request cr where cr.order_id = o.id and cr.quote_expires_on >= ${input.today}::date)
      returning o.id, o.status, o.version, o.contact_email, o.locale
    ), logged as (
      insert into order_event (order_id, actor_type, type, from_status, to_status, created_at)
      select id, 'customer', 'quote_accepted', 'quote_sent', 'approved', ${at}::timestamptz from changed
    ), queued as (
      insert into email_outbox (template, to_email, locale, payload, order_id, dedupe_key)
      select 'order_confirmed', contact_email, locale, jsonb_build_object('orderId', id), id, 'order:' || id || ':order_confirmed:v' || version
      from changed where contact_email is not null
    ), alerted as (${adminAlerts("admin_alert_quote_accepted")})
    select (select json_build_object('status', c.status, 'version', c.version) from changed c) as changed, ${currentByToken(input.token)} as current
  `);
  return changed ? { ok: true, order: changed } : customerRefusal(current, input.version, input.today, "accept");
}

/**
 * Customer `declineQuote` (S-159): Quote sent -> Closed, also after the expiry day while the job
 * has not closed it yet (AC4). "Quote closed" shares its dedupe key with the expiry job's, so the
 * customer never gets two.
 */
export async function declineQuote(db: Database, input: QuoteAnswerInput): Promise<CustomerQuoteResult> {
  const at = input.now.toISOString();
  const { changed, current } = await run(db, sql`
    with changed as (
      update orders o set status = 'closed', version = ${input.version + 1}::integer, updated_at = ${at}::timestamptz
      where o.tracking_token = ${input.token} and o.version = ${input.version}::integer and o.status = 'quote_sent'
      returning o.id, o.status, o.version, o.contact_email, o.locale
    ), logged as (
      insert into order_event (order_id, actor_type, type, from_status, to_status, created_at)
      select id, 'customer', 'quote_declined', 'quote_sent', 'closed', ${at}::timestamptz from changed
    ), queued as (
      insert into email_outbox (template, to_email, locale, payload, order_id, dedupe_key)
      select 'quote_closed', contact_email, locale, jsonb_build_object('orderId', id, 'why', 'declined'), id, 'order:' || id || ':quote_closed'
      from changed where contact_email is not null
      on conflict (dedupe_key) do nothing
    ), alerted as (${adminAlerts("admin_alert_quote_declined")})
    select (select json_build_object('status', c.status, 'version', c.version) from changed c) as changed, ${currentByToken(input.token)} as current
  `);
  return changed ? { ok: true, order: changed } : customerRefusal(current, input.version, input.today, "decline");
}
