// Customer account rows (E-11; contracts.md "Customer matching", threat-model G-01/G-02). The
// account is the `customer` row whose `auth_user_id` is the session's Auth user. Only
// `linkConfirmedAccount` (called from `auth/confirm` once the email is proven) ever sets
// `auth_user_id`, and it matches by email only, never by phone.
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { admin, customer, orderItem, orders } from "~/db/schema";
import type { ReorderItem } from "~/domain/reorder";
import { normalizePhone } from "~/domain/phone";
import type { Locale } from "~/lib/locale";
import type { Database, Executor } from "~/server/db.server";

export interface CustomerAccount {
  id: string;
  name: string;
  /** E.164, or "" when the account was made without one. */
  phone: string;
  email: string | null;
  locale: Locale;
  /** The confirmed address the session carries (the identity; My orders filters on it). */
  authEmail: string;
}

const accountColumns = { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email, locale: customer.locale };

/** The customer row linked to this Auth user, or null (an admin, or an unlinked user). */
export async function findAccountByAuthUser(db: Executor, authUserId: string): Promise<Omit<CustomerAccount, "authEmail"> | null> {
  const [row] = await db.select(accountColumns).from(customer).where(eq(customer.authUserId, authUserId)).limit(1);
  return row ?? null;
}

/** True when the address belongs to an admin (active or not): it never becomes a customer account. */
export async function isAdminEmail(db: Executor, email: string): Promise<boolean> {
  const [row] = await db.select({ id: admin.id }).from(admin).where(sql`lower(${admin.email}) = ${email.toLowerCase()}`).limit(1);
  return row !== undefined;
}

/** The customer row already linked to an Auth user for this address (a confirmed account), if any. */
export async function hasLinkedAccount(db: Executor, email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: customer.id })
    .from(customer)
    .where(sql`lower(${customer.email}) = ${email.toLowerCase()} and ${customer.authUserId} is not null`)
    .limit(1);
  return row !== undefined;
}

export interface SignUpMetadata {
  name: string;
  phone: string;
  locale: Locale;
}

/** The sign-up details Auth kept in `user_metadata`, made safe (unknown shapes become defaults). */
export function readSignUpMetadata(metadata: Record<string, unknown>): SignUpMetadata {
  const name = typeof metadata.name === "string" ? metadata.name.trim().slice(0, 80) : "";
  const phone = typeof metadata.phone === "string" ? (normalizePhone(metadata.phone) ?? "") : "";
  return { name, phone, locale: metadata.locale === "fr" ? "fr" : "en" };
}

export type LinkResult =
  | { ok: true; customerId: string; created: boolean; alreadyLinked: boolean; linkedOrders: number }
  /** The address is an admin's (S-216 AC9) or another Auth user already holds the row. */
  | { ok: false; reason: "admin" | "conflict" };

/**
 * Links a just-confirmed Auth user to its customer row (S-216 AC2): in one transaction,
 * `UPDATE customer SET auth_user_id = :uid WHERE lower(email) = :email AND auth_user_id IS NULL`,
 * else a new row from the sign-up details. Two concurrent confirmations both end on the
 * same row (the unique indexes decide; the loser re-reads, no error page, AC10). The sign-up
 * details only fill a NEW row: an existing guest row keeps its own name and phone, so whoever
 * typed the sign-up form cannot change the real owner's details (G-01).
 */
export async function linkConfirmedAccount(db: Database, user: { userId: string; email: string; metadata: Record<string, unknown> }): Promise<LinkResult> {
  const email = user.email.toLowerCase();
  if (await isAdminEmail(db, email)) return { ok: false, reason: "admin" };
  return db.transaction(async (tx) => {
    const already = await findAccountByAuthUser(tx, user.userId);
    if (already) return { ok: true, customerId: already.id, created: false, alreadyLinked: true, linkedOrders: await countLinkedOrders(tx, already.id, email) };
    const [linked] = await tx
      .update(customer)
      .set({ authUserId: user.userId, updatedAt: sql`now()` })
      .where(and(sql`lower(${customer.email}) = ${email}`, isNull(customer.authUserId)))
      .returning({ id: customer.id });
    if (linked) return { ok: true, customerId: linked.id, created: false, alreadyLinked: false, linkedOrders: await countLinkedOrders(tx, linked.id, email) };
    const details = readSignUpMetadata(user.metadata);
    const [created] = await tx
      .insert(customer)
      .values({ name: details.name, phone: details.phone, email, locale: details.locale, authUserId: user.userId })
      .onConflictDoNothing()
      .returning({ id: customer.id });
    if (created) return { ok: true, customerId: created.id, created: true, alreadyLinked: false, linkedOrders: 0 };
    // Lost a race to a concurrent confirmation of the same user: that one linked it.
    const winner = await findAccountByAuthUser(tx, user.userId);
    if (winner) return { ok: true, customerId: winner.id, created: false, alreadyLinked: true, linkedOrders: await countLinkedOrders(tx, winner.id, email) };
    return { ok: false, reason: "conflict" };
  });
}

