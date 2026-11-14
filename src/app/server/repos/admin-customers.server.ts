// Customers for the admin app (contracts.md `admin/customers`, `admin/customer`; FR-065).
// Totals are aggregated from the orders on every read (never stored); the list pages with a
// keyset cursor on the chosen sort key plus the id, so pages never repeat or skip a row.
import { type SQL, desc, eq, sql } from "drizzle-orm";
import { customer, orders, settings } from "~/db/schema";
import { escapeLike } from "~/domain/customer-search";
import { COUNTED_STATUSES, DELETED_CUSTOMER_NAME, SPENT_STATUSES, customerTotals } from "~/domain/customer-totals";
import type { OrderStatus } from "~/domain/status";
import type { Locale } from "~/lib/locale";
import type { Executor } from "~/server/db.server";

export const CUSTOMER_SORTS = ["last_order", "name", "spent"] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export interface CustomerListRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  orderCount: number;
  totalSpentRs: number;
  /** Mauritius date of the latest order placed, any status; null without orders. */
  lastOrderOn: string | null;
}

export interface CustomerListPage {
  rows: CustomerListRow[];
  nextCursor: string | null;
  /** Rows matching the search, all pages. */
  total: number;
}

const inList = (statuses: ReadonlySet<OrderStatus>) => sql.join([...statuses].map((s) => sql`${s}`), sql`, `);

const SORT_KEY: Record<CustomerSort, { key: SQL; dir: "asc" | "desc" }> = {
  last_order: { key: sql`last_key`, dir: "desc" },
  name: { key: sql`name_key`, dir: "asc" },
  spent: { key: sql`spent`, dir: "desc" },
};

interface Cursor {
  s: CustomerSort;
  k: string | number;
  id: string;
}

function encodeCursor(cursor: Cursor): string {
  return btoa(JSON.stringify(cursor)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** The cursor, or null when it is missing, malformed or made for another sort (first page). */
function decodeCursor(raw: string | null, sort: CustomerSort): Cursor | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(atob(raw.replaceAll("-", "+").replaceAll("_", "/"))) as Partial<Cursor>;
    const keyType = sort === "name" ? "string" : "number";
    if (value.s !== sort || typeof value.k !== keyType || typeof value.id !== "string" || !/^[0-9a-f-]{36}$/.test(value.id)) return null;
    return value as Cursor;
  } catch {
    return null;
  }
}

/** Name, email, or phone digits (S-175); anonymised customers are never found (AC6). */
function searchWhere(search: { text: string; digits: string | null }): SQL {
  if (search.text === "") return sql`true`;
  const pattern = `%${escapeLike(search.text)}%`;
  const byDigits = search.digits ? sql` or regexp_replace(${customer.phone}, '\\D', '', 'g') like ${`%${search.digits}%`}` : sql``;
  return sql`${customer.name} <> ${DELETED_CUSTOMER_NAME} and (${customer.name} ilike ${pattern} escape '\\' or coalesce(${customer.email}, '') ilike ${pattern} escape '\\'${byDigits})`;
}

interface RawRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  order_count: number | string;
  spent: number | string;
  last_on: string | null;
  last_key: number | string;
  name_key: string;
  total: number | string;
}

export async function listCustomers(
  db: Executor,
  options: { search: { text: string; digits: string | null }; sort: CustomerSort; cursor: string | null; limit: number },
): Promise<CustomerListPage> {
  const { key, dir } = SORT_KEY[options.sort];
  const cursor = decodeCursor(options.cursor, options.sort);
  const after = cursor ? (dir === "desc" ? sql`where (${key}, id) < (${cursor.k}, ${cursor.id}::uuid)` : sql`where (${key}, id) > (${cursor.k}, ${cursor.id}::uuid)`) : sql``;
  const order = dir === "desc" ? sql`${key} desc, id desc` : sql`${key} asc, id asc`;
  const { rows } = (await db.execute(sql`
    with t as (
      select ${customer.id} as id, ${customer.name} as name, ${customer.phone} as phone, ${customer.email} as email,
        (count(${orders.id}) filter (where ${orders.status} in (${inList(COUNTED_STATUSES)})))::int as order_count,
        (coalesce(sum(${orders.totalRs}) filter (where ${orders.status} in (${inList(SPENT_STATUSES)})), 0))::int as spent,
        to_char(max(${orders.createdAt}) at time zone 'Indian/Mauritius', 'YYYY-MM-DD') as last_on,
        (coalesce(extract(epoch from max(${orders.createdAt})), 0))::float8 as last_key,
        lower(${customer.name}) as name_key
      from ${customer} left join ${orders} on ${orders.customerId} = ${customer.id}
      where ${searchWhere(options.search)}
      group by ${customer.id}
    )
    select *, (select count(*) from t)::int as total from t ${after} order by ${order} limit ${options.limit + 1}`)) as unknown as { rows: RawRow[] };
  const shown = rows.slice(0, options.limit);
  const last = shown.at(-1);
  const more = rows.length > options.limit && last !== undefined;
  const lastKey = last ? (options.sort === "name" ? last.name_key : Number(options.sort === "spent" ? last.spent : last.last_key)) : 0;
  return {
    rows: shown.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      orderCount: Number(row.order_count),
      totalSpentRs: Number(row.spent),
      lastOrderOn: row.last_on,
    })),
    nextCursor: more ? encodeCursor({ s: options.sort, k: lastKey, id: last.id }) : null,
    total: rows[0] ? Number(rows[0].total) : await countMatches(db, options.search),
  };
}

async function countMatches(db: Executor, search: { text: string; digits: string | null }): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(customer).where(searchWhere(search));
  return Number(row?.n ?? 0);
}

export interface AdminCustomerOrder {
  id: string;
  number: string;
  contactName: string;
  status: OrderStatus;
  fulfilOn: string;
  totalRs: number;
}

export interface AdminCustomer {
  customer: { id: string; name: string; phone: string; email: string | null; locale: Locale; hasAccount: boolean; adminNote: string | null };
  orders: AdminCustomerOrder[];
  orderCount: number;
  totalSpentRs: number;
}

const shownNumber = sql<string>`coalesce(${orders.numberPrefix}, (select ${settings.orderNumberPrefix} from ${settings} limit 1), '') || lpad(${orders.number}::text, 4, '0')`;

/** A customer with every order, newest first (cancelled and declined included, not in totals). */
export async function findAdminCustomer(db: Executor, id: string): Promise<AdminCustomer | undefined> {
  const [row] = await db
    .select({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      locale: customer.locale,
      hasAccount: sql<boolean>`${customer.authUserId} is not null`,
      adminNote: customer.adminNote,
    })
    .from(customer)
    .where(eq(customer.id, id));
  if (!row) return undefined;
  const list = await db
    .select({ id: orders.id, number: shownNumber, contactName: orders.contactName, status: orders.status, fulfilOn: orders.fulfilOn, totalRs: orders.totalRs })
    .from(orders)
    .where(eq(orders.customerId, id))
    .orderBy(desc(orders.createdAt), desc(orders.number));
  return { customer: row, orders: list, ...customerTotals(list) };
}

/** Last write wins (accepted, no version: contracts.md `saveNote`); false when no such customer. */
export async function saveCustomerNote(db: Executor, id: string, note: string | null): Promise<boolean> {
  const updated = await db.update(customer).set({ adminNote: note, updatedAt: new Date() }).where(eq(customer.id, id)).returning({ id: customer.id });
  return updated.length > 0;
}
