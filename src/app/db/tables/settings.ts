import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  FaqEntry,
  HeroContent,
  LocalizedText,
  TimeWindow,
  WhatsappTemplates,
} from "./json-types";
import { admin } from "./people";

const tz = { withTimezone: true } as const;

/** Singleton row (id = 1). Defaults are PRD assumption A1 and are editable by the Owner. */
export const settings = pgTable(
  "settings",
  {
    id: smallint("id").primaryKey().default(1),
    defaultNoticeDays: smallint("default_notice_days").notNull().default(3),
    /** ISO weekdays 1 (Mon) .. 7 (Sun). Default: Sunday closed. */
    closedWeekdays: smallint("closed_weekdays").array().notNull().default(sql`'{7}'::smallint[]`),
    deliveryWindows: jsonb("delivery_windows").$type<TimeWindow[]>().notNull(),
    pickupWindows: jsonb("pickup_windows").$type<TimeWindow[]>().notNull(),
    deliveryFeeRs: integer("delivery_fee_rs").notNull().default(200),
    pickupAddress: text("pickup_address"),
    pickupMapUrl: text("pickup_map_url"),
    contactPhone: text("contact_phone"),
    contactWhatsapp: text("contact_whatsapp"),
    contactEmail: text("contact_email"),
    /** Juice payment details (S-277): Owner-only, shown only on an order's token pages, never public. */
    juiceName: text("juice_name"),
    juiceNumber: text("juice_number"),
    paymentWhatsapp: text("payment_whatsapp"),
    instagramUrl: text("instagram_url"),
    hero: jsonb("hero").$type<HeroContent>(),
    featuredProductIds: uuid("featured_product_ids").array().notNull().default(sql`'{}'::uuid[]`),
    about: jsonb("about").$type<LocalizedText>(),
    aboutImagePath: text("about_image_path"),
    /** Widths of the smaller copies of the hero and About images (S-276); empty = original only. */
    heroImageVariants: smallint("hero_image_variants").array().notNull().default(sql`'{}'::smallint[]`),
    aboutImageVariants: smallint("about_image_variants").array().notNull().default(sql`'{}'::smallint[]`),
    faq: jsonb("faq").$type<LocalizedText | FaqEntry[]>().notNull().default(sql`'[]'::jsonb`),
    policies: jsonb("policies").$type<LocalizedText>(),
    privacyNote: jsonb("privacy_note").$type<LocalizedText>(),
    whatsappTemplates: jsonb("whatsapp_templates").$type<WhatsappTemplates>(),
    quoteValidityDays: smallint("quote_validity_days").notNull().default(5),
    cakeMessageMax: smallint("cake_message_max").notNull().default(40),
    eveningReminderAt: text("evening_reminder_at").notNull().default("18:00"),
    orderNumberPrefix: text("order_number_prefix").notNull().default("APB-"),
    /**
     * Invoice (S-127): the business and bank details printed on invoices, Owner-only. The legal
     * name, BRN and address also fill the privacy note. Terms and thank-you line are `{ en, fr }`.
     */
    invoiceLegalName: text("invoice_legal_name"),
    invoiceBrn: text("invoice_brn"),
    invoiceAddress: text("invoice_address"),
    invoicePhone: text("invoice_phone"),
    bankName: text("bank_name"),
    bankAccountName: text("bank_account_name"),
    bankAccountNumber: text("bank_account_number"),
    invoicePaymentTerms: jsonb("invoice_payment_terms").$type<LocalizedText>(),
    invoiceThankYou: jsonb("invoice_thank_you").$type<LocalizedText>(),
    /** The number the next first invoice takes (S-127); one statement takes and bumps it. Never bumps `version`. */
    nextInvoiceNumber: integer("next_invoice_number").notNull().default(1108),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
    updatedBy: uuid("updated_by").references(() => admin.id, { onDelete: "set null" }),
  },
  (t) => [
    check("settings_singleton_ck", sql`${t.id} = 1`),
    check(
      "settings_values_ck",
      sql`${t.defaultNoticeDays} >= 0 and ${t.deliveryFeeRs} >= 0
        and ${t.quoteValidityDays} >= 1 and ${t.cakeMessageMax} >= 1`,
    ),
    check("settings_next_invoice_ck", sql`${t.nextInvoiceNumber} between 1 and 99999999`),
  ],
).enableRLS();

/** Blocked day or range (Mauritius dates, inclusive). Never alters existing orders (FR-059). */
export const blockedDate = pgTable(
  "blocked_date",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    reason: text("reason"),
    createdBy: uuid("created_by").references(() => admin.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [
    index("blocked_date_range_idx").on(t.startsOn, t.endsOn),
    check("blocked_date_range_ck", sql`${t.endsOn} >= ${t.startsOn}`),
  ],
).enableRLS();