/**
 * `account/profile` updateProfile (S-210): the signed-in customer's own row only (the id comes
 * from the session, never the form). Past orders keep their `contact_*` snapshot (AC5).
 */
export async function updateProfile(db: Executor, customerId: string, profile: { name: string; phone: string; locale: Locale }): Promise<void> {
  await db.update(customer).set({ name: profile.name, phone: profile.phone, locale: profile.locale, updatedAt: sql`now()` }).where(eq(customer.id, customerId));
}

/** A row of My orders (S-213): what the card shows, plus the tracking token for its link. */
export interface AccountOrderRow {
  id: string;
  number: number;
  numberPrefix: string | null;
  status: (typeof orders.$inferSelect)["status"];
  source: (typeof orders.$inferSelect)["source"];
  fulfilment: (typeof orders.$inferSelect)["fulfilment"];
  fulfilOn: string;
  timeWindow: (typeof orders.$inferSelect)["timeWindow"];
  totalRs: number;
  createdAt: Date;
  trackingToken: string;
}

/** My orders shows at most this many (newest first); older ones stay reachable by their tracking link. */
export const ACCOUNT_ORDERS_LIMIT = 100;

/**
 * The orders of this account (contracts `account/orders`, threat-model G-02): `customer_id` is
 * the session's row AND (`lower(contact_email)` = the confirmed address OR `source = manual` OR
 * placed while signed in, `by_account`, S-212).
 * Another person's guest order that happens to share a row is never listed.
 */
export async function listAccountOrders(db: Executor, customerId: string, confirmedEmail: string): Promise<AccountOrderRow[]> {
  return db
    .select({
      id: orders.id,
      number: orders.number,
      numberPrefix: orders.numberPrefix,
      status: orders.status,
      source: orders.source,
      fulfilment: orders.fulfilment,
      fulfilOn: orders.fulfilOn,
      timeWindow: orders.timeWindow,
      totalRs: orders.totalRs,
      createdAt: orders.createdAt,
      trackingToken: orders.trackingToken,
    })
    .from(orders)
    .where(and(eq(orders.customerId, customerId), sql`(lower(${orders.contactEmail}) = ${confirmedEmail.toLowerCase()} or ${orders.source} = 'manual' or ${orders.byAccount})`))
    .orderBy(sql`${orders.createdAt} desc`)
    .limit(ACCOUNT_ORDERS_LIMIT);
}

/** The order behind a Save my details link (S-215): a website order that has an email. */
export interface SaveDetailsOrder {
  email: string;
  name: string;
  phone: string;
  locale: Locale;
}

/** By tracking token; null for an unknown token, a custom request or an order without an email (AC5, AC6). */
export async function findSaveDetailsOrder(db: Executor, trackingToken: string): Promise<SaveDetailsOrder | null> {
  const [row] = await db
    .select({ email: orders.contactEmail, name: orders.contactName, phone: orders.contactPhone, locale: orders.locale, source: orders.source })
    .from(orders)
    .where(eq(orders.trackingToken, trackingToken))
    .limit(1);
  if (!row || row.source !== "website" || !row.email) return null;
  return { email: row.email.toLowerCase(), name: row.name, phone: row.phone, locale: row.locale };
}

/**
 * A past order's items for Reorder (S-214 AC7): only when the order passes the same ownership
 * filter as My orders; null otherwise (NOT_FOUND, whether it exists or not).
 */
export async function findReorderItems(db: Executor, customerId: string, confirmedEmail: string, orderId: string): Promise<ReorderItem[] | null> {
  const [own] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.customerId, customerId), sql`(lower(${orders.contactEmail}) = ${confirmedEmail.toLowerCase()} or ${orders.source} = 'manual' or ${orders.byAccount})`))
    .limit(1);
  if (!own) return null;
  const rows = await db
    .select({ productId: orderItem.productId, nameEn: orderItem.nameEn, nameFr: orderItem.nameFr, options: orderItem.options, cakeMessage: orderItem.cakeMessage, quantity: orderItem.quantity })
    .from(orderItem)
    .where(eq(orderItem.orderId, orderId))
    .orderBy(asc(orderItem.sortOrder));
  return rows.map((row) => ({
    productId: row.productId,
    name: { en: row.nameEn, fr: row.nameFr ?? row.nameEn },
    options: row.options.map((o) => ({ groupId: o.groupId, choiceId: o.choiceId ?? null, text: o.text, quantity: o.quantity })),
    cakeMessage: row.cakeMessage,
    quantity: row.quantity,
  }));
}

/** Orders My orders will show for this row and confirmed address (contracts `account/orders` filter). */
async function countLinkedOrders(db: Executor, customerId: string, email: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(eq(orders.customerId, customerId), sql`(lower(${orders.contactEmail}) = ${email} or ${orders.source} = 'manual')`));
  return row?.count ?? 0;
}
