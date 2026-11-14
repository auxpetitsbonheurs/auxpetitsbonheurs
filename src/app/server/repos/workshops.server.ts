// Workshop reads (E-15; contracts.md "Workshops"): the public list and event page, and the admin
// list, event and registrations. Places held are counted in the same query (cakes of active
// registrations), so a page never shows a stale "places left" from another request.
import { sql } from "drizzle-orm";
import type { LocalizedText } from "~/db/tables/json-types";
import type { WorkshopCakeOption } from "~/db/tables/workshops";
import { formatOrderNumber } from "~/domain/order-number";
import type { OrderStatus } from "~/domain/status";
import { type WorkshopStatus, inLocale, placesLeft } from "~/domain/workshop";
import { type WebPhoto, webPhoto } from "~/lib/images";
import type { Locale } from "~/lib/locale";
import type { Executor } from "~/server/db.server";

/** Event photos are shown in a 4:3 box (object-cover); the stored copies are 480/960 wide. */
export const EVENT_PHOTO_BOX = { width: 1600, height: 1200 } as const;

interface EventRow {
  id: string;
  slug: string;
  titleEn: string;
  titleFr: string | null;
  descriptionEn: string;
  descriptionFr: string | null;
  photoPath: string | null;
  photoVariants: number[];
  eventOn: string;
  startsAt: string;
  endsAt: string;
  address: string;
  mapUrl: string | null;
  priceRs: number;
  capacity: number;
  cakeOptions: WorkshopCakeOption[];
  status: WorkshopStatus;
  cancelReason: string | null;
  version: number;
  held: number;
  pending: number;
}

const EVENT_COLUMNS = sql`e.id, e.slug, e.title_en as "titleEn", e.title_fr as "titleFr", e.description_en as "descriptionEn",
  e.description_fr as "descriptionFr", e.photo_path as "photoPath", e.photo_variants as "photoVariants", e.event_on::text as "eventOn",
  e.starts_at as "startsAt", e.ends_at as "endsAt", e.address, e.map_url as "mapUrl", e.price_rs as "priceRs", e.capacity,
  e.cake_options as "cakeOptions", e.status, e.cancel_reason as "cancelReason", e.version,
  coalesce((select sum(r.cakes) from workshop_registration r join orders o on o.id = r.order_id
    where r.event_id = e.id and o.status not in ('declined', 'cancelled', 'closed')), 0)::int as held,
  coalesce((select count(*) from workshop_registration r join orders o on o.id = r.order_id
    where r.event_id = e.id and o.status = 'pending_approval'), 0)::int as pending`;

const asArray = (value: unknown): number[] => (Array.isArray(value) ? value.map(Number) : typeof value === "string" ? value.replace(/[{}]/g, "").split(",").filter(Boolean).map(Number) : []);
const asJson = <T>(value: T | string): T => (typeof value === "string" ? (JSON.parse(value) as T) : value);

function normalise(row: EventRow): EventRow {
  return { ...row, photoVariants: asArray(row.photoVariants), cakeOptions: asJson(row.cakeOptions), held: Number(row.held), pending: Number(row.pending) };
}

/** What a customer page shows about one event, in the visitor's language. */
export interface PublicEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  photo: WebPhoto | null;
  eventOn: string;
  startsAt: string;
  endsAt: string;
  address: string;
  mapUrl: string | null;
  priceRs: number;
  placesLeft: number;
  status: WorkshopStatus;
  options: { id: string; name: string }[];
}

function toPublic(row: EventRow, locale: Locale, supabaseUrl: string): PublicEvent {
  return {
    id: row.id,
    slug: row.slug,
    title: inLocale(row.titleEn, row.titleFr, locale),
    description: inLocale(row.descriptionEn, row.descriptionFr, locale),
    photo: row.photoPath ? webPhoto(row.photoPath, EVENT_PHOTO_BOX.width, EVENT_PHOTO_BOX.height, row.photoVariants, supabaseUrl) : null,
    eventOn: row.eventOn,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    address: row.address,
    mapUrl: row.mapUrl,
    priceRs: row.priceRs,
    placesLeft: placesLeft(row.capacity, row.held),
    status: row.status,
    options: row.cakeOptions.map((o) => ({ id: o.id, name: inLocale(o.name.en, o.name.fr, locale) })),
  };
}

/** /workshops (S-302): published events whose Mauritius date has not passed, soonest first. */
export async function listUpcomingEvents(db: Executor, today: string, locale: Locale, supabaseUrl: string): Promise<PublicEvent[]> {
  const { rows } = (await db.execute(sql`
    select ${EVENT_COLUMNS} from workshop_event e
    where e.status = 'published' and e.event_on >= ${today}::date
    order by e.event_on, e.starts_at limit 20
  `)) as unknown as { rows: EventRow[] };
  return rows.map((row) => toPublic(normalise(row), locale, supabaseUrl));
}

/**
 * /sitemap.xml (S-224, tidy job): slugs of the workshop pages open today, the `isOpen` rule
 * (published, date not passed, Mauritius date), so a listed page is never noindex. Full ones
 * stay listed: their page is indexable too.
 */
export async function listWorkshopPageSlugs(db: Executor, today: string): Promise<string[]> {
  const { rows } = (await db.execute(sql`
    select slug from workshop_event where status = 'published' and event_on >= ${today}::date order by event_on, starts_at, slug
  `)) as unknown as { rows: { slug: string }[] };
  return rows.map((r) => r.slug);
}

