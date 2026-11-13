import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { galleryPhoto, product, promotion } from "./catalogue";
import {
  actorTypeEnum,
  fulfilmentEnum,
  localeEnum,
  orderSourceEnum,
  orderStatusEnum,
} from "./enums";
import type { OrderItemOption, TimeWindow } from "./json-types";
import { admin, customer } from "./people";

const tz = { withTimezone: true } as const;

/**
 * `orders` (plural: `order` is reserved). Every mutation bumps `version` with
 * `WHERE version = <loaded>`; zero rows updated means ORDER_CHANGED (FR-054).
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").notNull().unique(),
    /**
     * The Settings prefix at placement ("APB-"), so a later prefix change leaves this order's
     * number as it was (S-058 AC6). Filled by the `orders_number_prefix` trigger when not given.
     */
    numberPrefix: text("number_prefix"),
    source: orderSourceEnum("source").notNull(),
    status: orderStatusEnum("status").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id, { onDelete: "restrict" }),
    contactName: text("contact_name").notNull(),
    contactPhone: text("contact_phone").notNull(),
    contactEmail: text("contact_email"),
    fulfilment: fulfilmentEnum("fulfilment").notNull(),
    address: text("address"),
    landmark: text("landmark"),
    fulfilOn: date("fulfil_on").notNull(),
    timeWindow: jsonb("time_window").$type<TimeWindow>().notNull(),
    itemsTotalRs: integer("items_total_rs").notNull(),
    deliveryFeeRs: integer("delivery_fee_rs").notNull().default(0),
    totalRs: integer("total_rs").notNull(),
    totalOverridden: boolean("total_overridden").notNull().default(false),
    paid: boolean("paid").notNull().default(false),
    paidAt: timestamp("paid_at", tz),
    paidBy: uuid("paid_by").references(() => admin.id, { onDelete: "restrict" }),
    customerNote: text("customer_note"),
    adminNote: text("admin_note"),
    declineReason: text("decline_reason"),
    locale: localeEnum("locale").notNull(),
    trackingToken: text("tracking_token").notNull().unique(),
    idempotencyKey: uuid("idempotency_key").unique(),
    policiesAcceptedAt: timestamp("policies_accepted_at", tz),
    /**
     * Placed by a signed-in customer (E-11 S-212): the order is on their own customer row whatever
     * email was typed, and My orders lists it. Set only by `place_order` from the server session.
     */
    byAccount: boolean("by_account").notNull().default(false),
    pendingAlertSentAt: timestamp("pending_alert_sent_at", tz),
    /** Juice payment (migration 0013): the 12 h unpaid reminder was queued (S-280). */
    paymentReminderSentAt: timestamp("payment_reminder_sent_at", tz),
    /**
     * When the order started waiting for its Juice payment, when that is not its creation:
     * an accepted quote (migration 0016, E-08 S-158). The 24 h deadline and the 12 h reminder
     * count from `coalesce(awaiting_payment_since, created_at)`.
     */
    awaitingPaymentSince: timestamp("awaiting_payment_since", tz),
    /** Why a cancelled order was cancelled: `unpaid` (24 h job, S-280); E-06 adds others. */
    cancelReason: text("cancel_reason"),
    /** Money to send back by Juice after a paid order was refused (S-281); null = none due. */
    refundDueRs: integer("refund_due_rs"),
    refundedAt: timestamp("refunded_at", tz),
    refundedBy: uuid("refunded_by").references(() => admin.id, { onDelete: "restrict" }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [
    index("orders_status_date_idx").on(t.status, t.fulfilOn),
    index("orders_calendar_idx")
      .on(t.fulfilOn)
      .where(sql`${t.status} not in ('declined', 'cancelled', 'closed')`),
    index("orders_customer_idx").on(t.customerId, t.createdAt.desc()),
    index("orders_pending_alert_idx")
      .on(t.createdAt)
      .where(sql`${t.status} = 'pending_approval' and ${t.pendingAlertSentAt} is null`),
    check("orders_address_ck", sql`${t.fulfilment} = 'pickup' or ${t.address} is not null`),
    check(
      "orders_money_ck",
      sql`${t.itemsTotalRs} >= 0 and ${t.deliveryFeeRs} >= 0 and ${t.totalRs} >= 0`,
    ),
    check("orders_paid_ck", sql`${t.paid} or (${t.paidAt} is null and ${t.paidBy} is null)`),
    check("orders_version_ck", sql`${t.version} >= 1`),
    check("orders_refund_ck", sql`(${t.refundDueRs} is null or ${t.refundDueRs} >= 0) and (${t.refundedAt} is null or ${t.refundDueRs} is not null)`),
  ],
).enableRLS();

