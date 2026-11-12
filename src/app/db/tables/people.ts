import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { adminRoleEnum, localeEnum } from "./enums";
import { authUsers } from "./supabase-auth";

const tz = { withTimezone: true } as const;

export const customer = pgTable(
  "customer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    locale: localeEnum("locale").notNull().default("en"),
    authUserId: uuid("auth_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    adminNote: text("admin_note"),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("customer_email_key").on(t.email).where(sql`${t.email} is not null`),
    uniqueIndex("customer_auth_user_key").on(t.authUserId).where(sql`${t.authUserId} is not null`),
    index("customer_phone_idx").on(t.phone),
  ],
).enableRLS();

export const customerAddress = pgTable(
  "customer_address",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id, { onDelete: "cascade" }),
    label: text("label"),
    address: text("address").notNull(),
    landmark: text("landmark"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [
    index("customer_address_customer_idx").on(t.customerId),
    // At most one default address per customer; setting a new default clears the old one in the same transaction.
    uniqueIndex("customer_address_default_uq").on(t.customerId).where(sql`${t.isDefault}`),
  ],
).enableRLS();

export const admin = pgTable("admin", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: adminRoleEnum("role").notNull(),
  active: boolean("active").notNull().default(true),
  alertPush: boolean("alert_push").notNull().default(true),
  alertEmail: boolean("alert_email").notNull().default(true),
  locale: localeEnum("locale").notNull().default("en"),
  lastSignInAt: timestamp("last_sign_in_at", tz),
  deactivatedAt: timestamp("deactivated_at", tz),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
}).enableRLS();

/** Own invitation tokens: Supabase invite links cannot stay valid for 7 days (FR-042). */
export const adminInvitation = pgTable(
  "admin_invitation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: adminRoleEnum("role").notNull(),
    /** Language of the invitation email and the accept page (S-028 AC1, S-029 AC10). */
    locale: localeEnum("locale").notNull().default("en"),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => admin.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expires_at", tz).notNull(),
    acceptedAt: timestamp("accepted_at", tz),
    revokedAt: timestamp("revoked_at", tz),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [
    index("admin_invitation_email_idx").on(t.email),
    // At most one open (not accepted, not revoked) row per address: a new invite revokes the old one first (S-028).
    uniqueIndex("admin_invitation_open_email_uq")
      .on(sql`lower(${t.email})`)
      .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
  ],
).enableRLS();
