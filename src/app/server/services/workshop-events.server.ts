// Admin → More → Workshops (E-15 S-301, S-306; contracts.md "Workshops"): save an event, publish,
// unpublish, cancel and mark completed. Owner and Admin both may (like promotions). Every
// change names the version the page loaded; zero rows changed means EVENT_CHANGED.
//
// - save: a new event is a draft; an edit that moves the date or times moves its active
//   registrations too (their order date and time window), in the same statement; the capacity
//   may never go below the places held.
// - cancel: the event and every active registration in one statement: each order is cancelled
//   ("event_cancelled"), a paid one owes its total back (refund step, as admin cancel), and each
//   registrant with an email gets `workshop_cancelled` from the outbox.
// - complete: after the event's date, confirmed registrations become completed (Sales counts
//   them like completed orders); ones never accepted or paid are closed as cancelled, no email.
import { type SQL, eq, sql } from "drizzle-orm";
import { workshopEvent } from "~/db/schema";
import { PHOTO_MAX_EDGE, isIssuedWorkshopPath } from "~/domain/upload";
import { slugify } from "~/domain/workshop";
import type { WorkshopEventInput } from "~/server/contracts/workshops";
import type { Database } from "~/server/db.server";
import type { AfterResponse } from "~/server/after-response.server";
import type { StorageGateway, UploadGateway } from "~/server/storage.server";
import { checkNewPhoto } from "./product-photos.server";
import { removePhotos } from "./storage-cleanup.server";

export interface EventSaveContext {
  adminId: string;
  now: Date;
  uploadSessionId?: string;
  uploads?: UploadGateway | null;
  storage?: StorageGateway | null;
  after?: AfterResponse | null;
}

export type EventFailure = "NOT_FOUND" | "EVENT_CHANGED" | "INVALID_TRANSITION";
export type SaveEventResult =
  | { ok: true; id: string; slug: string; version: number }
  | { ok: false; code: "NOT_FOUND" | "EVENT_CHANGED" | "UPLOAD_REJECTED" }
  | { ok: false; code: "CAPACITY_BELOW_HELD"; held: number };

/** Cakes held by active registrations of an event. */
export async function heldPlaces(db: Database, eventId: string): Promise<number> {
  const { rows } = (await db.execute(sql`
    select coalesce(sum(r.cakes), 0)::int as held from workshop_registration r join orders o on o.id = r.order_id
    where r.event_id = ${eventId}::uuid and o.status not in ('declined', 'cancelled', 'closed')
  `)) as unknown as { rows: { held: number }[] };
  return Number(rows[0]?.held ?? 0);
}

