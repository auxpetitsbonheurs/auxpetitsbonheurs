import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { emailStatusEnum, localeEnum } from "./enums";
import { orders } from "./orders";
import { admin } from "./people";

const tz = { withTimezone: true } as const;

/**
 * Gap-free counters. Order numbers are allocated with
 * `UPDATE counter SET value = value + 1 WHERE name = 'order_number' RETURNING value`
 * inside the order-insert transaction, so a rollback releases the number (NFR-013).
 */
export const counter = pgTable("counter", {
  name: text("name").primaryKey(),
  value: integer("value").notNull().default(0),
}).enableRLS();

/** Transactional outbox: rows are inserted with the business change, sent after commit, retried by cron. */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    template: text("template").notNull(),
    toEmail: text("to_email").notNull(),
    locale: localeEnum("locale").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    dedupeKey: text("dedupe_key").notNull().unique(),
    status: emailStatusEnum("status").notNull().default("pending"),
    attempts: smallint("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", tz).notNull().defaultNow(),
    lastError: text("last_error"),
    providerId: text("provider_id"),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    sentAt: timestamp("sent_at", tz),
  },
  (t) => [
    index("email_outbox_due_idx").on(t.nextAttemptAt).where(sql`${t.status} = 'pending'`),
  ],
).enableRLS();

export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => admin.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    failureCount: smallint("failure_count").notNull().default(0),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    lastSuccessAt: timestamp("last_success_at", tz),
  },
  (t) => [index("push_subscription_admin_idx").on(t.adminId)],
).enableRLS();

/** Fixed-window rate limit counters; key = `<action>:<sha256(ip|email)>`. Purged hourly. */
export const rateLimitBucket = pgTable(
  "rate_limit_bucket",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", tz).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
).enableRLS();

/** Once-only guard for cron jobs: INSERT ... ON CONFLICT DO NOTHING. */
export const jobRun = pgTable(
  "job_run",
  {
    job: text("job").notNull(),
    runKey: text("run_key").notNull(),
    ranAt: timestamp("ran_at", tz).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.job, t.runKey] })],
).enableRLS();
