// Workshop events (E-15, ADR-0005; data-model.md `workshop_event`, `workshop_registration`).
// A registration is an `orders` row of source `workshop` (status, payment, refunds, tracking,
// lists and sales work as for any order) plus its 1:1 `workshop_registration` row (the event,
// the number of cakes, the people's names and the allergies). Places held = the cakes of the
// event's registrations whose order is active (not declined, cancelled or closed); the
// `register_workshop` procedure checks them under the event row's lock (one CALL).
import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { LocalizedText } from "./json-types";
import { orders } from "./orders";
import { admin } from "./people";

const tz = { withTimezone: true } as const;

/** One cake the participant may choose ("Chocolate", "Red velvet"); `id` is stable across edits. */
export type WorkshopCakeOption = { id: string; name: LocalizedText };

export const workshopEvent = pgTable(
  "workshop_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `/workshops/<slug>`; made from the English title when created, kept after edits. */
    slug: text("slug").notNull().unique(),
    titleEn: text("title_en").notNull(),
    titleFr: text("title_fr"),
    descriptionEn: text("description_en").notNull().default(""),
    descriptionFr: text("description_fr"),
    photoPath: text("photo_path"),
    /** Widths of the smaller copies beside the photo (480/960, S-276); empty = original only. */
    photoVariants: smallint("photo_variants").array().notNull().default(sql`'{}'::smallint[]`),
    /** Mauritius date of the event. */
    eventOn: date("event_on").notNull(),
    /** "HH:MM", Mauritius time. */
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    address: text("address").notNull(),
    mapUrl: text("map_url"),
    /** Price of one registration (one cake, up to 2 people), in rupees. */
    priceRs: integer("price_rs").notNull(),
    /** Number of cakes (stations). */
    capacity: smallint("capacity").notNull(),
    cakeOptions: jsonb("cake_options").$type<WorkshopCakeOption[]>().notNull(),
    /** draft (not shown), published, cancelled (registrants told), completed (it happened). */
    status: text("status").notNull().default("draft"),
    cancelReason: text("cancel_reason"),
    cancelledAt: timestamp("cancelled_at", tz),
    completedAt: timestamp("completed_at", tz),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by").references(() => admin.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => admin.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [
    index("workshop_event_date_idx").on(t.eventOn),
    check("workshop_event_status_ck", sql`${t.status} in ('draft', 'published', 'cancelled', 'completed')`),
    check("workshop_event_time_ck", sql`${t.startsAt} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ${t.endsAt} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ${t.endsAt} > ${t.startsAt}`),
    check("workshop_event_money_ck", sql`${t.priceRs} >= 0`),
    check("workshop_event_capacity_ck", sql`${t.capacity} between 1 and 200`),
    check("workshop_event_options_ck", sql`jsonb_typeof(${t.cakeOptions}) = 'array' and jsonb_array_length(${t.cakeOptions}) between 1 and 10`),
    check("workshop_event_version_ck", sql`${t.version} >= 1`),
  ],
).enableRLS();

/**
 * 1:1 with an order of source `workshop`. The cake choices are the order's items (one line per
 * choice, quantity = cakes of that choice); the message is `orders.customer_note`.
 * `allergies` is health data (NFR-004): null = "None" was chosen (or it was anonymised); it is
 * shown to admins on the registration and the printable list, never in admin alerts.
 */
export const workshopRegistration = pgTable(
  "workshop_registration",
  {
    orderId: uuid("order_id")
      .primaryKey()
      .references(() => orders.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => workshopEvent.id, { onDelete: "restrict" }),
    cakes: smallint("cakes").notNull(),
    peopleNames: text("people_names"),
    allergies: text("allergies"),
  },
  (t) => [index("workshop_registration_event_idx").on(t.eventId), check("workshop_registration_cakes_ck", sql`${t.cakes} between 1 and 200`)],
).enableRLS();
