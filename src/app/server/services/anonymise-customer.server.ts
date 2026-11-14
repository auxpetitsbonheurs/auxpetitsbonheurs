// Customer erasure (PRV-02; S-229 AC6; data-model "Customer personal"): the Owner's "Anonymise
// customer" action and the 5-year retention job share one statement. Orders, their items and
// money stay (Sales and the customer's totals do not change); every personal value goes:
//   - customer: name and phone become "Deleted customer", email, private note and Auth link are
//     cleared, `anonymised_at` is set (search never finds the row again);
//   - each order: contact name/phone "Deleted customer", email cleared, a delivery address becomes
//     "Deleted customer" (the database requires one), landmark and notes cleared; `version` is
//     bumped so an admin screen opened before cannot write the old values back;
//   - edit history: contact and address values are removed from `edited` diffs;
//   - custom cake requests: cake text and details cleared, uploaded photos queued for removal;
//   - workshop registrations: allergies and the people's names cleared (E-15 S-308);
//   - saved addresses and the review are deleted; outbox rows lose the address (pending ones die).
// One round trip and one transaction (data-modifying CTEs): nothing is left half done.
import { type SQL, eq, sql } from "drizzle-orm";
import { customer, orders } from "~/db/schema";
import { REQUEST_PHOTOS_BUCKET } from "~/domain/custom-request";
import { DELETED_CUSTOMER_NAME } from "~/domain/customer-totals";
import type { Executor } from "~/server/db.server";
import type { UserAdmin } from "~/server/user-admin.server";

/** An order in one of these is finished; any other status blocks the anonymise (its contact is still needed). */
export const FINISHED_ORDER_STATUSES = ["completed", "declined", "cancelled", "closed"] as const;

/** Personal fields an `edited` event's diff may hold (domain/order-edit FIELDS). */
export const PERSONAL_DIFF_KEYS = ["address", "landmark", "contactName", "contactPhone", "contactEmail", "customerNote"] as const;

const list = (values: readonly string[]) => sql.join(values.map((value) => sql`${value}`), sql`, `);

/**
 * Anonymises the customers `where` selects (alias `c`) that are not anonymised yet and have no
 * open order, at most `limit`; returns the ids it changed.
 */
export async function anonymiseWhere(db: Executor, where: SQL, now: Date, limit: number): Promise<string[]> {
  const at = sql`${now.toISOString()}::timestamptz`;
  const gone = DELETED_CUSTOMER_NAME;
  const { rows } = (await db.execute(sql`
    with target as (
      select c.id, lower(c.email) as email from customer c
      where c.anonymised_at is null and (${where})
        and not exists (select 1 from orders o where o.customer_id = c.id and o.status not in (${list(FINISHED_ORDER_STATUSES)}))
      order by c.id limit ${limit}
      for update of c
    ), cust as (
      update customer c set name = ${gone}, phone = ${gone}, email = null, admin_note = null, auth_user_id = null, anonymised_at = ${at}, updated_at = ${at}
      from target t where c.id = t.id
      returning c.id
    ), ord as (
      update orders o set contact_name = ${gone}, contact_phone = ${gone}, contact_email = null,
        address = case when o.address is null then null else ${gone} end, landmark = null, customer_note = null, admin_note = null,
        version = o.version + 1, updated_at = ${at}
      from target t where o.customer_id = t.id
      returning o.id
    ), history as (
      update order_event e set details = jsonb_set(e.details, '{diff}', (e.details -> 'diff') - array[${list(PERSONAL_DIFF_KEYS)}]::text[])
      from ord where e.order_id = ord.id and jsonb_typeof(e.details -> 'diff') = 'object'
    ), workshop as (
      -- Workshop registrations (E-15 S-308): the allergies (health data) and the people's names go.
      update workshop_registration w set allergies = null, people_names = null from ord where w.order_id = ord.id
    ), request as (
      update custom_request r set cake_text = null, details = null from ord where r.order_id = ord.id
    ), photos as (
      delete from custom_request_photo p using ord where p.order_id = ord.id and p.source_gallery_photo_id is null
      returning p.storage_path
    ), queued as (
      insert into storage_purge (bucket, path, due_at) select ${REQUEST_PHOTOS_BUCKET}, storage_path, ${at} from photos
      on conflict (bucket, path) do nothing
    ), addresses as (
      delete from customer_address a using target t where a.customer_id = t.id
    ), reviews as (
      delete from review r using target t where r.customer_id = t.id
    ), mail as (
      update email_outbox m set to_email = '', payload = '{}'::jsonb,
        status = case when m.status = 'pending' then 'dead'::email_status else m.status end,
        last_error = case when m.status = 'pending' then 'anonymised' else m.last_error end
      where m.order_id in (select id from ord) or lower(m.to_email) in (select email from target where email is not null)
    )
    select id from cust
  `)) as unknown as { rows: { id: string }[] };
  return rows.map((row) => row.id);
}

export type AnonymiseResult =
  | { ok: true; outcome: "anonymised" | "already" }
  | { ok: false; code: "NOT_FOUND" | "AUTH_FAILED" }
  | { ok: false; code: "OPEN_ORDERS"; openOrders: number };

export interface AnonymiseContext {
  db: Executor;
  users: UserAdmin;
  now: Date;
}

async function openOrderCount(db: Executor, id: string): Promise<number> {
  const { rows } = (await db.execute(
    sql`select count(*)::int as n from ${orders} where ${orders.customerId} = ${id}::uuid and ${orders.status} not in (${list(FINISHED_ORDER_STATUSES)})`,
  )) as unknown as { rows: { n: number }[] };
  return Number(rows[0]?.n ?? 0);
}

/**
 * The Owner's action (idempotent). A sign-in account is deleted first: if Auth refuses, nothing
 * has changed and the Owner retries; if the statement then fails, the retry finds no account.
 */
export async function anonymiseCustomer(context: AnonymiseContext, id: string): Promise<AnonymiseResult> {
  const [row] = await context.db
    .select({ authUserId: customer.authUserId, anonymisedAt: customer.anonymisedAt })
    .from(customer)
    .where(eq(customer.id, id));
  if (!row) return { ok: false, code: "NOT_FOUND" };
  if (row.anonymisedAt) return { ok: true, outcome: "already" };
  const open = await openOrderCount(context.db, id);
  if (open > 0) return { ok: false, code: "OPEN_ORDERS", openOrders: open };
  if (row.authUserId && !(await context.users.deleteUser(row.authUserId))) return { ok: false, code: "AUTH_FAILED" };
  const changed = await anonymiseWhere(context.db, sql`c.id = ${id}::uuid`, context.now, 1);
  if (changed.length > 0) return { ok: true, outcome: "anonymised" };
  // Lost a race: another tab finished it, or an order was placed in between.
  const again = await openOrderCount(context.db, id);
  return again > 0 ? { ok: false, code: "OPEN_ORDERS", openOrders: again } : { ok: true, outcome: "already" };
}
