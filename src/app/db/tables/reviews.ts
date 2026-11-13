// Bakery reviews (E-14, S-261; data-model.md `review`, `review_event`). One review per customer
// account; nothing is public until an Owner or Admin approves it. RLS is on with no policies
// (architecture "Security": the app's database role does every read and write and checks the
// session itself; the public anon key can read nothing).
import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { localeEnum } from "./enums";
import { admin, customer } from "./people";

const tz = { withTimezone: true } as const;

export const reviewStatusEnum = pgEnum("review_status", ["pending", "approved", "rejected", "hidden"]);
export const reviewActionEnum = pgEnum("review_action", ["approve", "reject", "hide", "show", "delete", "undo"]);

/**
 * The review. No email, phone, address or order link (S-261 AC1, S-268 AC3): the reviewer is the
 * customer row (deleted with it, S-268 AC2) and the public name is `display_name`, first name and
 * last initial, taken from the profile when sent and refreshed when approved.
 */
export const review = pgTable(
  "review",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id, { onDelete: "cascade" }),
    rating: smallint("rating").notNull(),
    comment: text("comment").notNull(),
    displayName: text("display_name").notNull(),
    /** The page language the review was written on: shown with that `lang` (S-266 AC6). */
    locale: localeEnum("locale").notNull(),
    status: reviewStatusEnum("status").notNull().default("pending"),
    decidedBy: uuid("decided_by").references(() => admin.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", tz),
    /** Bumped on every change: a decision names the version it saw (REVIEW_CHANGED, S-263 AC4). */
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("review_customer_key").on(t.customerId),
    // Public read (latest approved first) and the aggregate (S-261 AC8).
    index("review_approved_idx").on(t.decidedAt.desc()).where(sql`${t.status} = 'approved'`),
    // Admin tabs and the "to approve" count (S-263, S-264).
    index("review_status_idx").on(t.status, t.updatedAt.desc()),
    check("review_rating_ck", sql`${t.rating} between 1 and 5`),
    check("review_comment_ck", sql`char_length(btrim(${t.comment})) between 1 and 1000 and ${t.comment} = btrim(${t.comment})`),
    check("review_display_name_ck", sql`char_length(btrim(${t.displayName})) between 1 and 80`),
    check("review_version_ck", sql`${t.version} >= 1`),
  ],
).enableRLS();

/**
 * Who decided what about a review, and when (S-263 AC8, S-265 AC7, S-268 AC6): never the comment
 * or the name. `review_id` keeps no foreign key so the line outlives a deleted review.
 */
export const reviewEvent = pgTable(
  "review_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id").notNull(),
    action: reviewActionEnum("action").notNull(),
    adminId: uuid("admin_id").references(() => admin.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [index("review_event_review_idx").on(t.reviewId, t.createdAt)],
).enableRLS();