async function freeSlug(db: Database, title: string): Promise<string> {
  const base = slugify(title);
  const { rows } = (await db.execute(sql`select slug from workshop_event where slug = ${base} or slug like ${`${base}-%`}`)) as unknown as { rows: { slug: string }[] };
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Variant widths for the posted photo, or null when a new photo fails the checks (S-276 rules). */
async function checkPhoto(stored: { photoPath: string | null; photoVariants: number[] } | undefined, path: string | null, ctx: EventSaveContext): Promise<number[] | null> {
  if (!path) return [];
  if (stored?.photoPath === path) return stored.photoVariants;
  const { uploads, uploadSessionId, adminId } = ctx;
  if (!uploads || !uploadSessionId || !isIssuedWorkshopPath(path, adminId, uploadSessionId)) return null;
  return checkNewPhoto(uploads, { path, width: PHOTO_MAX_EDGE, height: PHOTO_MAX_EDGE });
}

const columns = (input: WorkshopEventInput, photoVariants: number[], ctx: EventSaveContext) => ({
  titleEn: input.titleEn,
  titleFr: input.titleFr,
  descriptionEn: input.descriptionEn,
  descriptionFr: input.descriptionFr,
  photoPath: input.photoPath,
  photoVariants,
  eventOn: input.eventOn,
  startsAt: input.startsAt,
  endsAt: input.endsAt,
  address: input.address,
  mapUrl: input.mapUrl,
  priceRs: input.priceRs,
  capacity: input.capacity,
  cakeOptions: input.options.map((o) => ({ id: o.id, name: o.name.fr ? { en: o.name.en, fr: o.name.fr } : { en: o.name.en } })),
  updatedBy: ctx.adminId,
  updatedAt: ctx.now,
});

async function removeLater(db: Database, path: string, ctx: EventSaveContext): Promise<void> {
  const cleanUp = () => removePhotos(db, ctx.storage ?? null, [path]);
  if (ctx.after) ctx.after.defer("remove-photos", cleanUp);
  else await cleanUp();
}

/** One statement: the versioned event update, and its active registrations' date and window. */
async function updateEvent(db: Database, id: string, version: number, values: ReturnType<typeof columns>): Promise<{ id: string; slug: string; version: number } | null> {
  const window = { id: "workshop", start: values.startsAt, end: values.endsAt, label: { en: `${values.startsAt}–${values.endsAt}`, fr: `${values.startsAt}–${values.endsAt}` } };
  const at = values.updatedAt.toISOString();
  const { rows } = (await db.execute(sql`
    with changed as (
      update workshop_event set title_en = ${values.titleEn}, title_fr = ${values.titleFr}, description_en = ${values.descriptionEn},
        description_fr = ${values.descriptionFr}, photo_path = ${values.photoPath}, photo_variants = ${`{${values.photoVariants.join(",")}}`}::smallint[],
        event_on = ${values.eventOn}::date, starts_at = ${values.startsAt}, ends_at = ${values.endsAt}, address = ${values.address},
        map_url = ${values.mapUrl}, price_rs = ${values.priceRs}, capacity = ${values.capacity}, cake_options = ${JSON.stringify(values.cakeOptions)}::jsonb,
        updated_by = ${values.updatedBy}::uuid, updated_at = ${at}::timestamptz, version = version + 1
      where id = ${id}::uuid and version = ${version}::integer and status in ('draft', 'published')
      returning id, slug, version, event_on, starts_at, ends_at
    ), moved as (
      update orders o set fulfil_on = c.event_on, time_window = ${JSON.stringify(window)}::jsonb, version = o.version + 1, updated_at = ${at}::timestamptz
      from changed c, workshop_registration r
      where r.event_id = c.id and o.id = r.order_id and o.status not in ('declined', 'cancelled', 'closed', 'completed')
        and (o.fulfil_on <> c.event_on or o.time_window->>'start' <> c.starts_at or o.time_window->>'end' <> c.ends_at)
    )
    select id, slug, version from changed
  `)) as unknown as { rows: { id: string; slug: string; version: number }[] };
  return rows[0] ?? null;
}

export async function saveWorkshopEvent(db: Database, input: WorkshopEventInput, ctx: EventSaveContext): Promise<SaveEventResult> {
  const [stored] = input.id ? await db.select({ photoPath: workshopEvent.photoPath, photoVariants: workshopEvent.photoVariants }).from(workshopEvent).where(eq(workshopEvent.id, input.id)) : [];
  if (input.id && !stored) return { ok: false, code: "NOT_FOUND" };
  if (input.id) {
    const held = await heldPlaces(db, input.id);
    if (input.capacity < held) return { ok: false, code: "CAPACITY_BELOW_HELD", held };
  }
  const variants = await checkPhoto(stored, input.photoPath, ctx);
  if (!variants) return { ok: false, code: "UPLOAD_REJECTED" };
  const values = columns(input, variants, ctx);
  let saved: { id: string; slug: string; version: number } | null;
  if (input.id) {
    saved = await updateEvent(db, input.id, input.version ?? 0, values);
    if (!saved) return { ok: false, code: "EVENT_CHANGED" };
  } else {
    const [created] = await db
      .insert(workshopEvent)
      .values({ ...values, slug: await freeSlug(db, input.titleEn), createdBy: ctx.adminId, createdAt: ctx.now })
      .returning({ id: workshopEvent.id, slug: workshopEvent.slug, version: workshopEvent.version });
    saved = created!;
  }
  if (stored?.photoPath && stored.photoPath !== input.photoPath) await removeLater(db, stored.photoPath, ctx);
  return { ok: true, ...saved };
}

export type EventActionResult = { ok: true; version: number; status: string } | { ok: false; code: EventFailure };

async function eventRefusal(db: Database, id: string, version: number): Promise<EventActionResult> {
  const [row] = await db.select({ version: workshopEvent.version }).from(workshopEvent).where(eq(workshopEvent.id, id));
  if (!row) return { ok: false, code: "NOT_FOUND" };
  return { ok: false, code: row.version !== version ? "EVENT_CHANGED" : "INVALID_TRANSITION" };
}

export interface EventActionInput {
  eventId: string;
  version: number;
  adminId: string;
  now: Date;
}

/** Runs one versioned event update (`allowed` reads the row as `e`), plus `extra` CTEs reading `changed`. */
async function eventAction(db: Database, input: EventActionInput, set: SQL, allowed: SQL, extra: SQL = sql``): Promise<EventActionResult> {
  const at = input.now.toISOString();
  const { rows } = (await db.execute(sql`
    with changed as (
      update workshop_event e set ${set}, version = e.version + 1, updated_by = ${input.adminId}::uuid, updated_at = ${at}::timestamptz
      where e.id = ${input.eventId}::uuid and e.version = ${input.version}::integer and ${allowed}
      returning e.id, e.version, e.status, e.cancel_reason
    )${extra}
    select version, status from changed
  `)) as unknown as { rows: { version: number; status: string }[] };
  const row = rows[0];
  return row ? { ok: true, version: row.version, status: row.status } : eventRefusal(db, input.eventId, input.version);
}

/** Publish (S-301 AC5): a draft whose date has not passed shows on /workshops. */
export function publishEvent(db: Database, input: EventActionInput & { today: string }): Promise<EventActionResult> {
  return eventAction(db, input, sql`status = 'published'`, sql`e.status = 'draft' and e.event_on >= ${input.today}::date`);
}

/** Unpublish (S-301 AC5): hidden again; its registrations stay as they are. */
export function unpublishEvent(db: Database, input: EventActionInput): Promise<EventActionResult> {
  return eventAction(db, input, sql`status = 'draft'`, sql`e.status = 'published'`);
}

/** Cancel the event (S-306 AC1, AC2): every active registration is cancelled and told; paid ones owe a refund. */
export function cancelEvent(db: Database, input: EventActionInput & { reason: string | null }): Promise<EventActionResult> {
  const at = sql`${input.now.toISOString()}::timestamptz`;
  return eventAction(
    db,
    input,
    sql`status = 'cancelled', cancel_reason = ${input.reason}, cancelled_at = ${at}`,
    sql`e.status in ('draft', 'published')`,
    sql`, regs as (
      update orders o set status = 'cancelled', cancel_reason = 'event_cancelled', version = o.version + 1, updated_at = ${at},
        refund_due_rs = case when o.paid then o.total_rs else o.refund_due_rs end
      from changed c, workshop_registration r
      where r.event_id = c.id and o.id = r.order_id and o.status not in ('declined', 'cancelled', 'closed', 'completed')
      returning o.id, o.version, o.paid, o.refund_due_rs, o.contact_email, o.locale, (select x.status from orders x where x.id = o.id) as from_status
    ), logged as (
      insert into order_event (order_id, actor_type, actor_admin_id, type, from_status, to_status, details, created_at)
      select id, 'admin', ${input.adminId}::uuid, 'cancelled', from_status, 'cancelled',
        jsonb_strip_nulls(jsonb_build_object('reason', 'event_cancelled', 'paid', case when paid then true end, 'refundDueRs', case when paid then refund_due_rs end)), ${at}
      from regs
    ), queued as (
      insert into email_outbox (template, to_email, locale, payload, order_id, dedupe_key)
      select 'workshop_cancelled', contact_email, locale, jsonb_strip_nulls(jsonb_build_object('orderId', id, 'reason', ${input.reason}::text)), id,
        'order:' || id || ':workshop_cancelled'
      from regs where contact_email is not null
      on conflict (dedupe_key) do nothing
    )`,
  );
}

/** Mark completed (S-306 AC4): on or after the event's date; confirmed registrations count in Sales. */
export function completeEvent(db: Database, input: EventActionInput & { today: string }): Promise<EventActionResult> {
  const at = sql`${input.now.toISOString()}::timestamptz`;
  return eventAction(
    db,
    input,
    sql`status = 'completed', completed_at = ${at}`,
    sql`e.status = 'published' and e.event_on <= ${input.today}::date`,
    sql`, done as (
      update orders o set status = 'completed', version = o.version + 1, updated_at = ${at}
      from changed c, workshop_registration r
      where r.event_id = c.id and o.id = r.order_id and o.status in ('approved', 'in_preparation', 'ready_for_pickup')
      returning o.id
    ), done_log as (
      insert into order_event (order_id, actor_type, actor_admin_id, type, to_status, details, created_at)
      select id, 'admin', ${input.adminId}::uuid, 'status_advanced', 'completed', jsonb_build_object('reason', 'event_completed'), ${at} from done
    ), closed as (
      update orders o set status = 'cancelled', cancel_reason = 'event_over', version = o.version + 1, updated_at = ${at}
      from changed c, workshop_registration r
      where r.event_id = c.id and o.id = r.order_id and o.status in ('pending_approval', 'awaiting_payment')
      returning o.id
    ), closed_log as (
      insert into order_event (order_id, actor_type, actor_admin_id, type, to_status, details, created_at)
      select id, 'admin', ${input.adminId}::uuid, 'cancelled', 'cancelled', jsonb_build_object('reason', 'event_over'), ${at} from closed
    )`,
  );
}