/** /workshops/:slug (S-303): any event but drafts (the page decides open, full, cancelled or past). */
export async function findPublicEvent(db: Executor, slug: string, locale: Locale, supabaseUrl: string): Promise<PublicEvent | null> {
  const { rows } = (await db.execute(sql`select ${EVENT_COLUMNS} from workshop_event e where e.slug = ${slug} and e.status <> 'draft' limit 1`)) as unknown as { rows: EventRow[] };
  return rows[0] ? toPublic(normalise(rows[0]), locale, supabaseUrl) : null;
}

/** One row of the admin list (S-301 AC1). */
export interface AdminEventRow {
  id: string;
  title: string;
  eventOn: string;
  startsAt: string;
  endsAt: string;
  status: WorkshopStatus;
  capacity: number;
  held: number;
  pending: number;
}

/** Upcoming events first (soonest first), then past ones (latest first). */
export async function listAdminEvents(db: Executor, today: string): Promise<AdminEventRow[]> {
  const { rows } = (await db.execute(sql`
    select ${EVENT_COLUMNS} from workshop_event e
    order by (e.event_on < ${today}::date), case when e.event_on >= ${today}::date then e.event_on end, e.event_on desc
    limit 100
  `)) as unknown as { rows: EventRow[] };
  return rows.map(normalise).map((r) => ({ id: r.id, title: r.titleEn, eventOn: r.eventOn, startsAt: r.startsAt, endsAt: r.endsAt, status: r.status, capacity: r.capacity, held: r.held, pending: r.pending }));
}

export type AdminEvent = Omit<EventRow, "photoVariants"> & { photoVariants: number[] };

export async function findAdminEvent(db: Executor, id: string): Promise<AdminEvent | null> {
  const { rows } = (await db.execute(sql`select ${EVENT_COLUMNS} from workshop_event e where e.id = ${id}::uuid limit 1`)) as unknown as { rows: EventRow[] };
  return rows[0] ? normalise(rows[0]) : null;
}

/** One registration on the event screen and the printable list (S-305). */
export interface EventRegistration {
  orderId: string;
  number: string;
  status: OrderStatus;
  paid: boolean;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  cakes: number;
  choices: { name: LocalizedText; quantity: number }[];
  totalRs: number;
  peopleNames: string | null;
  /** Health data: admins only, never in alerts (S-307). */
  allergies: string | null;
  message: string | null;
  locale: Locale;
  createdAt: string;
  /** The event's date, time or address changed while this registration was active (`workshop_changed` logged). */
  changed: boolean;
}

export async function listEventRegistrations(db: Executor, eventId: string): Promise<EventRegistration[]> {
  const { rows } = (await db.execute(sql`
    select o.id as "orderId", o.number, coalesce(o.number_prefix, s.order_number_prefix) as prefix, o.status, o.paid,
      o.contact_name as "contactName", o.contact_phone as "contactPhone", o.contact_email as "contactEmail", r.cakes, o.total_rs as "totalRs",
      r.people_names as "peopleNames", r.allergies, o.customer_note as message, o.locale, o.created_at as "createdAt",
      exists (select 1 from order_event e where e.order_id = o.id and e.type = 'workshop_changed') as changed,
      coalesce((select json_agg(json_build_object('name', i.options->0->'choice', 'quantity', i.quantity) order by i.sort_order)
        from order_item i where i.order_id = o.id), '[]'::json) as choices
    from workshop_registration r join orders o on o.id = r.order_id cross join settings s
    where r.event_id = ${eventId}::uuid and s.id = 1
    order by o.created_at
  `)) as unknown as { rows: (Omit<EventRegistration, "number" | "createdAt" | "choices"> & { number: number; prefix: string; createdAt: Date | string; choices: EventRegistration["choices"] | string })[] };
  return rows.map(({ prefix, number, createdAt, choices, ...row }) => ({
    ...row,
    number: formatOrderNumber(prefix, number),
    cakes: Number(row.cakes),
    choices: asJson(choices),
    createdAt: new Date(createdAt).toISOString(),
  }));
}

/** The workshop part of an order (order screen, tracking, emails), or null for other orders. */
export interface OrderWorkshop {
  eventId: string;
  slug: string;
  titleEn: string;
  titleFr: string | null;
  address: string;
  mapUrl: string | null;
  cakes: number;
  peopleNames: string | null;
  allergies: string | null;
}

export async function findOrderWorkshops(db: Executor, orderIds: readonly string[]): Promise<Map<string, OrderWorkshop>> {
  const found = new Map<string, OrderWorkshop>();
  if (orderIds.length === 0) return found;
  const { rows } = (await db.execute(sql`
    select r.order_id as "orderId", e.id as "eventId", e.slug, e.title_en as "titleEn", e.title_fr as "titleFr", e.address, e.map_url as "mapUrl",
      r.cakes, r.people_names as "peopleNames", r.allergies
    from workshop_registration r join workshop_event e on e.id = r.event_id
    where r.order_id in (${sql.join(orderIds.map((id) => sql`${id}::uuid`), sql`, `)})
  `)) as unknown as { rows: (OrderWorkshop & { orderId: string })[] };
  for (const { orderId, ...row } of rows) found.set(orderId, { ...row, cakes: Number(row.cakes) });
  return found;
}