/** Prices and names are copied at placement and never recomputed (FR-012, FR-017). */
export const orderItem = pgTable(
  "order_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => product.id, { onDelete: "set null" }),
    nameEn: text("name_en").notNull(),
    nameFr: text("name_fr"),
    originalBasePriceRs: integer("original_base_price_rs").notNull(),
    unitBasePriceRs: integer("unit_base_price_rs").notNull(),
    promotionId: uuid("promotion_id").references(() => promotion.id, { onDelete: "set null" }),
    promotionTitleEn: text("promotion_title_en"),
    options: jsonb("options").$type<OrderItemOption[]>().notNull().default(sql`'[]'::jsonb`),
    cakeMessage: text("cake_message"),
    quantity: integer("quantity").notNull(),
    lineTotalRs: integer("line_total_rs").notNull(),
    sortOrder: smallint("sort_order").notNull().default(0),
  },
  (t) => [
    index("order_item_order_idx").on(t.orderId),
    index("order_item_product_idx").on(t.productId),
    check("order_item_qty_ck", sql`${t.quantity} > 0`),
    check(
      "order_item_money_ck",
      sql`${t.lineTotalRs} >= 0 and ${t.unitBasePriceRs} >= 0 and ${t.originalBasePriceRs} >= 0`,
    ),
  ],
).enableRLS();

/** 1:1 with an order of source custom_request. Status lives only on orders.status. */
export const customRequest = pgTable(
  "custom_request",
  {
    orderId: uuid("order_id")
      .primaryKey()
      .references(() => orders.id, { onDelete: "cascade" }),
    occasion: text("occasion"),
    servings: smallint("servings"),
    flavours: text("flavours"),
    theme: text("theme"),
    cakeText: text("cake_text"),
    budgetRs: integer("budget_rs"),
    details: text("details"),
    quoteAmountRs: integer("quote_amount_rs"),
    quoteNote: text("quote_note"),
    quoteExpiresOn: date("quote_expires_on"),
    quoteSentAt: timestamp("quote_sent_at", tz),
    quoteSentBy: uuid("quote_sent_by").references(() => admin.id, { onDelete: "restrict" }),
  },
  (t) => [
    check(
      "custom_request_quote_ck",
      sql`(${t.quoteAmountRs} is null and ${t.quoteExpiresOn} is null)
        or (${t.quoteAmountRs} >= 0 and ${t.quoteExpiresOn} is not null)`,
    ),
  ],
).enableRLS();

export const customRequestPhoto = pgTable(
  "custom_request_photo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => customRequest.orderId, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    sortOrder: smallint("sort_order").notNull(),
    sourceGalleryPhotoId: uuid("source_gallery_photo_id").references(() => galleryPhoto.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    unique("custom_request_photo_slot_key").on(t.orderId, t.sortOrder),
    check("custom_request_photo_slot_ck", sql`${t.sortOrder} between 0 and 4`),
  ],
).enableRLS();

/** Append-only activity log, written in the same transaction as the change (FR-045). */
export const orderEvent = pgTable(
  "order_event",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorAdminId: uuid("actor_admin_id").references(() => admin.id, { onDelete: "restrict" }),
    type: text("type").notNull(),
    fromStatus: orderStatusEnum("from_status"),
    toStatus: orderStatusEnum("to_status"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [
    index("order_event_order_idx").on(t.orderId, t.createdAt),
    check(
      "order_event_actor_ck",
      sql`(${t.actorType} = 'admin') = (${t.actorAdminId} is not null)`,
    ),
  ],
).enableRLS();
